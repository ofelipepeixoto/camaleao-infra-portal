// Isolated browser component checks with explicitly synthetic identity and HTTP.
// No Sites login, D1, external model or hosted portal is exercised.
import { createRoot } from "react-dom/client";
import PortalClient from "../../app/portal-client";
import "../../app/globals.css";

declare global { interface Window { __uiResult?: { status: string; checks: string[]; error?: string }; } }
const checks: string[] = [];
let user = { userId: "synthetic-ui-user", displayName: "Pessoa fictícia" };
const diagnostic = { status: "draft", goal_summary: "Necessidade fictícia", recommendation: "Recomendação fictícia", alternatives: [], missing_information: ["Confirmar escopo do piloto"], evidence_refs: ["intake:ficticio"], cost_status: "unverified", human_review: true };
const original = { id: "11111111-1111-4111-8111-111111111111", status: "draft", version: 1, hash: "same-content-hash", intake: { goal: "documents", existing_tools: [], users: 1, sensitivity: "restricted", external_processing_allowed: false, monthly_budget_brl: null }, draft: { version: 1, hash: "same-content-hash", content: diagnostic }, published: null };
let role = "client";
type SyntheticCase = Omit<typeof original, "published"> & { published: typeof original.draft | null; publication_revoked?: boolean };
let records: SyntheticCase[] = [];
let readFailure = false;
let failAfterWrite = false;
let lostWriteResponse = false;
let deniedRead = false;
let lastMutation: Record<string, unknown> | null = null;
let posts = 0;
let epoch = 0;
const root = createRoot(document.getElementById("root")!);
window.fetch = async (input, init) => {
  if (input !== "/api/portal") throw new Error("Unexpected network destination in isolated test");
  if (init?.method === "POST") {
    if (new Headers(init.headers).get("X-Portal-Subject") !== user.userId) return Response.json({ error: "Changed identity", code: "session_changed" }, { status: 409 });
    posts++;
    const body = JSON.parse(String(init.body));
    lastMutation = body;
    if (body.action === "review") records = [{ ...records[0], version: 2, status: "reviewed", draft: { ...records[0].draft, version: 2 } }];
    else if (body.action === "revoke") records = [{ ...records[0], status: "draft", published: null, publication_revoked: true }];
    else throw new Error("Unexpected mutation in synthetic test");
    if (lostWriteResponse) throw new Error("Synthetic response lost after commit");
    if (failAfterWrite) readFailure = true;
    return Response.json({ case: records[0] });
  }
  if (deniedRead) return Response.json({ error: "Synthetic denied membership" }, { status: 403 });
  if (readFailure) throw new Error("Synthetic read failure");
  return Response.json({ user, role, cases: records, apiConfigured: false });
};
window.confirm = () => true;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function wait(check: () => unknown, message: string) {
  for (let count = 0; count < 100; count++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
  throw new Error(message);
}
const visible = (element: Element) => element.getClientRects().length > 0;
function button(text: string) {
  return [...document.querySelectorAll("button")].find(item => visible(item) && item.textContent?.trim() === text);
}
async function click(text: string) {
  await wait(() => { const item = button(text); return item && !item.disabled; }, "Button unavailable: " + text);
  button(text)!.click();
  await new Promise(resolve => setTimeout(resolve, 30));
}
function checkbox() { return document.querySelector<HTMLInputElement>(".review-action input")!; }
function inputText(element: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
function mount() { root.render(<PortalClient key={++epoch} initialUser={user} />); }
async function run() {
  readFailure = true; mount();
  await wait(() => document.querySelector('[role="alert"]'), "Missing load error");
  assert(!document.body.textContent?.includes("Sua primeira solução começa"), "Failure was shown as an empty list");
  assert(button("Nova necessidade")?.disabled, "Creation must wait for a loaded session");
  assert(document.activeElement?.getAttribute("role") === "alert", "Error should receive focus");
  checks.push("failed load is distinct from empty, focuses error and blocks creation");

  readFailure = false; mount();
  await wait(() => document.body.textContent?.includes("Sua primeira solução começa"), "Missing actual empty state");
  await click("Nova necessidade");
  await wait(() => document.activeElement?.tagName === "H1" && document.activeElement.textContent?.includes("O que você quer"), "Wizard heading focus");
  await click("Continuar");
  await wait(() => document.querySelector(".wizard textarea"), "Tools field");
  const field = document.querySelector<HTMLTextAreaElement>(".wizard textarea")!;
  inputText(field, "Ferramenta fictícia");
  await new Promise(resolve => setTimeout(resolve, 30));
  await click("Meus diagnósticos");
  await click("Retomar necessidade");
  assert(document.querySelector<HTMLTextAreaElement>(".wizard textarea")?.value === "Ferramenta fictícia", "Navigation lost the intake draft");
  assert(document.activeElement?.tagName === "H1", "Resume should focus step heading");
  assert(document.documentElement.scrollWidth <= innerWidth + 1, "Wizard overflows viewport");
  checks.push("intake resumes within the tab, restores focus and fits viewport");

  role = "reviewer"; records = [structuredClone(original)]; mount();
  await wait(() => button("Aprovar versão revisada"), "Review not loaded");
  assert(button("Aprovar versão revisada")?.disabled, "Review requires confirmation");
  checkbox().click();
  await new Promise(resolve => setTimeout(resolve, 30));
  const recommendation = document.querySelectorAll<HTMLTextAreaElement>(".review-editor textarea")[1];
  inputText(recommendation, "Texto fictício alterado");
  await wait(() => !checkbox().checked, "Editing must clear approval");
  inputText(recommendation, diagnostic.recommendation);
  await new Promise(resolve => setTimeout(resolve, 30));
  checkbox().click();
  await click("Aprovar versão revisada");
  await wait(() => button("Publicar versão aprovada"), "Publication step not shown");
  assert(!checkbox().checked, "Unchanged content hash reused approval for publication");
  assert(button("Publicar versão aprovada")?.disabled, "Publication requires a separate confirmation");
  assert(document.querySelector(".content-heading")?.textContent?.includes("VERSÃO 2"), "Wrong approved version");
  assert(document.documentElement.scrollWidth <= innerWidth + 1, "Review overflows viewport");
  checks.push("edit resets approval; same-hash review to version 2 resets publication confirmation");

  records = [structuredClone(original)]; posts = 0; failAfterWrite = true; mount();
  await wait(() => button("Aprovar versão revisada"), "Review reload");
  checkbox().click();
  await click("Aprovar versão revisada");
  await wait(() => document.body.textContent?.includes("A etapa foi registrada, mas"), "Acknowledged write became generic failure");
  assert(button("Publicar versão aprovada")?.disabled, "Writes must wait for state reconciliation");
  assert(posts === 1, "Write was retried automatically");
  readFailure = false; failAfterWrite = false;
  await click("Conferir estado salvo");
  await wait(() => !document.querySelector('[role="alert"]'), "Recovery did not clear error");
  assert(!checkbox().checked && button("Publicar versão aprovada")?.disabled, "Recovery bypassed separate publication confirmation");
  checks.push("acknowledged write plus failed refresh recovers without replay");
  const published = { ...structuredClone(original), status: "published", version: 2, draft: { ...original.draft, version: 2 }, published: { ...original.draft, version: 2 } };
  records = [published]; posts = 0; lostWriteResponse = true; mount();
  await wait(() => button("Revogar publicação"), "Missing revocation control");
  assert(button("Revogar publicação")?.disabled, "Revocation requires exact confirmation");
  assert(document.querySelector(".revoke-action")?.textContent?.includes("versão 2"), "Revocation must identify published version");
  document.querySelector<HTMLInputElement>(".revoke-action input")!.click();
  await click("Revogar publicação");
  await wait(() => document.body.textContent?.includes("Não foi possível confirmar o resultado"), "Lost response was not marked uncertain");
  assert(posts === 1 && button("Revogar publicação")?.disabled, "Uncertain revocation must not be replayed");
  lostWriteResponse = false;
  await click("Conferir estado salvo");
  await wait(() => document.body.textContent?.includes("A publicação anterior foi revogada"), "Revoked state not reconciled");
  assert(!button("Revogar publicação") && !button("Publicar versão aprovada"), "Revoked approval was reused");
  assert(posts === 1, "State reconciliation repeated a write");
  assert(lastMutation?.case_id === original.id && lastMutation?.version === 2 && lastMutation?.hash === original.hash, "Revocation targeted a different publication");
  assert(document.documentElement.scrollWidth <= innerWidth + 1, "Revocation overflows viewport");
  checks.push("exact revocation requires confirmation and reconciles lost response without replay");

  role = "client"; records = [published]; mount();
  await wait(() => document.body.textContent?.includes("Seu diagnóstico publicado"), "Client publication missing");
  assert(!button("Revogar publicação"), "Client received revocation controls");
  user = { userId: "synthetic-client-b", displayName: "Outra pessoa fictícia" }; records = [];
  await click("Atualizar");
  await wait(() => document.body.textContent?.includes("Sua primeira solução começa"), "Changed account did not refresh");
  assert(!document.body.textContent?.includes(diagnostic.recommendation), "Changed account retained previous publication");
  checks.push("account switch clears previous publication and does not expose reviewer controls");

  role = "reviewer"; records = [published]; mount();
  await wait(() => button("Revogar publicação"), "Reviewer restore missing");
  document.querySelector<HTMLInputElement>(".revoke-action input")!.click();
  user = { userId: "synthetic-session-switched", displayName: "Sessão alterada" };
  posts = 0;
  await click("Revogar publicação");
  await wait(() => document.body.textContent?.includes("A conta mudou"), "Missing identity-precondition warning");
  assert(posts === 0, "A confirmation from the previous account changed data");
  assert(!document.body.textContent?.includes(diagnostic.recommendation), "Identity conflict retained private content");
  checks.push("identity change before a write blocks it and clears prior private content");

  role = "client"; records = [published]; mount();
  await wait(() => document.body.textContent?.includes("Seu diagnóstico publicado"), "Reload publication missing");
  deniedRead = true; await click("Atualizar");
  await wait(() => document.querySelector('[role="alert"]'), "Denied access missing");
  assert(!document.body.textContent?.includes(diagnostic.recommendation), "Denied access retained private content");
  assert(button("Nova necessidade")?.disabled, "Denied session permits mutation");
  checks.push("denied refresh clears private content and blocks actions");
  window.__uiResult = { status: "passed", checks };
}
window.__uiResult = { status: "running", checks };
run().catch(error => { window.__uiResult = { status: "failed", checks, error: String(error) }; });
