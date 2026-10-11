// Isolated browser component checks with explicitly synthetic identity and HTTP.
// No Sites login, D1, external model or hosted portal is exercised.
import { createRoot } from "react-dom/client";
import PortalClient from "../../app/portal-client";
import "../../app/globals.css";

declare global { interface Window { __uiResult?: { status: string; checks: string[]; error?: string }; } }
const checks: string[] = [];
const user = { userId: "synthetic-ui-user", displayName: "Pessoa fictícia" };
const diagnostic = { status: "draft", goal_summary: "Necessidade fictícia", recommendation: "Recomendação fictícia", alternatives: [], missing_information: ["Confirmar escopo do piloto"], evidence_refs: ["intake:ficticio"], cost_status: "unverified", human_review: true };
const original = { id: "11111111-1111-4111-8111-111111111111", status: "draft", version: 1, hash: "same-content-hash", intake: { goal: "documents", existing_tools: [], users: 1, sensitivity: "restricted", external_processing_allowed: false, monthly_budget_brl: null }, draft: { version: 1, hash: "same-content-hash", content: diagnostic }, published: null };
let role = "client";
let records: typeof original[] = [];
let readFailure = false;
let failAfterWrite = false;
let posts = 0;
let epoch = 0;
const root = createRoot(document.getElementById("root")!);
window.fetch = async (input, init) => {
  if (input !== "/api/portal") throw new Error("Unexpected network destination in isolated test");
  if (init?.method === "POST") {
    posts++;
    const body = JSON.parse(String(init.body));
    if (body.action !== "review") throw new Error("Unexpected mutation in synthetic test");
    records = [{ ...records[0], version: 2, status: "reviewed", draft: { ...records[0].draft, version: 2 } }];
    if (failAfterWrite) readFailure = true;
    return Response.json({ case: records[0] });
  }
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
  window.__uiResult = { status: "passed", checks };
}
window.__uiResult = { status: "running", checks };
run().catch(error => { window.__uiResult = { status: "failed", checks, error: String(error) }; });
