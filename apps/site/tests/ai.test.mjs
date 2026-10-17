import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AI_MODEL, AI_RESERVE_MICROUSD, aiReadiness, buildAiRequest, runAiDiagnostic } from '../lib/portal-ai.mjs';
import { validateDiagnostic } from '../lib/portal-service.mjs';

const intake = { goal: 'documents', sensitivity: 'normal', external_processing_allowed: true, existing_tools: ['Excel'], users: 3, monthly_budget_brl: 0 };
const diagnostic = { status: 'draft', goal_summary: 'Documentos para três usuários.', recommendation: 'Validar um piloto restrito com revisão humana.',
  alternatives: ['Manter a rotina atual.'], missing_information: ['Confirmar os documentos autorizados.'], evidence_refs: ['intake:case-a'], cost_status: 'unverified', human_review: true };
const environment = () => ({ CAMALEAO_AI_ENABLED: 'true', OPENAI_API_KEY: 'test-only-never-a-real-key', CAMALEAO_AI_MODEL: AI_MODEL,
  CAMALEAO_AI_GLOBAL_CAP_MICROUSD: String(AI_RESERVE_MICROUSD * 10), CAMALEAO_AI_CLIENT_CAP_MICROUSD: String(AI_RESERVE_MICROUSD * 10),
  CAMALEAO_AI_PRICE_VALID_UNTIL: new Date(Date.now() + 86400000).toISOString() });
const envelope = changes => ({ id: 'resp_test', model: AI_MODEL, status: 'completed', usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
  output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(diagnostic) }] }], ...changes });
const response = changes => Response.json(envelope(changes));
async function database(path = ':memory:', initialize = true) {
  const sqlite = new DatabaseSync(path); sqlite.exec('PRAGMA foreign_keys=ON');
  if (initialize) for (const file of (await readdir(new URL('../drizzle/', import.meta.url))).filter(x => x.endsWith('.sql')).sort())
    sqlite.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { sqlite, prepare(sql) { let values = []; const bound = {
    bind(...args) { values = args; return bound; }, async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
    async run() { return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
  }; return bound; } };
  if (initialize) {
    for (const subject of ['reviewer', 'owner', 'other-owner']) sqlite.prepare('INSERT INTO portal_memberships VALUES (?, ?, 1, ?)').run(subject, subject, new Date().toISOString());
    for (const [id, owner] of [['case-a', 'owner'], ['case-b', 'owner'], ['case-c', 'other-owner']]) sqlite.prepare(`INSERT INTO portal_intakes
      (id,tenant_id,owner_subject,intake_json,stage,version,hash,operation_token,created_at,updated_at) VALUES (?, ?, ?, ?, 'draft', 1, ?, 'seed', ?, ?)`)
      .run(id, owner, owner, JSON.stringify(intake), 'a'.repeat(64), new Date().toISOString(), new Date().toISOString());
  }
  return db;
}
const operation = (db, overrides = {}) => runAiDiagnostic({ db, env: environment(), subject: 'reviewer', ownerSubject: 'owner', caseId: 'case-a', expectedVersion: 1,
  expectedHash: 'a'.repeat(64), operationId: crypto.randomUUID(), intake, stillAuthorized: async () => true, attach: async value => validateDiagnostic(value), fetcher: async () => response(), ...overrides });
const reject = (promise, code) => assert.rejects(promise, error => error.code === code);
const row = db => db.sqlite.prepare('SELECT * FROM portal_ai_operations ORDER BY created_at LIMIT 1').get();
async function setup(t) { const db = await database(); t.after(() => db.sqlite.close()); return db; }

test('readiness fails closed for absent flags, credentials, aliases, malformed caps and stale pricing', () => {
  assert.equal(aiReadiness().enabled, false); assert.equal(aiReadiness(environment()).enabled, true);
  for (const patch of [{ CAMALEAO_AI_ENABLED: 'TRUE' }, { OPENAI_API_KEY: '' }, { CAMALEAO_AI_MODEL: 'gpt-5.4-mini' },
    { CAMALEAO_AI_GLOBAL_CAP_MICROUSD: 1000000 }, { CAMALEAO_AI_CLIENT_CAP_MICROUSD: '0' }, { CAMALEAO_AI_GLOBAL_CAP_MICROUSD: '9007199254740992' },
    { CAMALEAO_AI_PRICE_VALID_UNTIL: new Date(Date.now() - 1000).toISOString() }, { CAMALEAO_AI_PRICE_VALID_UNTIL: new Date(Date.now() + 31 * 86400000).toISOString() }])
    assert.equal(aiReadiness({ ...environment(), ...patch }).enabled, false);
});
test('default disabled and missing consent make zero network requests and zero reservations', async t => {
  const db = await setup(t); let requests = 0;
  const fetcher = async () => { requests++; return response(); };
  await reject(operation(db, { env: {}, fetcher }), 'ai_disabled');
  for (const changed of [{ external_processing_allowed: false }, { sensitivity: 'restricted' }])
    await reject(operation(db, { intake: { ...intake, ...changed }, fetcher }), 'ai_consent_required');
  assert.equal(requests, 0); assert.equal(row(db), undefined);
});
test('request fixes snapshot, endpoint, no storage, no tools, structured output and lifetime accounting', async t => {
  const db = await setup(t); let captured;
  const result = await operation(db, { fetcher: async (url, options) => { captured = { url, options }; return response(); } });
  assert.deepEqual(result, diagnostic); assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, AI_MODEL); assert.equal(body.store, false); assert.equal(body.service_tier, 'default'); assert.equal(body.max_output_tokens, 1024);
  assert.deepEqual(body.reasoning, { effort: 'none' }); assert.equal(body.tools, undefined); assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false); assert.equal(Object.keys(body.text.format.schema.properties).length, 8);
  assert.deepEqual(body, buildAiRequest(intake, 'case-a')); assert.equal(captured.options.redirect, 'error'); assert.equal(captured.options.signal instanceof AbortSignal, true);
  assert.equal(row(db).reserved_microusd, 304608); assert.equal(row(db).spent_microusd, 45); assert.equal(row(db).status, 'attached');
});
test('atomic global reservation permits one concurrent dispatch and refuses the last insufficient balance', async t => {
  const db = await setup(t); let release, entered;
  const started = new Promise(resolve => { entered = resolve; }), wait = new Promise(resolve => { release = resolve; });
  let requests = 0; const env = { ...environment(), CAMALEAO_AI_GLOBAL_CAP_MICROUSD: String(AI_RESERVE_MICROUSD) };
  const first = operation(db, { env, fetcher: async () => { requests++; entered(); await wait; return response(); } });
  await started;
  await reject(operation(db, { env, caseId: 'case-b' }), 'ai_budget_or_pending');
  release(); await first;
  await reject(operation(db, { env, caseId: 'case-b' }), 'ai_budget_or_pending');
  assert.equal(requests, 1);
});
test('owner lifetime cap cannot be bypassed with another case; another owner has its own allowance', async t => {
  const db = await setup(t), env = { ...environment(), CAMALEAO_AI_CLIENT_CAP_MICROUSD: String(AI_RESERVE_MICROUSD) };
  await operation(db, { env }); await reject(operation(db, { env, caseId: 'case-b' }), 'ai_budget_or_pending');
  await operation(db, { env, caseId: 'case-c', ownerSubject: 'other-owner' });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_ai_operations').get().n, 2);
});
test('operation key and base-version uniqueness survive restart and prohibit automatic retry under a new key', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'camaleao-ai-')); t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'ledger.sqlite'), id = crypto.randomUUID(); let db = await database(path);
  await operation(db, { operationId: id }); db.sqlite.close(); db = await database(path, false); t.after(() => db.sqlite.close());
  let requests = 0; const fetcher = async () => { requests++; return response(); };
  await reject(operation(db, { operationId: id, fetcher }), 'ai_already_requested');
  await reject(operation(db, { operationId: id, intake: { ...intake, users: 4 }, fetcher }), 'ai_idempotency_conflict');
  await reject(operation(db, { fetcher }), 'ai_already_requested'); assert.equal(requests, 0);
});
test('transport ambiguity, HTTP errors, oversized body and missing usage retain reserve and global lock', async t => {
  for (const fetcher of [async () => { throw new DOMException('test timeout', 'AbortError'); }, async () => new Response('untrusted-secret-error', { status: 429 }),
    async () => new Response('x'.repeat(65537)), async () => response({ usage: null }), async () => response({ usage: { input_tokens: 400001, output_tokens: 1, total_tokens: 400002 } })]) {
    const db = await setup(t); let attachments = 0;
    await assert.rejects(operation(db, { fetcher, attach: async () => attachments++ }), error => ['ai_outcome_unknown', 'ai_usage_unknown'].includes(error.code));
    assert.equal(row(db).status, 'unknown'); assert.equal(row(db).reserved_microusd, AI_RESERVE_MICROUSD); assert.equal(attachments, 0);
    await reject(operation(db, { caseId: 'case-b' }), 'ai_budget_or_pending');
    assert.doesNotMatch(JSON.stringify(row(db)), /untrusted-secret-error|test-only-never-a-real-key/);
  }
});
test('known usage is settled on refusal, incomplete output or invalid JSON without attaching', async t => {
  for (const changes of [{ output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'test' }] }] },
    { status: 'incomplete' }, { output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{invalid' }] }] }]) {
    const db = await setup(t); let attachments = 0;
    await reject(operation(db, { fetcher: async () => response(changes), attach: async () => attachments++ }), 'ai_unusable_output');
    assert.equal(attachments, 0); assert.equal(row(db).status, 'settled'); assert.equal(row(db).spent_microusd, 45);
  }
});
test('revoked permission before dispatch costs zero, after provider costs recorded and never attaches', async t => {
  for (const allowedChecks of [1, 2]) {
    const db = await setup(t); let checks = 0, requests = 0, attachments = 0;
    await reject(operation(db, { stillAuthorized: async () => ++checks <= allowedChecks, fetcher: async () => { requests++; return response(); }, attach: async () => attachments++ }), 'ai_authorization_changed');
    assert.equal(attachments, 0); assert.equal(requests, allowedChecks === 1 ? 0 : 1);
    assert.equal(row(db).spent_microusd, allowedChecks === 1 ? 0 : 45); assert.equal(row(db).status, 'settled');
  }
});
test('domain validation and failed CAS preserve settled provider spend', async t => {
  for (const attach of [async () => validateDiagnostic({ ...diagnostic, human_review: false }), async () => { throw Object.assign(new Error('stale'), { code: 'version_conflict' }); }]) {
    const db = await setup(t); await assert.rejects(operation(db, { attach })); assert.equal(row(db).status, 'settled'); assert.equal(row(db).spent_microusd, 45);
  }
});
test('bounded UTF-8 payload fails before authorization, reservation or provider call', async t => {
  const db = await setup(t); let requests = 0;
  await reject(operation(db, { intake: { ...intake, existing_tools: ['á'.repeat(10000)] }, fetcher: async () => { requests++; return response(); } }), 'ai_payload_too_large');
  assert.equal(requests, 0); assert.equal(row(db), undefined);
});
