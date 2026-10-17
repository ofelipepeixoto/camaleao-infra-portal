export const AI_MODEL: string;
export const AI_RESERVE_MICROUSD: number;
export function aiReadiness(env?: Record<string, unknown>): { enabled: boolean; reason: string };
export function buildAiRequest(intake: Record<string, unknown>, id: string): Record<string, unknown>;
export function runAiDiagnostic(options: {
  db: D1Database; env: Record<string, unknown>; subject: string; ownerSubject: string; caseId: string;
  expectedVersion: number; expectedHash: string | null; operationId: string; intake: Record<string, unknown>;
  stillAuthorized: () => Promise<boolean>;
  attach: (diagnostic: unknown, provenance: { operationId: string; model: string; providerResponseId: string | null; spentMicroUsd: number }) => Promise<unknown>;
  fetcher?: typeof fetch;
}): Promise<unknown>;
