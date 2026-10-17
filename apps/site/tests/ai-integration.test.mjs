import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { handlePortal } from '../lib/portal-service.mjs';
import { portalHttp } from '../lib/portal-http.mjs';
import { AI_MODEL, AI_RESERVE_MICROUSD } from '../lib/portal-ai.mjs';

// These are local test subjects injected at the service boundary. They do not
// authenticate against Sites or substitute for a two-account hosted pilot.
const REVIEWER = 'local-test-reviewer', OWNER = 'local-test-client';
const intake = { goal: 'documents', sensitivity: 'normal', external_processing_allowed: true,
  existing_tools: ['Excel'], users: 3, monthly_budget_brl: 0 };
const environment = () => ({ CAMALEAO_AI_ENABLED: 'true', OPENAI_API_KEY: 'local-test-only-not-a-key', CAMALEAO_AI_MODEL: AI_MODEL,
  CAMALEAO_AI_GLOBAL_CAP_MICROUSD: String(AI_RESERVE_MICROUSD * 10), CAMALEAO_AI_CLIENT_CAP_MICROUSD: String(AI_RESERVE_MICROUSD * 10),
  CAMALEAO_AI_PRICE_VALID_UNTIL: new Date(Date.now() + 86400000).toISOString() });
const diagnostic = id => ({ status: 'draft', goal_summary: 'Rascunho interno assistido para três usuários.',
  recommendation: 'Confirmar documentos autorizados e delimitar um piloto com revisão humana.', alternatives: ['Avaliar o processo atual.'],
  missing_information: ['Definir critérios do piloto.'], evidence_refs: [`intake:${id}`], cost_status: 'unverified', human_review: true });
const response = (id, output = diagnostic(id), overrides = {}) => Response.json({ id: 'resp_local_test', model: AI_MODEL, status: 'completed',
  usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
  output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(output) }] }], ...overrides });

// Real SQLite executes deployment SQL and transactions; this only adapts the D1
// method signatures. There are no external requests or account impersonations.
async function database(t, legacy = false) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON');
  const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  for (const name of legacy ? migrations.slice(0, 1) : migrations) sqlite.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  const db = { sqlite, beforeBatch: null, prepare(sql) {
    let values = [];
    const bound = { bind(...args) { values = args; return bound; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
      execute() { return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
      async run() { return bound.execute(); } };
    return bound;
  }, async batch(statements) {
    if (db.beforeBatch) { const hook = db.beforeBatch; db.beforeBatch = null; await hook(); }
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  t.after(() => sqlite.close()); await call(db, REVIEWER, 'session'); return db;
}
const call = (db, subject, operation, body = {}, options = {}) => handlePortal({ db, subject, operation, body,
  reviewerSubject: REVIEWER, ...options });
const rejected = (promise, status, code) => assert.rejects(promise, error => error.status === status && (!code || error.code === code));
async function draft(db, input = intake) {
  const created = (await call(db, OWNER, 'create', { intake: input, idempotency_key: crypto.randomUUID() })).record;
  return (await call(db, OWNER, 'generate', { id: created.id, expected_version: 0, confirm: true })).record;
}
const ai = (db, record, options = {}, body = {}) => call(db, REVIEWER, 'generate_ai', {
  id: record.id, expected_version: record.version, expected_hash: record.hash, operation_id: crypto.randomUUID(), confirm: true, ...body,
}, { aiEnv: environment(), fetcher: async () => response(record.id), ...options });
const revisions = (db, id) => db.sqlite.prepare('SELECT * FROM portal_revisions WHERE intake_id = ? ORDER BY version').all(id);
const ledger = db => db.sqlite.prepare('SELECT * FROM portal_ai_operations ORDER BY created_at, id').all();
async function reviewed(db, record) {
  return (await call(db, REVIEWER, 'review', { id: record.id, expected_version: record.version,
    expected_hash: record.hash, diagnostic: { ...record.diagnostic, recommendation: 'Plano conferido pela revisora da Camaleão.' } })).record;
}
const publish = (db, record) => call(db, REVIEWER, 'publish', { id: record.id, version: record.version, hash: record.hash });
const revoke = (db, record) => call(db, REVIEWER, 'revoke', { id: record.id, version: record.published_version, hash: record.published_hash });
const disable = (db, subject) => db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run(subject);

test('AI domain operation requires trusted reviewer config and explicit confirmation before any spend', async t => {
  const db = await database(t), record = await draft(db); let calls = 0;
  const options = { aiEnv: environment(), fetcher: async () => { calls++; return response(record.id); } };
  const body = { id: record.id, expected_version: 1, expected_hash: record.hash, operation_id: crypto.randomUUID(), confirm: true };
  await rejected(call(db, OWNER, 'generate_ai', body, options), 403, 'reviewer_required');
  await rejected(call(db, REVIEWER, 'generate_ai', body, { ...options, reviewerSubject: '' }), 403, 'reviewer_required');
  await rejected(call(db, REVIEWER, 'generate_ai', { ...body, confirm: false }, options), 400, 'confirmation_required');
  await rejected(call(db, REVIEWER, 'generate_ai', { ...body, role: 'reviewer' }, options), 400, 'invalid_input');
  assert.equal(calls, 0); assert.equal(ledger(db).length, 0); assert.equal(revisions(db, record.id).length, 1);
});

test('AI integration defaults off and never dispatches without exact consent and nonrestricted data', async t => {
  const db = await database(t); let calls = 0;
  const fetcher = async () => { calls++; throw new Error('Must not dispatch'); };
  const enabled = await draft(db);
  await rejected(ai(db, enabled, { aiEnv: {}, fetcher }), 409, 'ai_disabled');
  for (const patch of [{ external_processing_allowed: false }, { sensitivity: 'restricted' }]) {
    const record = await draft(db, { ...intake, ...patch });
    await rejected(ai(db, record, { fetcher }), 403, 'ai_consent_required');
  }
  assert.equal(calls, 0); assert.equal(ledger(db).length, 0);
});

test('AI draft remains internal through human approval, then publishes only its exact approved successor', async t => {
  const db = await database(t), original = await draft(db);
  const prepared = (await ai(db, original)).record;
  assert.equal(prepared.version, 2); assert.equal(prepared.stage, 'draft'); assert.equal(prepared.approval, null);
  assert.deepEqual(prepared.diagnostic, diagnostic(original.id));
  assert.deepEqual(revisions(db, original.id).map(row => row.source), ['deterministic', 'openai']);
  const waiting = (await call(db, OWNER, 'read', { id: original.id })).record;
  assert.equal(waiting.diagnostic, null); assert.equal(waiting.published_diagnostic, null);
  assert.equal((await call(db, OWNER, 'list')).records[0].diagnostic, null);
  await rejected(publish(db, prepared), 409, 'version_conflict');
  const approval = await reviewed(db, prepared);
  assert.equal(approval.version, 3); assert.equal(approval.approval.hash, approval.hash);
  assert.equal((await call(db, OWNER, 'read', { id: original.id })).record.diagnostic, null);
  await publish(db, approval);
  const client = (await call(db, OWNER, 'read', { id: original.id })).record;
  assert.deepEqual(client.published_diagnostic, approval.diagnostic); assert.equal(client.published_hash, approval.approval.hash);
  assert.equal(client.published_version, 3); assert.equal(ledger(db)[0].status, 'attached'); assert.equal(ledger(db)[0].spent_microusd, 45);
  const events = db.sqlite.prepare('SELECT actor_subject,event FROM portal_audit WHERE intake_id = ? ORDER BY rowid').all(original.id);
  assert.deepEqual(events.map(row => row.event), ['intake_created','diagnostic_prepared','diagnostic_ai_prepared','diagnostic_reviewed','diagnostic_published']);
  assert.deepEqual(events.map(row => row.actor_subject), [OWNER, OWNER, REVIEWER, REVIEWER, REVIEWER]);
});

test('HTTP trusts supplied server identity and blocks body/header role escalation without dispatch', async t => {
  const db = await database(t), record = await draft(db); let calls = 0;
  const service = args => handlePortal({ ...args, aiEnv: environment(), fetcher: async () => { calls++; return response(record.id); } });
  const body = { action: 'generate_ai', case_id: record.id, version: 1, hash: record.hash, operation_id: crypto.randomUUID(), confirm: true };
  const post = (subject, patch = {}) => new Request('https://portal.invalid/api/portal', { method: 'POST',
    headers: { Origin: 'https://portal.invalid', 'Content-Type': 'application/json', 'X-Portal-Subject': subject }, body: JSON.stringify({ ...body, ...patch }) });
  const clientUser = { userId: OWNER, displayName: 'Local client fixture' };
  assert.equal((await portalHttp(post(REVIEWER), { user: clientUser, db, reviewerSubject: REVIEWER, service })).status, 409);
  assert.equal((await portalHttp(post(OWNER), { user: clientUser, db, reviewerSubject: REVIEWER, service })).status, 403);
  assert.equal((await portalHttp(post(OWNER, { subject: REVIEWER }), { user: clientUser, db, reviewerSubject: REVIEWER, service })).status, 400);
  assert.equal((await portalHttp(post(REVIEWER), { user: null, db, reviewerSubject: REVIEWER, service })).status, 401);
  const reviewerUser = { userId: REVIEWER, displayName: 'Local reviewer fixture' };
  const result = await portalHttp(post(REVIEWER), { user: reviewerUser, db, reviewerSubject: REVIEWER, service });
  assert.equal(result.status, 200); assert.equal((await result.json()).case.draft.version, 2); assert.equal(calls, 1);
});

test('inactive reviewer or owner membership blocks AI before reservation and request', async t => {
  for (const subject of [REVIEWER, OWNER]) {
    const db = await database(t), record = await draft(db); let calls = 0; disable(db, subject);
    await assert.rejects(ai(db, record, { fetcher: async () => { calls++; return response(record.id); } }), error => [404,409].includes(error.status));
    assert.equal(calls, 0); assert.equal(ledger(db).length, 0); assert.equal(revisions(db, record.id).length, 1);
  }
});

test('membership revocation during provider response records spend and cannot attach a draft', async t => {
  for (const subject of [REVIEWER, OWNER]) {
    const db = await database(t), record = await draft(db);
    await rejected(ai(db, record, { fetcher: async () => { disable(db, subject); return response(record.id); } }), 409, 'ai_authorization_changed');
    assert.equal(revisions(db, record.id).length, 1); assert.equal(ledger(db)[0].status, 'settled'); assert.equal(ledger(db)[0].spent_microusd, 45);
  }
});

test('membership revocation between final authorization check and attachment CAS is enforced atomically', async t => {
  for (const subject of [REVIEWER, OWNER]) {
    const db = await database(t), record = await draft(db);
    await rejected(ai(db, record, { fetcher: async () => {
      db.beforeBatch = () => disable(db, subject); return response(record.id);
    } }), 409, 'version_conflict');
    assert.equal(revisions(db, record.id).length, 1); assert.equal(ledger(db)[0].status, 'settled'); assert.equal(ledger(db)[0].spent_microusd, 45);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event='diagnostic_ai_prepared'").get().n, 0);
  }
});

test('concurrent local generation invalidates paid output without overwriting newer history', async t => {
  const db = await database(t), record = await draft(db); let newer;
  await rejected(ai(db, record, { fetcher: async () => {
    newer = (await call(db, OWNER, 'generate', { id: record.id, expected_version: record.version, confirm: true })).record;
    return response(record.id);
  } }), 409, 'ai_authorization_changed');
  assert.equal(newer.version, 2); assert.equal(revisions(db, record.id).length, 2);
  assert.ok(revisions(db, record.id).every(row => row.source === 'deterministic'));
  assert.equal(ledger(db)[0].status, 'settled'); assert.equal(ledger(db)[0].spent_microusd, 45);
});

test('publication revocation during response invalidates AI attachment even for an unchanged draft', async t => {
  const db = await database(t), initial = await draft(db), approval = await reviewed(db, initial);
  await publish(db, approval);
  const record = (await call(db, OWNER, 'generate', { id: initial.id, expected_version: approval.version, confirm: true })).record;
  await rejected(ai(db, record, { fetcher: async () => {
    await revoke(db, record);
    // Equal timestamps are possible for two writes in the same millisecond.
    // Preserve that schedule explicitly; the operation token still changes.
    db.sqlite.prepare('UPDATE portal_intakes SET updated_at = ? WHERE id = ?').run(record.updated_at, record.id);
    return response(record.id);
  } }), 409, 'ai_authorization_changed');
  assert.equal(revisions(db, record.id).length, 3); assert.equal(ledger(db)[0].status, 'settled');
  const client = (await call(db, OWNER, 'read', { id: record.id })).record;
  assert.equal(client.published_diagnostic, null); assert.equal(client.publication_revoked, true);
});

test('malformed model diagnostics and unverifiable evidence settle known cost without internal drafts', async t => {
  for (const mutate of [value => ({ ...value, human_review: false }), value => ({ ...value, unexpected: true }),
    value => ({ ...value, evidence_refs: [] }), value => ({ ...value, evidence_refs: ['https://invented.invalid/evidence'] }),
    value => ({ ...value, evidence_refs: ['intake:another-case'] }), value => ({ ...value, evidence_refs: [...value.evidence_refs, ...value.evidence_refs] })]) {
    const db = await database(t), record = await draft(db);
    await assert.rejects(ai(db, record, { fetcher: async () => response(record.id, mutate(diagnostic(record.id))) }),
      error => ['invalid_input','ai_invalid_evidence'].includes(error.code));
    assert.equal(revisions(db, record.id).length, 1); assert.equal(ledger(db)[0].status, 'settled'); assert.equal(ledger(db)[0].spent_microusd, 45);
  }
});

test('unexpected provider model fails closed with retained reservation and no draft', async t => {
  const db = await database(t), record = await draft(db);
  await rejected(ai(db, record, { fetcher: async () => response(record.id, diagnostic(record.id), { model: 'unapproved-model' }) }), 409, 'ai_usage_unknown');
  assert.equal(revisions(db, record.id).length, 1); assert.equal(ledger(db)[0].status, 'unknown'); assert.equal(ledger(db)[0].reserved_microusd, AI_RESERVE_MICROUSD);
});

test('reviewer reconciles one unknown result at its reserved ceiling without a provider call or replay', async t => {
  const db = await database(t), record = await draft(db), operationId = crypto.randomUUID();
  let calls = 0;
  await rejected(ai(db, record, { fetcher: async () => { calls++; throw new Error('provider result unavailable'); } },
    { operation_id: operationId }), 409, 'ai_outcome_unknown');
  const disabled = { CAMALEAO_AI_ENABLED: 'false', CAMALEAO_AI_RECONCILE_OPERATION_ID: operationId };
  assert.equal((await call(db, REVIEWER, 'session', {}, { aiEnv: disabled })).pending_ai.id, operationId);
  assert.equal((await call(db, OWNER, 'session', {}, { aiEnv: disabled })).pending_ai, null);
  await rejected(call(db, OWNER, 'reconcile_ai', { operation_id: operationId, confirm: true }, { aiEnv: disabled }), 403, 'reviewer_required');
  await rejected(call(db, REVIEWER, 'reconcile_ai', { operation_id: operationId, confirm: false }, { aiEnv: disabled }), 400, 'confirmation_required');
  await rejected(call(db, REVIEWER, 'reconcile_ai', { operation_id: operationId, confirm: true },
    { aiEnv: { ...disabled, CAMALEAO_AI_ENABLED: 'true' } }), 409, 'reconciliation_disabled');
  db.sqlite.exec(`CREATE TRIGGER abort_ai_reconciliation BEFORE INSERT ON portal_audit
    WHEN NEW.event = 'ai_unknown_reconciled_ceiling' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`);
  await assert.rejects(call(db, REVIEWER, 'reconcile_ai', { operation_id: operationId, confirm: true }, { aiEnv: disabled }));
  assert.equal(ledger(db)[0].status, 'unknown');
  db.sqlite.exec('DROP TRIGGER abort_ai_reconciliation');
  const result = await call(db, REVIEWER, 'reconcile_ai', { operation_id: operationId, confirm: true }, { aiEnv: disabled });
  assert.equal(result.record.version, record.version);
  const booked = ledger(db)[0];
  assert.equal(booked.status, 'settled'); assert.equal(booked.spent_microusd, AI_RESERVE_MICROUSD);
  assert.equal(booked.error_code, 'reconciled_ceiling_unverified'); assert.equal(booked.provider_response_id, null);
  assert.equal((await call(db, REVIEWER, 'session', {}, { aiEnv: disabled })).pending_ai, null);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event='ai_unknown_reconciled_ceiling'").get().n, 1);
  await rejected(call(db, REVIEWER, 'reconcile_ai', { operation_id: operationId, confirm: true }, { aiEnv: disabled }), 409, 'reconciliation_conflict');
  assert.equal(calls, 1); assert.equal(revisions(db, record.id).length, 1);
});

test('migration preserves existing publication, approval, revision and audit history with foreign keys enabled', async t => {
  const db = await database(t, true), original = await draft(db), approval = await reviewed(db, original);
  await publish(db, approval);
  const tables = ['portal_intakes','portal_revisions','portal_approvals','portal_audit','portal_memberships'];
  const snapshot = () => Object.fromEntries(tables.map(table => [table, db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const before = snapshot();
  for (const name of (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => name.endsWith('.sql')).sort().slice(1))
    db.sqlite.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  assert.deepEqual(snapshot(), before); assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  const client = (await call(db, OWNER, 'read', { id: original.id })).record;
  assert.equal(client.published_version, approval.version); assert.equal(client.published_hash, approval.hash); assert.deepEqual(client.published_diagnostic, approval.diagnostic);
  assert.equal(ledger(db).length, 0);
  const fresh = await draft(db); assert.equal((await ai(db, fresh)).record.version, 2);
});
