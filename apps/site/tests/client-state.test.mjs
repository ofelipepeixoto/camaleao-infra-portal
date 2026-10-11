import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewIdentity, PortalRequestError, recoveryFor, requestPortal } from '../lib/portal-client-state.mjs';

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
