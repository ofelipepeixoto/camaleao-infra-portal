import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handlePortal } from "../../../lib/portal-service.mjs";
import { portalHttp } from "../../../lib/portal-http.mjs";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const user = await getChatGPTUser();
  return portalHttp(request, {
    user, db:env.DB, reviewerSubject:env.CAMALEAO_REVIEWER_SUBJECT,
    service:handlePortal,
  });
}
export const GET = handle;
export const POST = handle;
