/** Persistent portal domain service. No network calls, credentials or paid APIs.
 * `subject` must be resolved by the trusted Sites ingress, never a request body.
 * D1 batch is transactional; every write repeats membership and CAS predicates.
 */
export class PortalError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new PortalError(status, code, message); };
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|'))
    fail(400, 'invalid_input', 'Campos inválidos ou inesperados.');
};
const text = (value, limit, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))
    fail(400, 'invalid_input', `${label} inválido.`);
  return value.trim();
};
const strings = (value, limit, itemLimit, label) => {
  if (!Array.isArray(value) || value.length > limit) fail(400, 'invalid_input', `${label} inválido.`);
  return value.map(item => text(item, itemLimit, label));
};
const integer = (value, min, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, 'invalid_input', 'Número inválido.');
  return value;
};
export function validateIntake(value) {
  exact(value, ['goal', 'sensitivity', 'external_processing_allowed', 'existing_tools', 'users', 'monthly_budget_brl']);
  if (!['documents', 'process', 'support'].includes(value.goal) || !['normal', 'restricted'].includes(value.sensitivity)
      || typeof value.external_processing_allowed !== 'boolean') fail(400, 'invalid_input', 'Escolhas de diagnóstico inválidas.');
  return { goal: value.goal, sensitivity: value.sensitivity, external_processing_allowed: value.external_processing_allowed,
    existing_tools: strings(value.existing_tools, 30, 80, 'Ferramentas'), users: integer(value.users, 1, 100000),
    monthly_budget_brl: value.monthly_budget_brl === null ? null : integer(value.monthly_budget_brl, 0) };
}
export function validateDiagnostic(value) {
  exact(value, ['status', 'goal_summary', 'recommendation', 'alternatives', 'missing_information', 'evidence_refs', 'cost_status', 'human_review']);
  if (value.status !== 'draft' || value.cost_status !== 'unverified' || value.human_review !== true)
    fail(400, 'invalid_input', 'O diagnóstico deve manter custos não verificados e revisão humana.');
  return { status: 'draft', goal_summary: text(value.goal_summary, 2000, 'Objetivo'), recommendation: text(value.recommendation, 8000, 'Recomendação'),
    alternatives: strings(value.alternatives, 30, 1000, 'Alternativas'), missing_information: strings(value.missing_information, 30, 1000, 'Pendências'),
    evidence_refs: strings(value.evidence_refs, 30, 1000, 'Referências'), cost_status: 'unverified', human_review: true };
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function prepareDiagnostic(intake, id) {
  const titles = { documents: 'Busca assistida em documentos', process: 'Automação de um processo delimitado', support: 'Atendimento assistido com revisão humana' };
  const permitted = intake.sensitivity === 'normal' && intake.external_processing_allowed;
  const missing = ['Verificar a infraestrutura existente.', 'Definir dados autorizados e critérios de aceitação.', 'Validar isolamento e permissões de acesso.'];
  if (!permitted) missing.push('Definir processamento privado antes de avaliar qualquer fornecedor externo.');
  if (intake.monthly_budget_brl === null) missing.push('Acordar um limite financeiro para o piloto.');
  if (intake.monthly_budget_brl === 0) missing.push('Manter a avaliação sem consumo pago até haver autorização de gastos.');
  return validateDiagnostic({ status: 'draft', goal_summary: `${titles[intake.goal]} para ${intake.users} usuário(s).`,
    recommendation: `Começar com um piloto delimitado de ${titles[intake.goal].toLowerCase()}, documentar os resultados e submeter o plano à revisão da Camaleão. ${permitted ? 'A escolha de fornecedor externo exige validação específica; este diagnóstico não enviou dados a provedores de IA.' : 'Os dados permanecem neste portal; processamento externo não foi autorizado para esta avaliação.'}`,
    alternatives: ['Avaliar primeiro a rotina manual e as ferramentas atuais.', 'Validar a viabilidade de uma implantação privada.'], missing_information: missing,
    evidence_refs: [`intake:${id}`], cost_status: 'unverified', human_review: true });
}
const idValue = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    fail(400, 'invalid_input', 'Identificador inválido.');
  return value;
};
const hashValue = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(400, 'invalid_input', 'Hash inválido.');
  return value;
};
const stmt = (db, sql, values = []) => db.prepare(sql).bind(...values);
const access = prefix => `EXISTS (SELECT 1 FROM portal_memberships m WHERE m.subject = ? AND m.tenant_id = ? AND m.active = 1) AND (? = 1 OR (${prefix}tenant_id = ? AND ${prefix}owner_subject = ?))`;
const accessValues = (subject, reviewer) => [subject, subject, reviewer ? 1 : 0, subject, subject];
async function batch(db, statements) {
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.some(result => result.success === false)) fail(503, 'storage_failure', 'Não foi possível concluir a operação.');
  return results;
}
const recordSelect = `SELECT i.*, r.diagnostic_json AS current_diagnostic_json, r.source AS current_source,
  p.diagnostic_json AS published_diagnostic_json, a.version AS approval_version, a.hash AS approval_hash, a.approved_at,
  (SELECT MAX(x.version) FROM portal_audit x WHERE x.intake_id = i.id AND x.event = 'diagnostic_revoked') AS revoked_version
  FROM portal_intakes i
  LEFT JOIN portal_revisions r ON r.intake_id = i.id AND r.version = i.version AND r.hash = i.hash
  LEFT JOIN portal_revisions p ON p.intake_id = i.id AND p.version = i.published_version AND p.hash = i.published_hash
  LEFT JOIN portal_approvals a ON a.intake_id = i.id AND a.version = i.version AND a.hash = i.hash`;
function recordFromRow(row, reviewer) {
  const approval = row.approval_version ? { version: row.approval_version, hash: row.approval_hash, approved_at: row.approved_at } : null;
  // A human revision remains internal until its exact approved hash is published.
  const visible = reviewer || row.current_source === 'deterministic' || (row.published_version === row.version && row.published_hash === row.hash);
  return { id: row.id, stage: row.stage, version: row.version, hash: row.hash, intake: JSON.parse(row.intake_json),
    diagnostic: visible && row.current_diagnostic_json ? JSON.parse(row.current_diagnostic_json) : null, approval,
    published_version: row.published_version, published_hash: row.published_hash,
    publication_revoked: row.published_version === null && row.revoked_version !== null,
    published_diagnostic: row.published_diagnostic_json ? JSON.parse(row.published_diagnostic_json) : null, created_at: row.created_at, updated_at: row.updated_at };
}
async function load(db, subject, reviewer, id) {
  const row = await stmt(db, `${recordSelect} WHERE i.id = ? AND ${access('i.')}`, [id, ...accessValues(subject, reviewer)]).first();
  if (!row) fail(404, 'not_found', 'Diagnóstico indisponível.');
  return recordFromRow(row, reviewer);
}
function auditStatement(db, { id, subject, token, event, version, hash, now }) {
  return stmt(db, `INSERT INTO portal_audit (id, intake_id, actor_subject, event, version, hash, created_at)
    SELECT ?, id, ?, ?, ?, ?, ? FROM portal_intakes WHERE id = ? AND operation_token = ?`,
    [crypto.randomUUID(), subject, event, version, hash, now, id, token]);
}

export async function handlePortal({ db, subject, reviewerSubject, operation, body = {} }) {
  if (typeof subject !== 'string' || !subject || subject.length > 256 || subject.trim() !== subject || /\s|[\u0000-\u001f]/u.test(subject))
    fail(401, 'authentication_required', 'Entre com sua conta para continuar.');
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') fail(503, 'storage_unavailable', 'Persistência ainda indisponível.');
  const reviewer = typeof reviewerSubject === 'string' && reviewerSubject.length > 0 && reviewerSubject === subject;
  const now = new Date().toISOString();
  if (operation === 'session') {
    exact(body, []);
    if (reviewer) await stmt(db, 'INSERT INTO portal_memberships (subject, tenant_id, active, created_at) VALUES (?, ?, 1, ?) ON CONFLICT(subject) DO NOTHING', [subject, subject, now]).run();
    const member = await stmt(db, 'SELECT active, tenant_id FROM portal_memberships WHERE subject = ?', [subject]).first();
    return { subject, role: reviewer ? 'reviewer' : 'client', membership_active: !!member && member.active === 1 && member.tenant_id === subject, generation_mode: 'deterministic', paid_api_enabled: false };
  }
  if (operation === 'list') {
    exact(body, Object.hasOwn(body, 'cursor') ? ['cursor'] : []);
    let cursor = null;
    if (Object.hasOwn(body, 'cursor')) {
      if (typeof body.cursor !== 'string' || body.cursor.length !== 61 || body.cursor[24] !== '|')
        fail(400, 'invalid_cursor', 'O marcador da lista é inválido. Atualize a lista.');
      const updatedAt = body.cursor.slice(0, 24), id = idValue(body.cursor.slice(25));
      const time = new Date(updatedAt);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt) || Number.isNaN(time.getTime()) || time.toISOString() !== updatedAt)
        fail(400, 'invalid_cursor', 'O marcador da lista é inválido. Atualize a lista.');
      cursor = { updatedAt, id };
    }
    const member = await stmt(db, 'SELECT active, tenant_id FROM portal_memberships WHERE subject = ?', [subject]).first();
    if (member && (member.active !== 1 || member.tenant_id !== subject)) fail(403, 'membership_inactive', 'Acesso ao portal desativado.');
    // Keyset pagination retains deterministic ordering for equal timestamps.
    // Each page independently enforces current membership and record ownership.
    const after = cursor ? ' AND (i.updated_at < ? OR (i.updated_at = ? AND i.id > ?))' : '';
    const values = [...accessValues(subject, reviewer), ...(cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : [])];
    const result = await stmt(db, `${recordSelect} WHERE ${access('i.')}${after} ORDER BY i.updated_at DESC, i.id ASC LIMIT 26`, values).all();
    const rows = result.results.slice(0, 25), last = rows.at(-1);
    return { records: rows.map(row => recordFromRow(row, reviewer)),
      nextCursor: result.results.length > 25 ? `${last.updated_at}|${last.id}` : null };
  }
  if (operation === 'create') {
    exact(body, ['intake', 'idempotency_key']);
    const intake = validateIntake(body.intake), key = idValue(body.idempotency_key);
    const idDigest = await digest({ subject, key, purpose: 'camaleao-intake' });
    const id = `${idDigest.slice(0, 8)}-${idDigest.slice(8, 12)}-4${idDigest.slice(13, 16)}-8${idDigest.slice(17, 20)}-${idDigest.slice(20, 32)}`;
    const token = crypto.randomUUID();
    const results = await batch(db, [
      stmt(db, 'INSERT INTO portal_memberships (subject, tenant_id, active, created_at) VALUES (?, ?, 1, ?) ON CONFLICT(subject) DO NOTHING', [subject, subject, now]),
      stmt(db, `INSERT OR IGNORE INTO portal_intakes (id, tenant_id, owner_subject, intake_json, stage, version, operation_token, created_at, updated_at)
        SELECT ?, ?, ?, ?, 'submitted', 0, ?, ?, ? FROM portal_memberships WHERE subject = ? AND tenant_id = ? AND active = 1`,
        [id, subject, subject, canonicalJson(intake), token, now, now, subject, subject]),
      auditStatement(db, { id, subject, token, event: 'intake_created', version: 0, hash: null, now }),
    ]);
    if (results[1].meta.changes !== 1) {
      const member = await stmt(db, 'SELECT active, tenant_id FROM portal_memberships WHERE subject = ?', [subject]).first();
      if (!member || member.active !== 1 || member.tenant_id !== subject) fail(403, 'membership_inactive', 'Acesso ao portal desativado.');
    }
    const record = await load(db, subject, reviewer, id);
    if (canonicalJson(record.intake) !== canonicalJson(intake)) fail(409, 'idempotency_conflict', 'Essa chave já foi usada com outro diagnóstico.');
    return { record };
  }
  if (operation === 'read') { exact(body, ['id']); return { record: await load(db, subject, reviewer, idValue(body.id)) }; }
  if (!['generate', 'review', 'publish', 'revoke'].includes(operation)) fail(404, 'unknown_operation', 'Operação indisponível.');
  if (operation === 'review' || operation === 'publish' || operation === 'revoke') {
    if (!reviewer) fail(403, 'reviewer_required', 'Esta operação exige um revisor da Camaleão.');
  }
  exact(body, operation === 'generate' ? ['id', 'expected_version', 'confirm'] : operation === 'review' ? ['id', 'expected_version', 'expected_hash', 'diagnostic'] : ['id', 'version', 'hash']);
  const id = idValue(body.id), current = await load(db, subject, reviewer, id), token = crypto.randomUUID();
  if (operation === 'generate' && body.confirm !== true) fail(400, 'confirmation_required', 'Confirme a preparação do diagnóstico.');
  if (operation === 'revoke') {
    const version = integer(body.version, 1), hash = hashValue(body.hash);
    if (current.published_version !== version || current.published_hash !== hash)
      fail(409, 'version_conflict', 'A publicação mudou. Confira a versão disponível antes de revogar.');
    const results = await batch(db, [
      stmt(db, `UPDATE portal_intakes SET published_version = NULL, published_hash = NULL,
        stage = CASE WHEN stage = 'published' THEN 'draft' ELSE stage END, operation_token = ?, updated_at = ?
        WHERE id = ? AND published_version = ? AND published_hash = ? AND ${access('')}`,
        [token, now, id, version, hash, ...accessValues(subject, reviewer)]),
      auditStatement(db, { id, subject, token, event: 'diagnostic_revoked', version, hash, now }),
    ]);
    if (results[0].meta.changes !== 1) fail(409, 'version_conflict', 'A publicação ou a permissão mudou. Atualize o diagnóstico.');
    return { record: await load(db, subject, reviewer, id) };
  }
  if (operation === 'publish') {
    const version = integer(body.version, 1), hash = hashValue(body.hash);
    if (current.stage !== 'reviewed' || current.version !== version || current.hash !== hash || current.approval?.hash !== hash)
      fail(409, 'version_conflict', 'A versão aprovada mudou. Atualize o diagnóstico antes de publicar.');
    const results = await batch(db, [
      stmt(db, `UPDATE portal_intakes SET stage = 'published', published_version = ?, published_hash = ?, operation_token = ?, updated_at = ?
        WHERE id = ? AND stage = 'reviewed' AND version = ? AND hash = ? AND ${access('')}
        AND EXISTS (SELECT 1 FROM portal_approvals a WHERE a.intake_id = portal_intakes.id AND a.version = ? AND a.hash = ? AND a.reviewer_subject = ?)
        AND NOT EXISTS (SELECT 1 FROM portal_audit x WHERE x.intake_id = portal_intakes.id AND x.event = 'diagnostic_revoked' AND x.version = ? AND x.hash = ?)
        AND EXISTS (SELECT 1 FROM portal_revisions r WHERE r.intake_id = portal_intakes.id AND r.version = ? AND r.hash = ?)`,
        [version, hash, token, now, id, version, hash, ...accessValues(subject, reviewer), version, hash, subject, version, hash, version, hash]),
      auditStatement(db, { id, subject, token, event: 'diagnostic_published', version, hash, now }),
    ]);
    if (results[0].meta.changes !== 1) fail(409, 'version_conflict', 'A versão ou a permissão mudou. Atualize o diagnóstico.');
    return { record: await load(db, subject, reviewer, id) };
  }
  const expected = integer(body.expected_version, 0);
  if (current.version !== expected) fail(409, 'version_conflict', 'O diagnóstico mudou. Atualize antes de continuar.');
  if (operation === 'review') {
    const expectedHash = hashValue(body.expected_hash);
    if (!current.diagnostic || current.hash !== expectedHash || current.stage === 'submitted') fail(409, 'version_conflict', 'O rascunho mudou. Atualize antes de revisar.');
  }
  const diagnostic = operation === 'generate' ? prepareDiagnostic(current.intake, id) : validateDiagnostic(body.diagnostic);
  const diagnosticJson = canonicalJson(diagnostic), version = expected + 1, hash = await digest(diagnostic), source = operation === 'generate' ? 'deterministic' : 'human_review';
  const where = operation === 'review' ? ' AND hash = ?' : '';
  const statements = [
    stmt(db, `UPDATE portal_intakes SET version = ?, hash = ?, stage = ?, operation_token = ?, updated_at = ? WHERE id = ? AND version = ?${where} AND ${access('')}`,
      [version, hash, operation === 'review' ? 'reviewed' : 'draft', token, now, id, expected, ...(operation === 'review' ? [body.expected_hash] : []), ...accessValues(subject, reviewer)]),
    stmt(db, `INSERT INTO portal_revisions (intake_id, version, hash, diagnostic_json, source, actor_subject, created_at)
      SELECT id, ?, ?, ?, ?, ?, ? FROM portal_intakes WHERE id = ? AND operation_token = ?`, [version, hash, diagnosticJson, source, subject, now, id, token]),
  ];
  if (operation === 'review') statements.push(stmt(db, `INSERT INTO portal_approvals (id, intake_id, version, hash, reviewer_subject, approved_at)
    SELECT ?, id, ?, ?, ?, ? FROM portal_intakes WHERE id = ? AND operation_token = ?`, [crypto.randomUUID(), version, hash, subject, now, id, token]));
  statements.push(auditStatement(db, { id, subject, token, event: operation === 'review' ? 'diagnostic_reviewed' : 'diagnostic_prepared', version, hash, now }));
  const results = await batch(db, statements);
  if (results[0].meta.changes !== 1) fail(409, 'version_conflict', 'A versão ou a permissão mudou. Atualize o diagnóstico.');
  return { record: await load(db, subject, reviewer, id) };
}
