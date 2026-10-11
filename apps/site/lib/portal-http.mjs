const MAX_BODY_BYTES = 16_384;

function json(value, status = 200) {
  return Response.json(value, { status, headers: {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Cookie",
  }});
}

async function boundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Informe os dados da solicitação."), {status:400});
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error("A solicitação excede o tamanho permitido."), {status:413});
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes)); }
  catch { throw Object.assign(new Error("Envie um objeto JSON válido."), {status:400}); }
}

function asCase(record) {
  return {
    id:record.id, status:record.stage === "submitted" ? "intake" : record.stage, created_at:record.created_at, updated_at:record.updated_at,
    version:record.version, hash:record.hash, intake:record.intake,
    draft: record.diagnostic ? {version:record.version, hash:record.hash, content:record.diagnostic} : null,
    published: record.published_diagnostic ? {version:record.published_version,hash:record.published_hash,content:record.published_diagnostic} :
      (record.stage === "published" && record.diagnostic ? {version:record.version,hash:record.hash,content:record.diagnostic} : null),
    approval:record.approval,
    publication_revoked:record.publication_revoked === true,
  };
}

/** Authentication is supplied ONLY by the native Sites server helper. */
export async function portalHttp(request, {user, db, reviewerSubject, service}) {
  if (!user) return json({error:"Entre com sua conta ChatGPT para continuar.",code:"unauthenticated"},401);
  if (!db) return json({error:"O portal está aguardando a configuração do banco.",code:"database_unavailable"},503);
  try {
    const call = (operation, body={}) => service({db,subject:user.userId,reviewerSubject,operation,body});
    if (request.method === "GET") {
      const session = await call("session");
      const {records} = await call("list");
      return json({user:{userId:user.userId,displayName:user.displayName},role:session.role,
        apiConfigured:false,cases:records.map(asCase)});
    }
    if (request.method !== "POST") return json({error:"Método não permitido."},405);
    const origin = request.headers.get("Origin");
    const fetchSite = request.headers.get("Sec-Fetch-Site");
    if (origin !== new URL(request.url).origin || (fetchSite && fetchSite !== "same-origin"))
      return json({error:"Use o portal para enviar esta solicitação.",code:"invalid_origin"},403);
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return json({error:"Envie os dados em JSON."},415);
    // A session switched in another tab must not execute a confirmation made
    // under the previous identity. This is a precondition, never authentication.
    if (request.headers.get("X-Portal-Subject") !== user.userId)
      return json({error:"A conta mudou. Atualize o portal e confirme novamente.",code:"session_changed"},409);
    const body = await boundedJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({error:"Solicitação inválida."},400);
    let args;
    const exact = (keys) => Object.keys(body).length === keys.length && keys.every(k=>Object.hasOwn(body,k));
    switch (body.action) {
      case "create":
        if (!exact(["action","intake","idempotency_key"])) return json({error:"Campos não permitidos."},400);
        args={intake:body.intake,idempotency_key:body.idempotency_key}; break;
      case "generate":
        if (!exact(["action","case_id","version","confirm"])) return json({error:"Campos não permitidos."},400);
        args={id:body.case_id,expected_version:body.version,confirm:body.confirm}; break;
      case "review":
        if (!exact(["action","case_id","version","hash","diagnostic"])) return json({error:"Campos não permitidos."},400);
        args={id:body.case_id,expected_version:body.version,expected_hash:body.hash,diagnostic:body.diagnostic}; break;
      case "publish":
      case "revoke":
        if (!exact(["action","case_id","version","hash"])) return json({error:"Campos não permitidos."},400);
        args={id:body.case_id,version:body.version,hash:body.hash}; break;
      default: return json({error:"Ação não disponível."},400);
    }
    const {record} = await call(body.action,args);
    return json({case:asCase(record)},body.action === "create" ? 201 : 200);
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status>=400 && error.status<500 ? error.status : 503;
    return json({error:status===503 ? "Não foi possível concluir agora. Tente novamente." : error.message,
      code:status===503 ? "temporarily_unavailable" : (error.code || "invalid_request")},status);
  }
}
