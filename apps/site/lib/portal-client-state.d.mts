export type Recovery = { message: string; action: "refresh" | "signin" | null; uncertain: boolean };
export type ReviewContext = { id: string; version: number; status: string; draft?: { version: number; hash: string } | null; published?: { version: number; hash: string } | null };
export function reviewIdentity(item: ReviewContext, role: string): string;
export class PortalRequestError extends Error {
  status: number | null;
  constructor(message: string, status?: number | null);
}
export function recoveryFor(error: unknown, mutation?: boolean, confirmed?: boolean): Recovery;
export function requestPortal(fetcher: typeof fetch, init?: RequestInit, timeoutMs?: number): Promise<Record<string, unknown>>;
