import { test } from "node:test";
import assert from "node:assert/strict";
import { portalHttp } from "../lib/portal-http.mjs";

const user={userId:"client-a",displayName:"Cliente A"};
const url="https://infra.camaleaoweb3.com.br/api/portal";
const db={};
const service=()=>{throw new Error("Must not reach business service");};
const post=(body,headers={})=>new Request(url,{method:"POST",headers:{Origin:new URL(url).origin,"Content-Type":"application/json","X-Portal-Subject":user.userId,...headers},body});
test("missing identity is rejected before reading storage",async()=>{
  assert.equal((await portalHttp(new Request(url),{user:null,db,service})).status,401);
});
test("cross-origin, absent origin, fetch metadata and non JSON writes fail closed",async()=>{
  for(const headers of [{Origin:"https://evil.example"},{Origin:""},{"Sec-Fetch-Site":"cross-site"},{"Content-Type":"text/plain"}]) {
    const r=await portalHttp(post('{}',headers),{user,db,service});assert.ok([403,415].includes(r.status));
  }
});
test("malformed, oversized and forged role bodies never reach service",async()=>{
  for (const [body,status] of [["{",400],["[]",400],['{"action":"create","intake":{},"role":"reviewer"}',400],["x".repeat(640 * 1024 + 1),413]]) {
    assert.equal((await portalHttp(post(body),{user,db,service})).status,status);
  }
});
test("trusted subject and exact action mapping reach service",async()=>{
  let received;
  const r=await portalHttp(post(JSON.stringify({action:"publish",case_id:"p",version:2,hash:"h"})),
    {user,db,reviewerSubject:"r",service:async args=>{received=args;return {record:{id:"p",stage:"published",version:2,hash:"h"}};}});
  assert.equal(r.status,200);assert.equal(received.subject,"client-a");
  assert.deepEqual(received.body,{id:"p",version:2,hash:"h"});
  assert.equal(r.headers.get("cache-control"),"private, no-store");
});
test("internal errors do not expose secrets",async()=>{
  const r=await portalHttp(new Request(url),{user,db,service:()=>{throw new Error("secret-token");}});
  assert.equal(r.status,503);assert.ok(!(await r.text()).includes("secret-token"));
});


test('missing or changed expected identity blocks mutation before domain service', async () => {
  for (const expected of ['', 'other-client']) {
    const response = await portalHttp(post(JSON.stringify({ action: 'revoke', case_id: 'p', version: 2, hash: 'h' }), { 'X-Portal-Subject': expected }), { user, db, service });
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'session_changed');
  }
});

test('revocation maps the exact published version and hash to the trusted service', async () => {
  let received;
  const response = await portalHttp(post(JSON.stringify({ action: 'revoke', case_id: 'p', version: 2, hash: 'h' })), {
    user, db, service: async args => { received = args; return { record: { id: 'p', stage: 'draft', version: 2, hash: 'h', publication_revoked: true } }; },
  });
  assert.equal(response.status, 200); assert.equal(received.operation, 'revoke');
  assert.deepEqual(received.body, { id: 'p', version: 2, hash: 'h' });
  assert.equal((await response.json()).case.publication_revoked, true);
});

test('reconciliation requires exact HTTP fields and routes through the trusted identity', async () => {
  let received;
  const payload = { action: 'reconcile_ai', operation_id: 'local-operation', confirm: true };
  const options = { user, db, service: async args => { received = args; return { record: { id: 'case', stage: 'draft', version: 1, hash: 'hash' } }; } };
  assert.equal((await portalHttp(post(JSON.stringify({ ...payload, spent_microusd: 0 })), options)).status, 400);
  assert.equal((await portalHttp(post(JSON.stringify(payload)), options)).status, 200);
  assert.equal(received.subject, user.userId);
  assert.equal(received.operation, 'reconcile_ai');
  assert.deepEqual(received.body, { operation_id: payload.operation_id, confirm: true });
});


test('GET accepts one cursor only and rejects extra or repeated query parameters before service', async () => {
  for (const query of ['?offset=25', '?limit=100', '?cursor=', '?cursor=a&cursor=b', '?cursor=a&role=reviewer', '?url=https://provider.invalid']) {
    const response = await portalHttp(new Request(url + query), { user, db, service });
    assert.equal(response.status, 400); assert.equal((await response.json()).code, 'invalid_query');
  }
  const cursor = '2026-10-17T10:00:00.000Z|12345678-1234-4123-8123-123456789012';
  const received = [];
  const response = await portalHttp(new Request(url + '?' + new URLSearchParams({ cursor })), { user, db,
    service: async args => { received.push(args); return args.operation === 'session' ? { role: 'client' } : { records: [], nextCursor: cursor }; },
  });
  assert.equal(response.status, 200); assert.deepEqual(received[1].body, { cursor });
  assert.equal((await response.json()).nextCursor, cursor);
});
