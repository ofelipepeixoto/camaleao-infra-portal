import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePortal, validateIntake, validateDiagnostic, canonicalJson } from '../lib/portal-service.mjs';
import { portalHttp } from '../lib/portal-http.mjs';

const migrationDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));
const intake = { goal: 'documents', sensitivity: 'normal', external_processing_allowed: false, existing_tools: ['Excel'], users: 3, monthly_budget_brl: null };
const REVIEWER = 'trusted-camaleao-reviewer';
// Thin D1 adapter over real SQLite. Batch rollback, FKs and disk persistence are
// exercised against the committed deployment migration, not a mock database.
async function database(path = ':memory:', initialize = true) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (initialize) for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort())
    sqlite.exec(await readFile(join(migrationDirectory, name), 'utf8'));
  const adapter = {
    sqlite,
    beforeBatch: null,
    prepare(sql) {
      let values = [];
      const bound = {
        bind(...args) { values = args; return bound; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
        execute() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
        async run() { return bound.execute(); },
      };
      return bound;
    },
    async batch(statements) {
      if (adapter.beforeBatch) { const hook = adapter.beforeBatch; adapter.beforeBatch = null; await hook(); }
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close() { sqlite.close(); },
  };
  return adapter;
}
const call = (db, subject, operation, body = {}, reviewerSubject = REVIEWER) => handlePortal({ db, subject, operation, body: operation === 'create' && !Object.hasOwn(body, 'idempotency_key') ? { ...body, idempotency_key: crypto.randomUUID() } : body, reviewerSubject });
const rejection = (promise, status, code) => assert.rejects(promise, error => error.status === status && (!code || error.code === code));
async function setup(t) { const db = await database(); t.after(() => db.close()); await call(db, REVIEWER, 'session'); return db; }
async function draft(db, subject = 'client-a') {
  const created = (await call(db, subject, 'create', { intake })).record;
  return (await call(db, subject, 'generate', { id: created.id, expected_version: 0, confirm: true })).record;
}
async function review(db, record) {
  const diagnostic = { ...record.diagnostic, recommendation: 'Plano revisado pela Camaleão com piloto delimitado.' };
  return (await call(db, REVIEWER, 'review', { id: record.id, expected_version: record.version, expected_hash: record.hash, diagnostic })).record;
}

test('strict intake and human diagnostic validation rejects credentials, coercion and extra fields', () => {
  assert.deepEqual(validateIntake(intake), intake);
  for (const invalid of [{ ...intake, api_key: 'never-accepted' }, { ...intake, users: true }, { ...intake, monthly_budget_brl: '50' },
    { ...intake, existing_tools: [' '] }, { ...intake, users: 100001 }, { ...intake, external_processing_allowed: 'yes' }])
    assert.throws(() => validateIntake(invalid), error => error.status === 400);
  assert.equal(canonicalJson({ z: 1, a: { c: 3, b: 2 } }), '{"a":{"b":2,"c":3},"z":1}');
  assert.throws(() => validateDiagnostic({ status: 'draft' }), error => error.status === 400);
});

test('authenticated intake generates locally only after explicit confirmation', async t => {
  const db = await setup(t);
  await rejection(call(db, null, 'list'), 401);
  const session = await call(db, 'client-a', 'session');
  assert.equal(session.role, 'client'); assert.equal(session.membership_active, false); assert.equal(session.paid_api_enabled, false);
  const record = (await call(db, 'client-a', 'create', { intake })).record;
  assert.equal(record.stage, 'submitted'); assert.equal(record.version, 0);
  await rejection(call(db, 'client-a', 'generate', { id: record.id, expected_version: 0, confirm: false }), 400, 'confirmation_required');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_revisions').get().n, 0);
  const prepared = (await call(db, 'client-a', 'generate', { id: record.id, expected_version: 0, confirm: true })).record;
  assert.equal(prepared.stage, 'draft'); assert.equal(prepared.version, 1); assert.match(prepared.hash, /^[a-f0-9]{64}$/);
  assert.equal(prepared.diagnostic.cost_status, 'unverified'); assert.equal(prepared.published_diagnostic, null);
  assert.equal((await call(db, 'client-a', 'session')).membership_active, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_audit').get().n, 2);
});

test('client isolation applies to reads, lists, mutations and body tenant spoofing', async t => {
  const db = await setup(t), a = await draft(db), b = await draft(db, 'client-b');
  const listed = (await call(db, 'client-b', 'list')).records;
  assert.equal(listed.length, 1); assert.equal(listed[0].id, b.id); assert.deepEqual(listed[0].intake, intake);
  await rejection(call(db, 'client-b', 'read', { id: a.id }), 404);
  await rejection(call(db, 'client-b', 'generate', { id: a.id, expected_version: 1, confirm: true }), 404);
  await rejection(call(db, 'client-b', 'create', { intake, tenant_id: 'client-a' }), 400);
  assert.equal((await call(db, REVIEWER, 'list')).records.length, 2);
});

test('reviewer is explicit trusted config, never first login or caller-supplied role', async t => {
  const db = await setup(t), record = await draft(db);
  assert.equal((await call(db, 'first-login', 'session')).role, 'client');
  await rejection(call(db, 'client-a', 'review', { id: record.id, expected_version: record.version, expected_hash: record.hash, diagnostic: record.diagnostic }), 403);
  await rejection(call(db, 'client-a', 'publish', { id: record.id, version: record.version, hash: record.hash }), 403);
  const noReviewer = await call(db, REVIEWER, 'session', {}, '');
  assert.equal(noReviewer.role, 'client');
  await rejection(call(db, 'client-a', 'session', { role: 'reviewer' }), 400);
});

test('human review creates immutable version and clients see its exact content only on publication', async t => {
  const db = await setup(t), original = await draft(db), reviewed = await review(db, original);
  assert.equal(reviewed.version, 2); assert.equal(reviewed.stage, 'reviewed'); assert.notEqual(reviewed.hash, original.hash);
  assert.equal(reviewed.approval.version, 2); assert.equal(reviewed.approval.hash, reviewed.hash);
  const waiting = (await call(db, 'client-a', 'read', { id: original.id })).record;
  assert.equal(waiting.diagnostic, null); assert.equal(waiting.published_diagnostic, null);
  const persistedOriginal = db.sqlite.prepare('SELECT diagnostic_json, hash FROM portal_revisions WHERE intake_id = ? AND version = 1').get(original.id);
  assert.equal(persistedOriginal.hash, original.hash); assert.deepEqual(JSON.parse(persistedOriginal.diagnostic_json), original.diagnostic);
  const published = (await call(db, REVIEWER, 'publish', { id: reviewed.id, version: reviewed.version, hash: reviewed.hash })).record;
  const client = (await call(db, 'client-a', 'read', { id: original.id })).record;
  assert.equal(published.stage, 'published'); assert.equal(client.published_version, reviewed.version);
  assert.equal(client.published_hash, reviewed.hash); assert.deepEqual(client.diagnostic, reviewed.diagnostic); assert.deepEqual(client.published_diagnostic, reviewed.diagnostic);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_revisions').get().n, 2);
});

test('publish rejects absent review, changed content hash and outdated version', async t => {
  const db = await setup(t), record = await draft(db);
  await rejection(call(db, REVIEWER, 'publish', { id: record.id, version: 1, hash: record.hash }), 409);
  const reviewed = await review(db, record);
  await rejection(call(db, REVIEWER, 'publish', { id: record.id, version: 1, hash: record.hash }), 409);
  await rejection(call(db, REVIEWER, 'publish', { id: record.id, version: reviewed.version, hash: '0'.repeat(64) }), 409);
  const newer = (await call(db, 'client-a', 'generate', { id: record.id, expected_version: 2, confirm: true })).record;
  assert.equal(newer.version, 3);
  await rejection(call(db, REVIEWER, 'publish', { id: record.id, version: reviewed.version, hash: reviewed.hash }), 409);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event = 'diagnostic_published'").get().n, 0);
});

test('removed membership cannot bootstrap again or access already owned records', async t => {
  const db = await setup(t), record = await draft(db);
  db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run('client-a');
  await rejection(call(db, 'client-a', 'read', { id: record.id }), 404);
  await rejection(call(db, 'client-a', 'list'), 403);
  await rejection(call(db, 'client-a', 'create', { intake }), 403);
  assert.equal((await call(db, 'client-a', 'session')).membership_active, false);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_intakes').get().n, 1);
  db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run(REVIEWER);
  assert.equal((await call(db, REVIEWER, 'session')).membership_active, false);
  await rejection(call(db, REVIEWER, 'review', { id: record.id, expected_version: record.version, expected_hash: record.hash, diagnostic: record.diagnostic }), 404);
});

test('membership is checked within atomic write after preparation race', async t => {
  const db = await setup(t), record = await draft(db);
  db.beforeBatch = async () => { db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run('client-a'); };
  await rejection(call(db, 'client-a', 'generate', { id: record.id, expected_version: 1, confirm: true }), 409);
  assert.equal(db.sqlite.prepare('SELECT version FROM portal_intakes WHERE id = ?').get(record.id).version, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_revisions').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_audit').get().n, 2);
});

test('concurrent generation CAS permits one durable version and one audit event', async t => {
  const db = await setup(t), record = await draft(db);
  const results = await Promise.allSettled([call(db, 'client-a', 'generate', { id: record.id, expected_version: 1, confirm: true }), call(db, 'client-a', 'generate', { id: record.id, expected_version: 1, confirm: true })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_revisions').get().n, 2);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_audit').get().n, 3);
});

test('create retries are durable, scoped, payload-bound and concurrent-safe', async t => {
  const db = await setup(t), key = crypto.randomUUID(), body = { intake, idempotency_key: key };
  const results = await Promise.all([call(db, 'client-a', 'create', body), call(db, 'client-a', 'create', body)]);
  assert.equal(results[0].record.id, results[1].record.id);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_intakes').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_audit').get().n, 1);
  await rejection(call(db, 'client-a', 'create', { intake: { ...intake, users: 4 }, idempotency_key: key }), 409, 'idempotency_conflict');
  const other = (await call(db, 'client-b', 'create', body)).record;
  assert.notEqual(other.id, results[0].record.id);
  db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run('client-a');
  await rejection(call(db, 'client-a', 'create', body), 403);
});

test('concurrent publication consumes the reviewed state once and records one audit event', async t => {
  const db = await setup(t), reviewed = await review(db, await draft(db));
  const body = { id: reviewed.id, version: reviewed.version, hash: reviewed.hash };
  const results = await Promise.allSettled([call(db, REVIEWER, 'publish', body), call(db, REVIEWER, 'publish', body)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event = 'diagnostic_published'").get().n, 1);
  const record = (await call(db, 'client-a', 'read', { id: reviewed.id })).record;
  assert.equal(record.published_version, reviewed.version); assert.equal(record.published_hash, reviewed.hash);
});

for (const competingOperation of ['generate', 'review']) {
  test(`${competingOperation} racing publication never publishes an unapproved or different version`, async t => {
    const db = await setup(t), reviewed = await review(db, await draft(db));
    const competing = competingOperation === 'generate'
      ? () => call(db, 'client-a', 'generate', { id: reviewed.id, expected_version: reviewed.version, confirm: true })
      : () => call(db, REVIEWER, 'review', { id: reviewed.id, expected_version: reviewed.version, expected_hash: reviewed.hash,
        diagnostic: { ...reviewed.diagnostic, recommendation: 'Segunda revisão, ainda sem publicação.' } });
    const results = await Promise.allSettled([competing(), call(db, REVIEWER, 'publish', { id: reviewed.id, version: reviewed.version, hash: reviewed.hash })]);
    assert.equal(results[0].status, 'fulfilled');
    const record = (await call(db, REVIEWER, 'read', { id: reviewed.id })).record;
    assert.equal(record.version, 3); assert.notEqual(record.stage, 'published');
    if (record.published_version !== null) {
      assert.equal(record.published_version, reviewed.version); assert.equal(record.published_hash, reviewed.hash);
      assert.deepEqual(record.published_diagnostic, reviewed.diagnostic);
    } else {
      assert.equal(record.published_hash, null); assert.equal(results[1].status, 'rejected'); assert.equal(results[1].reason.status, 409);
    }
    const publications = db.sqlite.prepare("SELECT version, hash FROM portal_audit WHERE event = 'diagnostic_published'").all();
    assert.ok(publications.every(event => event.version === reviewed.version && event.hash === reviewed.hash));
  });
}

test('reviewer revocation between reading and committing blocks both review and publication', async t => {
  const db = await setup(t), record = await draft(db);
  const revoke = async () => { db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run(REVIEWER); };
  db.beforeBatch = revoke;
  await rejection(review(db, record), 409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_approvals').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_revisions').get().n, 1);
  db.sqlite.prepare('UPDATE portal_memberships SET active = 1 WHERE subject = ?').run(REVIEWER);
  const reviewed = await review(db, record);
  db.beforeBatch = revoke;
  await rejection(call(db, REVIEWER, 'publish', { id: reviewed.id, version: reviewed.version, hash: reviewed.hash }), 409);
  const row = db.sqlite.prepare('SELECT stage, published_version FROM portal_intakes WHERE id = ?').get(record.id);
  assert.equal(row.stage, 'reviewed'); assert.equal(row.published_version, null);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event = 'diagnostic_published'").get().n, 0);
});

test('audit failure rolls back current pointer, new revision and approval together', async t => {
  const db = await setup(t), record = await draft(db);
  db.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON portal_audit WHEN NEW.event = 'diagnostic_reviewed' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
  await assert.rejects(review(db, record), /test audit failure/);
  assert.equal(db.sqlite.prepare('SELECT version, stage FROM portal_intakes WHERE id = ?').get(record.id).version, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_revisions').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_approvals').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_audit').get().n, 2);
});

test('published history persists across reopening the database and a later draft', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'camaleao-portal-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'portal.sqlite'); let db = await database(path);
  await call(db, REVIEWER, 'session'); const original = await draft(db), reviewed = await review(db, original);
  await call(db, REVIEWER, 'publish', { id: reviewed.id, version: reviewed.version, hash: reviewed.hash });
  db.close(); db = await database(path, false); t.after(() => db.close());
  const persisted = (await call(db, 'client-a', 'read', { id: original.id })).record;
  assert.deepEqual(persisted.published_diagnostic, reviewed.diagnostic); assert.equal(persisted.published_hash, reviewed.hash);
  const newDraft = (await call(db, 'client-a', 'generate', { id: original.id, expected_version: 2, confirm: true })).record;
  assert.equal(newDraft.stage, 'draft'); assert.equal(newDraft.published_version, 2); assert.deepEqual(newDraft.published_diagnostic, reviewed.diagnostic);
});

test('real SQLite HTTP journey maps intake, preparation, human review and exact publication for the UI', async t => {
  const db = await database(); t.after(() => db.close());
  const url = 'https://infra.camaleaoweb3.com.br/api/portal';
  const http = async (subject, body) => {
    const request = new Request(url, body ? { method: 'POST', headers: { Origin: new URL(url).origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', 'X-Portal-Subject': subject }, body: JSON.stringify(body) } : {});
    const response = await portalHttp(request, { user: { userId: subject, displayName: subject }, db, reviewerSubject: REVIEWER, service: handlePortal });
    return { status: response.status, payload: await response.json() };
  };
  const empty = await http('new-client'); assert.equal(empty.status, 200); assert.deepEqual(empty.payload.cases, []);
  const reviewer = await http(REVIEWER); assert.equal(reviewer.status, 200); assert.equal(reviewer.payload.role, 'reviewer');
  const created = await http('new-client', { action: 'create', intake, idempotency_key: crypto.randomUUID() });
  assert.equal(created.status, 201); const first = created.payload.case; assert.equal(first.version, 0); assert.equal(first.status, 'intake');
  const generated = await http('new-client', { action: 'generate', case_id: first.id, version: first.version, confirm: true });
  assert.equal(generated.status, 200); const prepared = generated.payload.case; assert.equal(prepared.version, 1); assert.ok(prepared.draft.content);
  const approved = await http(REVIEWER, { action: 'review', case_id: prepared.id, version: prepared.version, hash: prepared.hash,
    diagnostic: { ...prepared.draft.content, recommendation: 'Piloto de documentos revisado pela Camaleão.' } });
  assert.equal(approved.status, 200); const reviewed = approved.payload.case; assert.equal(reviewed.version, 2); assert.equal(reviewed.status, 'reviewed');
  assert.equal((await http('new-client')).payload.cases[0].draft, null);
  const publication = await http(REVIEWER, { action: 'publish', case_id: reviewed.id, version: reviewed.version, hash: reviewed.hash });
  assert.equal(publication.status, 200);
  const final = await http('new-client'); assert.equal(final.status, 200); const published = final.payload.cases[0].published;
  assert.equal(published.version, reviewed.version); assert.equal(published.hash, reviewed.hash); assert.deepEqual(published.content, reviewed.draft.content);
});


async function publish(db, subject = 'client-a') {
  const record = await review(db, await draft(db, subject));
  return (await call(db, REVIEWER, 'publish', { id: record.id, version: record.version, hash: record.hash })).record;
}
const publication = record => ({ id: record.id, version: record.published_version, hash: record.published_hash });

test('individual revocation hides exact publication while preserving unrelated records and immutable history', async t => {
  const db = await setup(t), a = await publish(db), untouched = await publish(db), b = await publish(db, 'client-b');
  const history = db.sqlite.prepare('SELECT * FROM portal_revisions WHERE intake_id = ? ORDER BY version').all(a.id);
  const approval = db.sqlite.prepare('SELECT * FROM portal_approvals WHERE intake_id = ?').all(a.id);
  const revoked = (await call(db, REVIEWER, 'revoke', publication(a))).record;
  assert.equal(revoked.stage, 'draft'); assert.equal(revoked.publication_revoked, true);
  assert.equal(revoked.version, a.version); assert.equal(revoked.hash, a.hash);
  assert.equal(revoked.published_diagnostic, null); assert.equal(revoked.published_hash, null);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM portal_revisions WHERE intake_id = ? ORDER BY version').all(a.id), history);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM portal_approvals WHERE intake_id = ?').all(a.id), approval);
  const hidden = (await call(db, 'client-a', 'read', { id: a.id })).record;
  assert.equal(hidden.diagnostic, null); assert.equal(hidden.published_diagnostic, null);
  for (const [subject, record] of [['client-a', untouched], ['client-b', b]]) {
    const visible = (await call(db, subject, 'read', { id: record.id })).record;
    assert.equal(visible.publication_revoked, false); assert.equal(visible.published_hash, record.hash);
  }
  assert.equal((await call(db, 'client-a', 'session')).membership_active, true);
  const event = db.sqlite.prepare("SELECT actor_subject, version, hash FROM portal_audit WHERE intake_id = ? AND event = 'diagnostic_revoked'").get(a.id);
  assert.equal(event.actor_subject, REVIEWER); assert.equal(event.version, a.version); assert.equal(event.hash, a.hash);
});

test('revocation requires reviewer, exact publication and no forged extra fields', async t => {
  const db = await setup(t), record = await publish(db);
  for (const subject of ['client-a', 'client-b']) await rejection(call(db, subject, 'revoke', publication(record)), 403);
  for (const changed of [{ version: 1 }, { hash: '0'.repeat(64) }])
    await rejection(call(db, REVIEWER, 'revoke', { ...publication(record), ...changed }), 409);
  await rejection(call(db, REVIEWER, 'revoke', { ...publication(record), owner_subject: 'client-b' }), 400);
  assert.equal((await call(db, 'client-a', 'read', { id: record.id })).record.published_hash, record.hash);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event = 'diagnostic_revoked'").get().n, 0);
});

test('revoked approval never republishes; a new human revision must be confirmed separately', async t => {
  const db = await setup(t), record = await publish(db);
  await call(db, REVIEWER, 'revoke', publication(record));
  await rejection(call(db, REVIEWER, 'publish', publication(record)), 409);
  // Defense in depth: even an incorrectly restored stage cannot reuse the revoked approval.
  db.sqlite.prepare("UPDATE portal_intakes SET stage = 'reviewed' WHERE id = ?").run(record.id);
  await rejection(call(db, REVIEWER, 'publish', publication(record)), 409);
  const newer = await review(db, (await call(db, REVIEWER, 'read', { id: record.id })).record);
  assert.equal(newer.version, record.version + 1); assert.equal(newer.hash, record.hash);
  assert.equal((await call(db, 'client-a', 'read', { id: record.id })).record.published_diagnostic, null);
  await rejection(call(db, REVIEWER, 'publish', publication(record)), 409);
  await call(db, REVIEWER, 'publish', { id: newer.id, version: newer.version, hash: newer.hash });
  const visible = (await call(db, 'client-a', 'read', { id: record.id })).record;
  assert.equal(visible.published_version, newer.version); assert.equal(visible.publication_revoked, false);
});

test('revoking an older publication preserves a newer approved revision without publishing it', async t => {
  const db = await setup(t), old = await publish(db);
  const newer = await review(db, old);
  const revoked = (await call(db, REVIEWER, 'revoke', publication(old))).record;
  assert.equal(revoked.version, newer.version); assert.equal(revoked.stage, 'reviewed');
  assert.equal(revoked.approval.version, newer.version); assert.equal(revoked.published_diagnostic, null);
  await call(db, REVIEWER, 'publish', { id: newer.id, version: newer.version, hash: newer.hash });
  assert.equal((await call(db, 'client-a', 'read', { id: old.id })).record.published_version, newer.version);
});

test('duplicate and concurrent revocations create one event; state reconciliation does not replay writes', async t => {
  const db = await setup(t), record = await publish(db), body = publication(record);
  const results = await Promise.allSettled([call(db, REVIEWER, 'revoke', body), call(db, REVIEWER, 'revoke', body)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  await rejection(call(db, REVIEWER, 'revoke', body), 409);
  // Lost mutation response: fetch the durable state instead of interpreting a timeout as cancellation.
  assert.equal((await call(db, REVIEWER, 'read', { id: record.id })).record.publication_revoked, true);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event = 'diagnostic_revoked'").get().n, 1);
});

test('reviewer revocation between read and write prevents publication revocation atomically', async t => {
  const db = await setup(t), record = await publish(db);
  db.beforeBatch = async () => { db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run(REVIEWER); };
  await rejection(call(db, REVIEWER, 'revoke', publication(record)), 409);
  assert.equal((await call(db, 'client-a', 'read', { id: record.id })).record.published_hash, record.hash);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event = 'diagnostic_revoked'").get().n, 0);
});

test('a newer publication racing an older revocation is never removed by stale confirmation', async t => {
  const db = await setup(t), old = await publish(db), newer = await review(db, old);
  db.beforeBatch = () => call(db, REVIEWER, 'publish', { id: newer.id, version: newer.version, hash: newer.hash });
  await rejection(call(db, REVIEWER, 'revoke', publication(old)), 409);
  const visible = (await call(db, 'client-a', 'read', { id: old.id })).record;
  assert.equal(visible.published_version, newer.version); assert.equal(visible.published_hash, newer.hash);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE event = 'diagnostic_revoked'").get().n, 0);
});

test('audit failure rolls back individual publication revocation', async t => {
  const db = await setup(t), record = await publish(db);
  db.sqlite.exec("CREATE TRIGGER fail_revocation_audit BEFORE INSERT ON portal_audit WHEN NEW.event = 'diagnostic_revoked' BEGIN SELECT RAISE(ABORT, 'test revoke audit failure'); END");
  await assert.rejects(call(db, REVIEWER, 'revoke', publication(record)), /test revoke audit failure/);
  const visible = (await call(db, 'client-a', 'read', { id: record.id })).record;
  assert.equal(visible.stage, 'published'); assert.equal(visible.published_version, record.version);
});

test('fresh HTTP sessions preserve approved exact version and enforce both directions of client isolation', async t => {
  const db = await setup(t), a = await publish(db), b = await publish(db, 'client-b');
  const http = async (subject, body, expectedSubject = subject) => {
    const request = new Request('https://example.invalid/api/portal', body ? { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json', 'X-Portal-Subject': expectedSubject }, body: JSON.stringify(body) } : {});
    const response = await portalHttp(request, { user: { userId: subject, displayName: 'Synthetic identity' }, db, reviewerSubject: REVIEWER, service: handlePortal });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return { status: response.status, payload: await response.json() };
  };
  for (const [subject, own, other] of [['client-a', a, b], ['client-b', b, a], ['client-a', a, b]]) {
    const fresh = await http(subject);
    assert.equal(fresh.status, 200); assert.deepEqual(fresh.payload.cases.map(item => item.id), [own.id]);
    const saved = fresh.payload.cases[0].published;
    assert.equal(saved.version, own.version); assert.equal(saved.hash, own.hash); assert.deepEqual(saved.content, own.diagnostic);
    await rejection(call(db, subject, 'read', { id: other.id }), 404);
    const cross = await http(subject, { action: 'generate', case_id: other.id, version: other.version, confirm: true });
    assert.equal(cross.status, 404); assert.equal(cross.payload.case, undefined);
  }
  const switched = await http(REVIEWER, { action: 'revoke', case_id: a.id, version: a.version, hash: a.hash }, 'client-a');
  assert.equal(switched.status, 409); assert.equal(switched.payload.code, 'session_changed');
  assert.equal((await call(db, 'client-a', 'read', { id: a.id })).record.published_hash, a.hash);
  const revoked = await http(REVIEWER, { action: 'revoke', case_id: a.id, version: a.version, hash: a.hash });
  assert.equal(revoked.status, 200); assert.equal(revoked.payload.case.publication_revoked, true);
  const fresh = (await http('client-a')).payload.cases[0];
  assert.equal(fresh.published, null); assert.equal(fresh.draft, null); assert.equal(fresh.publication_revoked, true);
  assert.equal((await http('client-b')).payload.cases[0].published.hash, b.hash);
});

test('offline SQLite snapshot restore preserves publication, revocation, inactive membership and cross-client denial', async t => {
  const { copyFile } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'camaleao-restore-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const livePath = join(directory, 'synthetic.sqlite'), backupPath = join(directory, 'snapshot.sqlite'), restoredPath = join(directory, 'restored.sqlite');
  let db = await database(livePath); await call(db, REVIEWER, 'session');
  const revoked = await publish(db), visible = await publish(db), b = await publish(db, 'client-b'), inactive = await publish(db, 'client-c');
  await call(db, REVIEWER, 'revoke', publication(revoked));
  db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run('client-c');
  const audit = db.sqlite.prepare('SELECT * FROM portal_audit ORDER BY id').all();
  db.close(); await copyFile(livePath, backupPath);
  // Restore into a separate local DB only, after the synthetic source is closed.
  await copyFile(backupPath, restoredPath); db = await database(restoredPath, false); t.after(() => db.close());
  assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM portal_audit ORDER BY id').all(), audit);
  await call(db, 'client-a', 'session');
  const recovered = (await call(db, 'client-a', 'read', { id: visible.id })).record;
  assert.equal(recovered.published_version, visible.version); assert.equal(recovered.published_hash, visible.hash);
  assert.deepEqual(recovered.published_diagnostic, visible.diagnostic);
  const denied = (await call(db, 'client-a', 'read', { id: revoked.id })).record;
  assert.equal(denied.publication_revoked, true); assert.equal(denied.diagnostic, null); assert.equal(denied.published_diagnostic, null);
  await rejection(call(db, REVIEWER, 'publish', publication(revoked)), 409);
  await rejection(call(db, 'client-b', 'read', { id: visible.id }), 404);
  await rejection(call(db, 'client-a', 'read', { id: b.id }), 404);
  await rejection(call(db, 'client-c', 'read', { id: inactive.id }), 404);
  assert.equal((await call(db, 'client-c', 'session')).membership_active, false);
});


test('cursor pagination reaches more than 100 cases with fixed pages, tied timestamps and no cross-client leakage', async t => {
  const db = await setup(t);
  for (let index = 0; index < 127; index++) await call(db, 'client-a', 'create', { intake });
  for (let index = 0; index < 7; index++) await call(db, 'client-b', 'create', { intake });
  db.sqlite.prepare('UPDATE portal_intakes SET updated_at = ?').run('2026-10-17T12:00:00.000Z');
  const expected = db.sqlite.prepare('SELECT id FROM portal_intakes WHERE owner_subject = ? ORDER BY updated_at DESC, id ASC').all('client-a').map(row => row.id);
  let cursor, pages = 0; const seen = [];
  do {
    const page = await call(db, 'client-a', 'list', cursor ? { cursor } : {});
    pages++; assert.ok(page.records.length <= 25);
    seen.push(...page.records.map(record => record.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(pages, 6); assert.deepEqual(seen, expected); assert.equal(new Set(seen).size, 127);
  const reviewerPage = await call(db, REVIEWER, 'list');
  assert.equal(reviewerPage.records.length, 25); assert.ok(reviewerPage.nextCursor);
  const crossCursor = await call(db, 'client-b', 'list', { cursor: reviewerPage.nextCursor });
  const bIds = new Set(db.sqlite.prepare('SELECT id FROM portal_intakes WHERE owner_subject = ?').all('client-b').map(row => row.id));
  assert.ok(crossCursor.records.every(record => bIds.has(record.id)));
  await rejection(call(db, 'client-a', 'list', { cursor: reviewerPage.nextCursor, offset: 100 }), 400);
  for (const invalid of ['', 'a'.repeat(1000), '2026-02-30T12:00:00.000Z|' + expected[0], '2026-10-17T12:00:00.000Z|not-an-id'])
    await rejection(call(db, 'client-a', 'list', { cursor: invalid }), 400);
  db.sqlite.prepare('UPDATE portal_memberships SET active = 0 WHERE subject = ?').run('client-a');
  await rejection(call(db, 'client-a', 'list', { cursor: reviewerPage.nextCursor }), 403);
});

test('cursor pagination orders different timestamps before UUID ties', async t => {
  const db = await setup(t);
  for (let index = 0; index < 60; index++) await call(db, 'client-a', 'create', { intake });
  const allIds = db.sqlite.prepare('SELECT id FROM portal_intakes ORDER BY id').all();
  allIds.forEach((row, index) => db.sqlite.prepare('UPDATE portal_intakes SET updated_at = ? WHERE id = ?').run(index % 2 ? '2026-10-17T10:00:00.000Z' : '2026-10-17T09:00:00.000Z', row.id));
  const expected = db.sqlite.prepare('SELECT id FROM portal_intakes ORDER BY updated_at DESC, id ASC').all().map(row => row.id);
  const first = await call(db, 'client-a', 'list');
  const second = await call(db, 'client-a', 'list', { cursor: first.nextCursor });
  const third = await call(db, 'client-a', 'list', { cursor: second.nextCursor });
  assert.deepEqual([...first.records, ...second.records, ...third.records].map(record => record.id), expected);
  assert.equal(third.nextCursor, null);
});

test('HTTP accepts maximum valid Unicode review raw and fully escaped while enforcing the transport cap', async t => {
  const db = await setup(t);
  const full = { status: 'draft', goal_summary: '界'.repeat(2000), recommendation: '界'.repeat(8000),
    alternatives: Array(30).fill('界'.repeat(1000)), missing_information: Array(30).fill('界'.repeat(1000)),
    evidence_refs: Array(30).fill('界'.repeat(1000)), cost_status: 'unverified', human_review: true };
  assert.deepEqual(validateDiagnostic(full), full);
  for (const escaped of [false, true]) {
    const record = await draft(db);
    let body = JSON.stringify({ action: 'review', case_id: record.id, version: record.version, hash: record.hash, diagnostic: full });
    if (escaped) body = body.replace(/[^\x00-\x7F]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
    assert.ok(Buffer.byteLength(body) > 16_384); assert.ok(Buffer.byteLength(body) < 640 * 1024);
    const request = new Request('https://example.invalid/api/portal', { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json', 'X-Portal-Subject': REVIEWER }, body });
    const response = await portalHttp(request, { user: { userId: REVIEWER, displayName: 'Reviewer' }, db, reviewerSubject: REVIEWER, service: handlePortal });
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).case.draft.content, full);
  }
  const request = new Request('https://example.invalid/api/portal', { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json', 'X-Portal-Subject': REVIEWER }, body: ' '.repeat(640 * 1024 + 1) });
  const response = await portalHttp(request, { user: { userId: REVIEWER, displayName: 'Reviewer' }, db, reviewerSubject: REVIEWER, service: handlePortal });
  assert.equal(response.status, 413);
});
