import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handlePortal } from "../../../lib/portal-service.mjs";
import { portalHttp } from "../../../lib/portal-http.mjs";
import { aiReadiness } from "../../../lib/portal-ai.mjs";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const user = await getChatGPTUser();
  const ai = aiReadiness({ ...env });
  return portalHttp(request, {
    user, db:env.DB, reviewerSubject:env.CAMALEAO_REVIEWER_SUBJECT,
    ai,
    service: (args: { db: D1Database; subject: string; reviewerSubject?: string; operation: string; body: Record<string, unknown> }) => handlePortal({ ...args, aiEnv: env }),
  });
}
export const GET = handle;
export const POST = handle;
