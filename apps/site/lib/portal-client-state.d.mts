export type Recovery = { message: string; action: "refresh" | "signin" | null; uncertain: boolean };
export type ReviewContext = { id: string; version: number; status: string; publication_revoked?: boolean; draft?: { version: number; hash: string } | null; published?: { version: number; hash: string } | null };
export function reviewIdentity(item: ReviewContext, role: string, subject?: string): string;
export class PortalRequestError extends Error {
  status: number | null;
  code: string | null;
  constructor(message: string, status?: number | null, code?: string | null);
}
export function accessWasLost(error: unknown): boolean;
export function recoveryFor(error: unknown, mutation?: boolean, confirmed?: boolean): Recovery;
export function requestPortal(fetcher: typeof fetch, init?: RequestInit, timeoutMs?: number): Promise<Record<string, unknown>>;
