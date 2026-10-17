// Presentation and request recovery only. Authorization stays in portal-service.mjs.
export function reviewIdentity(item, role, subject = "") {
  return JSON.stringify([subject, role, item.id, item.version, item.status,
    item.draft?.version ?? null, item.draft?.hash ?? null,
    item.published?.version ?? null, item.published?.hash ?? null, item.publication_revoked === true]);
}

export class PortalRequestError extends Error {
  constructor(message, status = null, code = null) {
    super(message);
    this.name = "PortalRequestError";
    this.status = status;
    this.code = code;
  }
}

export function accessWasLost(error) {
  return error instanceof PortalRequestError && ([401, 403, 404].includes(error.status) || error.code === "session_changed");
}

export function recoveryFor(error, mutation = false, confirmed = false) {
  const status = error instanceof PortalRequestError ? error.status : null;
  if (error instanceof PortalRequestError && error.code === "session_changed") return {
    message: "A conta mudou. O conteúdo anterior foi removido desta tela. Atualize o portal e confirme novamente.",
    action: "refresh", uncertain: false,
  };
  if (confirmed && status === 401) return {
    message: "A etapa foi registrada, mas sua sessão expirou ao atualizar. Entre em outra aba e confira o estado salvo antes de continuar.",
    action: "signin", uncertain: false,
  };
  if (confirmed) return {
    message: "A etapa foi registrada, mas a lista não pôde ser atualizada. Confira o estado salvo antes de continuar.",
    action: "refresh", uncertain: false,
  };
  if (status === 401) return {
    message: "Sua sessão expirou. O conteúdo anterior foi removido desta tela. Entre em outra aba e volte para atualizar este espaço.",
    action: "signin", uncertain: false,
  };
  if (status === 403 || status === 404) return {
    message: "Este pedido não está disponível para sua conta. Atualize a lista para conferir os acessos atuais.",
    action: "refresh", uncertain: false,
  };
  if (status === 409) return {
    message: "A versão mudou. Confira o estado salvo antes de revisar ou publicar novamente.",
    action: "refresh", uncertain: false,
  };
  if (status === null || status >= 500 || (status >= 200 && status < 300)) return {
    message: mutation
      ? "Não foi possível confirmar o resultado. O pedido pode ter sido recebido. Atualize a lista antes de repetir a ação."
      : "Não foi possível carregar seus pedidos. Confira a conexão e tente atualizar a lista.",
    action: "refresh", uncertain: mutation,
  };
  return {
    message: error instanceof Error ? error.message : "Confira os dados e tente novamente.",
    action: null, uncertain: false,
  };
}

// Pages and acknowledged writes may only be combined within the same identity
// and role. A changed session replaces every previously displayed private case.
export function reconcilePortalPage(previous, incoming, { append = false, retainedCase = null } = {}) {
  if (!previous || previous.user.userId !== incoming.user.userId || previous.role !== incoming.role) return incoming;
  const cases = append ? [...previous.cases, ...incoming.cases.filter(item => !previous.cases.some(existing => existing.id === item.id))] : [...incoming.cases];
  if (retainedCase && !cases.some(item => item.id === retainedCase.id)) cases.unshift(retainedCase);
  return { ...incoming, cases };
}

export async function requestPortal(fetcher, init = {}, timeoutMs = 15000, path = "/api/portal") {
  const target = new URL(path, "https://portal.invalid");
  if (target.origin !== "https://portal.invalid" || target.pathname !== "/api/portal" || target.hash || [...target.searchParams.keys()].some(key => key !== "cursor") || target.searchParams.getAll("cursor").length > 1)
    throw new PortalRequestError("O endereço da lista é inválido. Atualize o portal.", 400);
  if (typeof init.body === "string" && new TextEncoder().encode(init.body).byteLength > 640 * 1024)
    throw new PortalRequestError("A revisão excede o tamanho permitido. Reduza o conteúdo antes de salvar.", 413, "request_too_large");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${target.pathname}${target.search}`, { credentials: "same-origin", cache: "no-store", ...init, signal: controller.signal });
    let body;
    try { body = await response.json(); }
    catch { throw new PortalRequestError("A resposta do portal não pôde ser lida.", response.status); }
    if (!response.ok) throw new PortalRequestError(typeof body?.error === "string" ? body.error : "Não foi possível concluir esta etapa.", response.status, typeof body?.code === "string" ? body.code : null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PortalRequestError("A resposta do portal não pôde ser lida.", response.status);
    return body;
  } catch (error) {
    if (error instanceof PortalRequestError) throw error;
    // Aborting our wait does not cancel or roll back an operation on the server.
    throw new PortalRequestError("Não foi possível confirmar a resposta do portal.");
  } finally {
    clearTimeout(timeout);
  }
}
