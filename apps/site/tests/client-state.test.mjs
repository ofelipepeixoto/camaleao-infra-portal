import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewIdentity, PortalRequestError, recoveryFor, requestPortal, reconcilePortalPage } from '../lib/portal-client-state.mjs';

const draft = { id: 'synthetic-case', version: 1, status: 'draft', draft: { version: 1, hash: 'same-content' } };
test('review without editing still requires a new confirmation for publication', () => {
  const reviewed = { ...draft, version: 2, status: 'reviewed', draft: { version: 2, hash: 'same-content' } };
  assert.notEqual(reviewIdentity(draft, 'reviewer'), reviewIdentity(reviewed, 'reviewer'));
  assert.notEqual(reviewIdentity(reviewed, 'reviewer'), reviewIdentity({ ...reviewed, status: 'published' }, 'reviewer'));
});
test('confirmation context includes role, case, version and publication', () => {
  const base = reviewIdentity(draft, 'reviewer');
  for (const changed of [
    { ...draft, id: 'other-case' }, { ...draft, version: 2 },
    { ...draft, draft: { ...draft.draft, hash: 'changed' } },
    { ...draft, published: { version: 1, hash: 'published' } },
  ]) assert.notEqual(base, reviewIdentity(changed, 'reviewer'));
  assert.notEqual(base, reviewIdentity(draft, 'client'));
  assert.equal(base, reviewIdentity(structuredClone(draft), 'reviewer'));
});
test('a refresh of the same version preserves the editing context', () => {
  assert.equal(reviewIdentity(draft, 'reviewer'), reviewIdentity({ ...draft, updated_at: 'later' }, 'reviewer'));
});
test('network, malformed success and server failure never advise blind mutation retry', () => {
  for (const error of [new Error('network'), new PortalRequestError('bad body', 200), new PortalRequestError('unavailable', 503)]) {
    const recovery = recoveryFor(error, true);
    assert.equal(recovery.uncertain, true);
    assert.equal(recovery.action, 'refresh');
    assert.match(recovery.message, /antes de repetir/);
  }
});
test('a confirmed write followed by a failed read is presented as registered', () => {
  const recovery = recoveryFor(new Error('network'), true, true);
  assert.equal(recovery.uncertain, false);
  assert.equal(recovery.action, 'refresh');
  assert.match(recovery.message, /etapa foi registrada/);
});
test('session, conflict and access failures have specific recovery', () => {
  assert.equal(recoveryFor(new PortalRequestError('', 401)).action, 'signin');
  for (const status of [403, 404, 409]) assert.equal(recoveryFor(new PortalRequestError('', status), true).action, 'refresh');
  const invalid = recoveryFor(new PortalRequestError('Informe um inteiro.', 400), true);
  assert.equal(invalid.action, null);
  assert.equal(invalid.message, 'Informe um inteiro.');
});
test('reads fail as unavailable instead of inventing an empty case list', async () => {
  await assert.rejects(requestPortal(async () => new Response('gateway', { status: 503 })), error => {
    assert.equal(error.status, 503);
    assert.equal(recoveryFor(error).uncertain, false);
    return true;
  });
});
test('request boundary rejects malformed JSON, arrays and failed status', async () => {
  for (const response of [new Response('not JSON', { status: 200 }), Response.json([]), Response.json({ error: 'Sessão expirada' }, { status: 401 })]) {
    await assert.rejects(requestPortal(async () => response), PortalRequestError);
  }
});
test('a successful response preserves the server version without fabricating approval', async () => {
  const result = await requestPortal(async (_url, init) => {
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    return Response.json({ case: draft });
  });
  assert.deepEqual(result, { case: draft });
});
test('timeout stops waiting without claiming remote cancellation', async () => {
  const fetcher = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(requestPortal(fetcher, {}, 5), error => {
    assert.equal(error.status, null);
    assert.equal(recoveryFor(error, true).uncertain, true);
    return true;
  });
});


test('identity changes and publication revocation invalidate confirmation context', () => {
  assert.notEqual(reviewIdentity(draft, 'client', 'a'), reviewIdentity(draft, 'client', 'b'));
  assert.notEqual(reviewIdentity(draft, 'reviewer'), reviewIdentity({ ...draft, publication_revoked: true }, 'reviewer'));
});
test('session precondition failure carries server code and requires clearing private UI state', async () => {
  const { accessWasLost } = await import('../lib/portal-client-state.mjs');
  for (const status of [401, 403, 404]) assert.equal(accessWasLost(new PortalRequestError('denied', status)), true);
  for (const status of [409, 503]) assert.equal(accessWasLost(new PortalRequestError('other', status)), false);
  await assert.rejects(requestPortal(async () => Response.json({ error: 'Changed account', code: 'session_changed' }, { status: 409 })), error => {
    assert.equal(accessWasLost(error), true); assert.equal(recoveryFor(error).uncertain, false);
    assert.match(recoveryFor(error).message, /conta mudou/); return true;
  });
});


test('page append and acknowledged selection preservation never merge across identity or role changes', () => {
  const make = (subject = 'a', role = 'client', cases = [{ id: 'first' }]) => ({ user: { userId: subject }, role, cases, nextCursor: 'next' });
  const previous = make();
  const older = make('a', 'client', [{ id: 'second' }, { id: 'first' }]);
  assert.deepEqual(reconcilePortalPage(previous, older, { append: true }).cases.map(item => item.id), ['first', 'second']);
  const acknowledged = { id: 'older-confirmed', version: 2 };
  assert.deepEqual(reconcilePortalPage(previous, older, { retainedCase: acknowledged }).cases.map(item => item.id), ['older-confirmed', 'second', 'first']);
  for (const changed of [make('b'), make('a', 'reviewer')]) {
    assert.deepEqual(reconcilePortalPage(previous, changed, { append: true, retainedCase: acknowledged }), changed);
  }
});

test('pagination request uses only the portal route and rejects provider URLs before fetching', async () => {
  const cursor = '2026-10-17T12:00:00.000Z|12345678-1234-4123-8123-123456789012';
  let fetched = 0;
  const fetcher = async (path) => { fetched++; assert.equal(new URL(path, 'https://portal.invalid').searchParams.get('cursor'), cursor); return Response.json({ cases: [] }); };
  await requestPortal(fetcher, {}, 15000, '/api/portal?' + new URLSearchParams({ cursor }));
  for (const path of ['https://provider.invalid/api/portal', '//provider.invalid/api/portal', '/api/other', '/api/portal?offset=25', '/api/portal?cursor=a&cursor=b'])
    await assert.rejects(requestPortal(fetcher, {}, 15000, path), error => error.status === 400);
  assert.equal(fetched, 1);
});

test('oversized frontend review fails preflight with a readable error and does not send any mutation', async () => {
  let fetched = 0;
  await assert.rejects(requestPortal(async () => { fetched++; return Response.json({}); }, { method: 'POST', body: JSON.stringify({ diagnostic: '界'.repeat(220000) }) }), error => {
    assert.equal(error.status, 413); assert.equal(error.code, 'request_too_large'); assert.match(error.message, /Reduza o conteúdo/); return true;
  });
  assert.equal(fetched, 0);
});
