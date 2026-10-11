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
  for (const [body,status] of [["{",400],["[]",400],['{"action":"create","intake":{},"role":"reviewer"}',400],["x".repeat(16385),413]]) {
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
