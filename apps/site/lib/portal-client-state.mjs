// Presentation and request recovery only. Authorization stays in portal-service.mjs.
export function reviewIdentity(item, role) {
  return JSON.stringify([role, item.id, item.version, item.status,
    item.draft?.version ?? null, item.draft?.hash ?? null,
    item.published?.version ?? null, item.published?.hash ?? null]);
}

export class PortalRequestError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "PortalRequestError";
    this.status = status;
  }
}

export function recoveryFor(error, mutation = false, confirmed = false) {
  const status = error instanceof PortalRequestError ? error.status : null;
  if (confirmed && status === 401) return {
    message: "A etapa foi registrada, mas sua sessão expirou ao atualizar. Entre em outra aba e confira o estado salvo antes de continuar.",
    action: "signin", uncertain: false,
  };
  if (confirmed) return {
    message: "A etapa foi registrada, mas a lista não pôde ser atualizada. Confira o estado salvo antes de continuar.",
    action: "refresh", uncertain: false,
  };
  if (status === 401) return {
    message: "Sua sessão expirou. Entre em outra aba e volte para atualizar este espaço. Suas respostas continuam nesta tela.",
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

export async function requestPortal(fetcher, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher("/api/portal", { credentials: "same-origin", cache: "no-store", ...init, signal: controller.signal });
    let body;
    try { body = await response.json(); }
    catch { throw new PortalRequestError("A resposta do portal não pôde ser lida.", response.status); }
    if (!response.ok) throw new PortalRequestError(typeof body?.error === "string" ? body.error : "Não foi possível concluir esta etapa.", response.status);
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
