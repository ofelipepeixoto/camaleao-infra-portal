"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PortalRequestError, accessWasLost, recoveryFor, requestPortal, reconcilePortalPage, reviewIdentity, type Recovery } from "../lib/portal-client-state.mjs";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, FileText, Layers, LoaderCircle, LogOut, MessagesSquare, Plus, RefreshCw, ShieldCheck, Workflow } from "lucide-react";

type User = { userId: string; displayName: string };
type Role = "client" | "reviewer";
type Stage = "intake" | "draft" | "reviewed" | "published";
type Intake = { goal: "documents" | "process" | "support"; existing_tools: string[]; users: number; sensitivity: "normal" | "restricted"; external_processing_allowed: boolean; monthly_budget_brl: number | null };
type Diagnostic = { status: "draft"; goal_summary: string; recommendation: string; alternatives: string[]; missing_information: string[]; evidence_refs: string[]; cost_status: "unverified"; human_review: true };
type Version = { version: number; hash: string; content: Record<string, unknown> };
type Case = { id: string; status: Stage; publication_revoked?: boolean; version: number; hash: string | null; created_at?: string; updated_at?: string; intake: Intake; draft?: Version | null; published?: Version | null };
type AiReadiness = { enabled: boolean; reason: string };
type PortalData = { user: User; role: Role; cases: Case[]; apiConfigured: boolean; nextCursor: string | null; ai?: AiReadiness };
type View = "overview" | "new";

const goals = {
  documents: { title: "Organizar e consultar documentos", short: "Documentos e conhecimento", description: "Encontrar respostas nos materiais da empresa.", Icon: FileText },
  process: { title: "Automatizar uma rotina", short: "Automação de processos", description: "Reduzir trabalho repetitivo em um processo definido.", Icon: Workflow },
  support: { title: "Apoiar o atendimento", short: "Atendimento assistido", description: "Ajudar sua equipe a responder com mais contexto.", Icon: MessagesSquare },
};
const stages: Stage[] = ["intake", "draft", "reviewed", "published"];
const labels: Record<Stage, string> = { intake: "Necessidade registrada", draft: "Diagnóstico inicial", reviewed: "Revisado pela Camaleão", published: "Diagnóstico publicado" };
const shortLabels: Record<Stage, string> = { intake: "Registrado", draft: "Em revisão", reviewed: "Revisado", published: "Publicado" };
const stageGuidance: Record<Role, Record<Stage, string>> = {
  client: {
    intake: "Próximo passo: prepare o diagnóstico inicial a partir da necessidade registrada.",
    draft: "O diagnóstico inicial aguarda revisão humana. Confira as informações a confirmar; este rascunho ainda não é o plano final.",
    reviewed: "A revisão foi aprovada e aguarda publicação pela Camaleão. A versão publicada aparecerá aqui.",
    published: "Confira a recomendação e as informações a confirmar para conversar com a Camaleão sobre o escopo do piloto.",
  },
  reviewer: {
    intake: "Próximo passo: prepare o diagnóstico inicial por critérios.",
    draft: "Revise a recomendação, as lacunas e as referências antes de aprovar uma nova versão.",
    reviewed: "Confira novamente o conteúdo aprovado. Publicar disponibiliza exatamente esta versão ao cliente.",
    published: "Esta é a versão disponibilizada ao cliente. A publicação não autoriza contratação nem gastos.",
  },
};

function dateLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A resposta do portal não pôde ser lida. Atualize a página.");
  return value as Record<string, unknown>;
}
function portalBody(body: Record<string, unknown>): PortalData {
  const user = objectBody(body.user);
  if (typeof user.userId !== "string" || typeof user.displayName !== "string" || !["client", "reviewer"].includes(String(body.role)) || !Array.isArray(body.cases) || typeof body.apiConfigured !== "boolean" || !(body.nextCursor === null || typeof body.nextCursor === "string")) throw new Error("Não foi possível carregar seu espaço. Atualize a página.");
  return body as unknown as PortalData;
}
function asDiagnostic(content: Record<string, unknown>): Diagnostic | null {
  if (typeof content.goal_summary !== "string" || typeof content.recommendation !== "string") return null;
  for (const field of ["alternatives", "missing_information", "evidence_refs"]) {
    if (!Array.isArray(content[field]) || !(content[field] as unknown[]).every((item) => typeof item === "string")) return null;
  }
  return { status: "draft", goal_summary: content.goal_summary, recommendation: content.recommendation, alternatives: content.alternatives as string[], missing_information: content.missing_information as string[], evidence_refs: content.evidence_refs as string[], cost_status: "unverified", human_review: true };
}

export default function PortalClient({ initialUser }: { initialUser: User }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [hasIntakeDraft, setHasIntakeDraft] = useState(false);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [reviewDirty, setReviewDirty] = useState(false);
  const requestLock = useRef(false);
  const errorHeading = useRef<HTMLDivElement>(null);
  const currentPortal = useRef<PortalData | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (error) errorHeading.current?.focus(); }, [error]);
  useEffect(() => { if (view === "overview") heading.current?.focus(); }, [view]);
  useEffect(() => {
    if (!hasIntakeDraft && !reviewDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasIntakeDraft, reviewDirty]);
  const discardReview = () => !reviewDirty || window.confirm("As alterações desta revisão ainda não foram salvas. Sair desta revisão e descartá-las?");
  const openWizard = () => {
    if (busy || loading || recovery?.action || !data || !discardReview()) return;
    setReviewDirty(false); setHasIntakeDraft(true); setView("new"); setError(""); setNotice("");
  };
  const selectCase = (id: string) => {
    const currentId = data?.cases.find(item => item.id === selectedId)?.id ?? data?.cases[0]?.id;
    if (id === currentId || !discardReview()) return;
    setReviewDirty(false); setSelectedId(id); setNotice("");
  };

  const clearPrivateState = useCallback(() => {
    currentPortal.current = null; setData(null); setSelectedId(null);
    setHasIntakeDraft(false); setDraftEpoch(value => value + 1); setReviewDirty(false);
    setView("overview"); setNotice("");
  }, []);
  const acceptPortal = useCallback((portal: PortalData, options: { append?: boolean; retainedCase?: Case | null } = {}) => {
    const previous = currentPortal.current;
    if (previous && (previous.user.userId !== portal.user.userId || previous.role !== portal.role)) clearPrivateState();
    const next = reconcilePortalPage<Case, PortalData>(previous, portal, options);
    currentPortal.current = next; setData(next);
  }, [clearPrivateState]);
  const load = useCallback(async (cursor?: string) => {
    const body = await requestPortal(fetch, {}, 15000, cursor ? `/api/portal?${new URLSearchParams({ cursor })}` : "/api/portal");
    const portal = portalBody(body);
    return portal;
  }, []);

  useEffect(() => {
    let mounted = true;
    load().then((portal) => { if (mounted) acceptPortal(portal); }).catch((reason) => { if (mounted) { if (accessWasLost(reason)) clearPrivateState(); const feedback = recoveryFor(reason); setRecovery(feedback); setError(feedback.message); } }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [load, acceptPortal, clearPrivateState]);

  const act = async (action: string, payload: Record<string, unknown>) => {
    if (requestLock.current || loading || recovery?.action || !data) return false;
    if ((action === "revoke" || action === "generate_ai") && !discardReview()) return false;
    requestLock.current = true;
    setBusy(action); setError(""); setNotice(""); setRecovery(null);
    let confirmed = false;
    try {
      const body = await requestPortal(fetch, { method: "POST", headers: { "Content-Type": "application/json", "X-Portal-Subject": data.user.userId }, body: JSON.stringify({ action, ...payload }) }, action === "generate_ai" ? 60000 : 15000);
      const saved = body.case as Case | undefined;
      if (!saved || typeof saved.id !== "string" || !Number.isInteger(saved.version) || !stages.includes(saved.status) || !saved.intake || !goals[saved.intake.goal]) {
        throw new PortalRequestError("A confirmação recebida não contém um pedido válido.", 200);
      }
      confirmed = true;
      // The write has been acknowledged. A failed GET must not present it as a failed write.
      {
        const previous = currentPortal.current;
        if (previous) {
          const next = { ...previous, cases: [saved, ...previous.cases.filter(item => item.id !== saved.id)] };
          currentPortal.current = next; setData(next);
        }
        setSelectedId(saved.id);
      }
      setReviewDirty(false);
      if (action === "create") {
        setHasIntakeDraft(false); setDraftEpoch(value => value + 1); setView("overview");
      }
      setNotice(({ create: "Sua necessidade foi registrada.", generate: "Diagnóstico inicial preparado para revisão.", generate_ai: "Rascunho com IA preparado. Revise a nova versão antes de aprovar.", review: "Versão revisada e aprovada. Confira a nova versão antes de publicar.", publish: "A versão aprovada foi publicada para o cliente.", revoke: "A publicação foi revogada. O histórico permanece preservado." } as Record<string, string>)[action] ?? "Etapa concluída.");
      // Refresh page one after writes, retaining the acknowledged case if an
      // older page's case is outside it. Identity changes discard that case.
      acceptPortal(await load(), { retainedCase: saved });
      return true;
    } catch (reason) {
      if (accessWasLost(reason)) clearPrivateState();
      const feedback = recoveryFor(reason, true, confirmed);
      setRecovery(feedback); setError(feedback.message);
      return confirmed;
    } finally { requestLock.current = false; setBusy(null); }
  };
  const loadMore = async () => {
    const cursor = currentPortal.current?.nextCursor;
    if (requestLock.current || loading || recovery?.action || !cursor) return;
    requestLock.current = true; setBusy("load_more"); setError("");
    try {
      acceptPortal(await load(cursor), { append: true });
      setRecovery(null);
    } catch (reason) {
      if (accessWasLost(reason)) clearPrivateState();
      const feedback = recoveryFor(reason); setRecovery(feedback); setError(feedback.message);
    } finally { requestLock.current = false; setBusy(null); }
  };
  const refresh = async () => {
    if (requestLock.current || (reviewDirty && !window.confirm("Atualizar pode substituir suas alterações por uma versão salva mais recente. Continuar?"))) return;
    requestLock.current = true; setLoading(true); setError("");
    try {
      const fresh = await load();
      const before = data?.cases.find(item => item.id === selectedId) ?? data?.cases[0];
      const after = fresh.cases.find(item => item.id === selectedId) ?? fresh.cases[0];
      if (!before || !after || reviewIdentity(before, data?.role ?? "client", data?.user.userId) !== reviewIdentity(after, fresh.role, fresh.user.userId)) setReviewDirty(false);
      acceptPortal(fresh); setRecovery(null); setNotice("Lista atualizada. Confira a versão e o status antes de continuar.");
    } catch (reason) { if (accessWasLost(reason)) clearPrivateState(); const feedback = recoveryFor(reason); setRecovery(feedback); setError(feedback.message); }
    finally { requestLock.current = false; setLoading(false); }
  };

  const user = data?.user ?? initialUser;
  const role = data?.role ?? "client";
  const cases = data?.cases ?? [];
  const selected = cases.find((item) => item.id === selectedId) ?? cases[0];
  const publishedCount = cases.filter((item) => item.published).length;
  const actionsBlocked = busy !== null || loading || !!recovery?.action || !data;
  const reviewingCount = cases.filter((item) => item.status === "draft" || item.status === "reviewed").length;

  return (
    <div className="portal-shell">
      <a href="#portal-content" className="portal-skip">Ir para o conteúdo</a>
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-symbol">C<span /></span><span>camaleão<small>INFRA PORTAL</small></span></Link>
        <div className="header-account"><details className="account-details"><summary className="account-name">{user.displayName}</summary><div><strong>Sua conta</strong><p>Identificador para ativação de revisor</p><code>{user.userId}</code><small>A Camaleão usa este identificador para habilitar o acesso de revisão.</small></div></details><a className="icon-button" href="/signout-with-chatgpt?return_to=%2F" target="_top" aria-label="Sair"><LogOut size={18} /></a></div>
      </header>
      <div className="portal-body">
        <aside className="sidebar">
          <div className="sidebar-heading">SEU ESPAÇO</div>
          <button className={`nav-item ${view === "overview" ? "active" : ""}`} disabled={busy !== null} aria-current={view === "overview" ? "page" : undefined} onClick={() => setView("overview")}><Layers size={18} /> {role === "reviewer" ? "Console de revisão" : "Meus diagnósticos"}</button>
          <button className={`nav-item ${view === "new" ? "active" : ""}`} disabled={actionsBlocked} aria-current={view === "new" ? "page" : undefined} onClick={openWizard}><Plus size={18} /> {hasIntakeDraft ? "Retomar necessidade" : "Nova necessidade"}</button>
          <div className="sidebar-note"><ShieldCheck size={20} /><p>Clareza em cada etapa.<br /><span>A publicação depende de revisão humana.</span></p></div>
          <a className="sidebar-site" href="https://camaleaoweb3.com.br/" target="_blank" rel="noopener noreferrer">Agência Camaleão <ArrowUpRight size={15} /></a>
        </aside>
        <main id="portal-content" tabIndex={-1} className="workspace" aria-busy={loading || busy !== null}>
          <div className="workspace-top"><span className="eyebrow">CAMALEÃO / {role === "reviewer" ? "REVISÃO" : "INFRAESTRUTURA DE IA"}</span><span className="pilot-badge"><span className="status-dot" /> Portal piloto</span></div>
          {error && <div className="recovery-block"><div ref={errorHeading} className="feedback error" role="alert" tabIndex={-1}>{error}</div>{recovery?.action && <div className="recovery-actions">{recovery.action === "signin" && <a className="button" href="/signin-with-chatgpt?return_to=%2F" target="_blank" rel="noopener noreferrer">Entrar em outra aba</a>}<button className="button" disabled={loading || busy !== null} onClick={refresh}>Conferir estado salvo</button><p>Uma atualização pode trazer outra conta, permissão ou versão. Confira o conteúdo antes de confirmar.</p></div>}</div>}
          {notice && <div className="feedback success" role="status"><Check size={18} />{notice}</div>}
          <div hidden={view !== "new"}><IntakeWizard key={`${user.userId}-${draftEpoch}`} active={view === "new"} busy={actionsBlocked} onCancel={() => setView("overview")} onSubmit={(intake, key) => act("create", { intake, idempotency_key: key })} /></div>
          {view === "overview" && <>
            <div className="page-heading"><div><h1 ref={heading} tabIndex={-1}>{role === "reviewer" ? "Cada plano, uma decisão consciente." : "Da necessidade ao próximo passo."}</h1><p>{role === "reviewer" ? "Revise o diagnóstico e publique a versão aprovada para o cliente." : "Acompanhe seu diagnóstico e avance com a Camaleão."}</p></div><button className="button primary" onClick={openWizard} disabled={actionsBlocked}><Plus size={17} /> {hasIntakeDraft ? "Retomar necessidade" : "Nova necessidade"}</button></div>
            {role === "reviewer" && <p className="mode-note" role="status">Preparação com IA: {data?.ai?.reason ?? "Carregando disponibilidade."}</p>}
            <div className="stats-grid"><div className="stat-card"><span>Pedidos carregados</span><strong>{data ? cases.length.toString().padStart(2, "0") : "—"}</strong><Layers size={20} /></div><div className="stat-card"><span>Em revisão entre os carregados</span><strong>{data ? reviewingCount.toString().padStart(2, "0") : "—"}</strong><ShieldCheck size={20} /></div><div className="stat-card"><span>Publicados entre os carregados</span><strong>{data ? publishedCount.toString().padStart(2, "0") : "—"}</strong><FileText size={20} /></div></div>
            <div className="section-heading"><h2>{role === "reviewer" ? "Fila de diagnósticos" : "Sua jornada com a Camaleão"}</h2><button className="quiet-button" onClick={refresh} disabled={loading || busy !== null}><RefreshCw size={14} className={loading ? "spin" : ""} /> Atualizar</button></div>
            {loading && !data ? <div className="empty-state" role="status"><LoaderCircle className="spin" size={24} /><h3>Carregando seu espaço</h3><p>Buscando seus pedidos e as últimas versões.</p></div> : !data ? <div className="empty-state"><h2>Seu espaço ainda não foi carregado.</h2><p>Use “Conferir estado salvo” para recuperar seus pedidos antes de registrar uma nova necessidade.</p></div> : cases.length === 0 ? <div className="empty-state"><span className="empty-icon"><Workflow size={28} /></span><span className="eyebrow">COMECE COM O QUE VOCÊ PRECISA</span><h2>Sua primeira solução começa<br />com uma boa pergunta.</h2><p>Você não precisa escolher a tecnologia agora. Conte a necessidade, e nós organizamos os próximos passos.</p><button className="button primary" disabled={actionsBlocked} onClick={openWizard}>Iniciar meu diagnóstico <ArrowRight size={17} /></button></div> : <div className="cases-layout"><div className="case-list" aria-label="Pedidos">{cases.map((item) => { const GoalIcon = goals[item.intake.goal]?.Icon ?? FileText; return <button key={item.id} className={`case-card ${selected?.id === item.id ? "selected" : ""}`} disabled={busy !== null || loading} aria-pressed={selected?.id === item.id} onClick={() => selectCase(item.id)}><span className="case-card-icon"><GoalIcon size={20} /></span><span className="case-card-copy"><strong>{goals[item.intake.goal]?.short ?? "Diagnóstico"}</strong><small>Pedido {item.id.slice(0, 8)} · {dateLabel(item.created_at)}</small><span className={`status-tag stage-${item.status}`}>{shortLabels[item.status]}</span></span><ArrowUpRight size={15} /></button>; })}<p role="status">{cases.length} pedido(s) carregado(s).{data.nextCursor ? " Há mais pedidos disponíveis." : " Fim da lista carregada."}</p>{data.nextCursor && <button className="button" disabled={actionsBlocked} onClick={loadMore}>{busy === "load_more" ? "Carregando…" : "Carregar mais"}</button>}</div>{selected && <CaseDetail key={reviewIdentity(selected, role, user.userId)} item={selected} role={role} busy={actionsBlocked ? (busy ?? "sync") : null} onDirty={() => setReviewDirty(true)} apiConfigured={data?.apiConfigured ?? false} ai={data?.ai} onAction={act} />}</div>}
          </>}
          <footer className="workspace-footer"><span>Agência Camaleão</span><span>Necessidade → diagnóstico → revisão → publicação</span></footer>
        </main>
      </div>
    </div>
  );
}

function IntakeWizard({ active, busy, onCancel, onSubmit }: { active: boolean; busy: boolean; onCancel: () => void; onSubmit: (intake: Intake, key: string) => Promise<boolean> }) {
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<Intake>({ goal: "documents", existing_tools: [], users: 1, sensitivity: "restricted", external_processing_allowed: false, monthly_budget_brl: null });
  const [tools, setTools] = useState("");
  const [users, setUsers] = useState("1");
  const [budget, setBudget] = useState("");
  const [validation, setValidation] = useState("");
  const submitted = useRef<{ content: string; key: string } | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const validationNotice = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (active) stepHeading.current?.focus(); }, [active, step]);
  useEffect(() => { if (validation) validationNotice.current?.focus(); }, [validation]);
  const titles = ["O que você quer melhorar?", "O que sua equipe já usa?", "Quantas pessoas vão usar a solução?", "Como são os dados desse processo?", "Podemos avaliar processamento externo?", "Qual é a sua referência de orçamento?"];
  const descriptions = ["Escolha uma necessidade para começar. O escopo será refinado no diagnóstico.", "Informe apenas os nomes das ferramentas. Isso nos ajuda a considerar sua operação atual.", "Uma estimativa já ajuda a dimensionar o piloto.", "Se houver dúvida, escolha dados restritos para seguir com mais cuidado.", "Essa escolha orienta o diagnóstico. A ativação de um serviço ainda depende da revisão da Camaleão.", "Esse valor orienta a conversa. A proposta e a autorização de gastos acontecem em outra etapa."];
  const advance = async () => {
    setValidation("");
    let next = { ...intake };
    if (step === 1) {
      const existing = tools.split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
      if (existing.length > 30 || existing.some((value) => value.length > 80)) return setValidation("Informe até 30 ferramentas, com nomes de até 80 caracteres.");
      next = { ...next, existing_tools: existing };
    }
    if (step === 2) {
      const amount = Number(users);
      if (!/^\d+$/.test(users) || !Number.isInteger(amount) || amount < 1 || amount > 100000) return setValidation("Informe um número inteiro entre 1 e 100.000 pessoas.");
      next = { ...next, users: amount };
    }
    if (step === 5) {
      const amount = budget === "" ? null : Number(budget);
      if (amount !== null && (!/^\d+$/.test(budget) || !Number.isSafeInteger(amount) || amount < 0)) return setValidation("Informe um valor inteiro em reais ou deixe o campo vazio.");
      next = { ...next, monthly_budget_brl: amount };
    }
    setIntake(next);
    if (step < 5) setStep(step + 1);
    else {
      const content = JSON.stringify(next);
      if (submitted.current?.content !== content) submitted.current = { content, key: crypto.randomUUID() };
      if (await onSubmit(next, submitted.current.key)) submitted.current = null;
    }
  };
  return <section className="wizard"><button className="quiet-button wizard-back" onClick={onCancel} disabled={busy}><ChevronLeft size={16} /> Voltar aos diagnósticos</button><div className="wizard-card"><div className="wizard-meta"><span className="eyebrow">NOVA NECESSIDADE</span><span>ETAPA {step + 1} DE 6</span></div><div className="wizard-progress" aria-label={`Etapa ${step + 1} de 6`}>{titles.map((title, index) => <span key={title} className={index <= step ? "done" : ""} />)}</div><h1 ref={stepHeading} tabIndex={-1}>{titles[step]}</h1><p className="wizard-description">{descriptions[step]}</p><fieldset className="wizard-fields" disabled={busy} aria-label={titles[step]}>
    {step === 0 && (Object.entries(goals) as [Intake["goal"], typeof goals.documents][]).map(([key, goal]) => { const Icon = goal.Icon; return <button key={key} className={`choice-card ${intake.goal === key ? "chosen" : ""}`} onClick={() => setIntake({ ...intake, goal: key })} aria-pressed={intake.goal === key}><span className="choice-icon"><Icon size={22} /></span><span><strong>{goal.title}</strong><small>{goal.description}</small></span><span className="choice-radio">{intake.goal === key && <Check size={13} />}</span></button>; })}
    {step === 1 && <label className="field-label">Ferramentas atuais <textarea value={tools} onChange={(event) => setTools(event.target.value)} placeholder="Ex.: Google Drive, WhatsApp, Excel, CRM" rows={4} maxLength={2450} /><small>Separe os nomes por vírgula. Não inclua senhas, chaves de acesso ou documentos.</small></label>}
    {step === 2 && <label className="field-label">Pessoas no piloto <div className="number-field"><input type="number" min={1} max={100000} step={1} value={users} onChange={(event) => setUsers(event.target.value)} /><span>pessoas</span></div><small>Considere quem terá acesso à primeira versão.</small></label>}
    {step === 3 && <>{([{ value: "normal", title: "Dados comuns", description: "Informações que podem ser avaliadas para uso externo, com autorização." }, { value: "restricted", title: "Dados restritos ou ainda não classificados", description: "Informações pessoais, sigilosas ou sujeitas a restrições." }] as const).map((option) => <button key={option.value} className={`choice-card ${intake.sensitivity === option.value ? "chosen" : ""}`} onClick={() => setIntake({ ...intake, sensitivity: option.value, external_processing_allowed: option.value === "restricted" ? false : intake.external_processing_allowed })} aria-pressed={intake.sensitivity === option.value}><span className="choice-icon"><ShieldCheck size={22} /></span><span><strong>{option.title}</strong><small>{option.description}</small></span><span className="choice-radio">{intake.sensitivity === option.value && <Check size={13} />}</span></button>)}</>}
    {step === 4 && <><div className="permission-note"><ShieldCheck size={21} /><p>{intake.sensitivity === "restricted" ? "Você indicou dados restritos. O diagnóstico seguirá sem processamento externo." : "Sua escolha fica registrada junto à necessidade. Nenhum dado deve ser enviado a um provedor sem a configuração e a revisão previstas."}</p></div><label className={`check-field ${intake.sensitivity === "restricted" ? "disabled" : ""}`}><input type="checkbox" checked={intake.external_processing_allowed} disabled={intake.sensitivity === "restricted"} onChange={(event) => setIntake({ ...intake, external_processing_allowed: event.target.checked })} /><span>Autorizo considerar processamento externo no diagnóstico desta necessidade.</span></label></>}
    {step === 5 && <><label className="field-label">Referência mensal para o piloto <div className="number-field"><span>R$</span><input type="number" min={0} step={1} value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Ainda não definido" /></div><small>Opcional. Deixe vazio para definir junto à Camaleão.</small></label><div className="intake-summary"><span>SUA NECESSIDADE</span><strong>{goals[intake.goal].short}</strong><p>{intake.users} {intake.users === 1 ? "pessoa" : "pessoas"} · {intake.sensitivity === "restricted" ? "Dados restritos" : "Dados comuns"} · {intake.external_processing_allowed ? "Avaliação externa autorizada" : "Sem processamento externo"}</p></div></>}
  </fieldset>{validation && <p ref={validationNotice} className="field-error" role="alert" tabIndex={-1}>{validation}</p>}<div className="wizard-actions"><button className="quiet-button" onClick={() => { setStep(step - 1); setValidation(""); }} disabled={step === 0 || busy}><ChevronLeft size={16} /> Anterior</button><button className="button primary" onClick={advance} disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : null}{step === 5 ? "Registrar necessidade" : "Continuar"}{!busy && <ArrowRight size={17} />}</button></div></div><p className="wizard-caption">Antes de registrar, suas respostas ficam somente nesta aba. Você pode voltar aos diagnósticos e retomar; recarregar ou fechar a aba perde esse rascunho.</p></section>;
}

function CaseDetail({ item, role, busy, apiConfigured, ai, onAction, onDirty }: { item: Case; role: Role; busy: string | null; apiConfigured: boolean; ai?: AiReadiness; onDirty: () => void; onAction: (action: string, payload: Record<string, unknown>) => Promise<boolean> }) {
  const original = item.draft ? asDiagnostic(item.draft.content) : null;
  const [edited, setEdited] = useState<Diagnostic | null>(original);
  const [confirmed, setConfirmed] = useState(false);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { detailHeading.current?.focus(); }, []);
  const version = role === "client" ? item.published ?? item.draft : item.status === "published" ? item.published ?? item.draft : item.draft;
  const stageIndex = stages.indexOf(item.status);
  const change = (field: keyof Diagnostic, value: string | string[]) => { if (edited) { setEdited({ ...edited, [field]: value }); onDirty(); } setConfirmed(false); };
  const reviewDiagnostic = edited ? { ...edited, goal_summary: edited.goal_summary.trim(), recommendation: edited.recommendation.trim(), alternatives: edited.alternatives.map((value) => value.trim()).filter(Boolean), missing_information: edited.missing_information.map((value) => value.trim()).filter(Boolean), evidence_refs: edited.evidence_refs.map((value) => value.trim()).filter(Boolean) } : null;
  const exactContent = role === "reviewer" && item.status === "draft" && reviewDiagnostic ? reviewDiagnostic : version?.content;
  return <article className="case-detail"><div className="detail-heading"><div><span className="eyebrow">PEDIDO {item.id.slice(0, 8)}</span><h2 ref={detailHeading} tabIndex={-1}>{goals[item.intake.goal]?.short ?? "Diagnóstico"}</h2></div><span className={`status-tag stage-${item.status}`}>{shortLabels[item.status]}</span></div><ol className="journey" aria-label="Etapas do pedido">{stages.map((stage, index) => <li key={stage} aria-current={index === stageIndex ? "step" : undefined} className={index < stageIndex ? "complete" : index === stageIndex ? "current" : ""}><span className="journey-marker">{index < stageIndex ? <Check size={12} /> : index + 1}</span><span>{labels[stage]}</span></li>)}</ol><div className="case-context"><span>{item.intake.users} {item.intake.users === 1 ? "pessoa" : "pessoas"}</span><span>{item.intake.sensitivity === "restricted" ? "Dados restritos" : "Dados comuns"}</span><span>{item.intake.monthly_budget_brl === null ? "Orçamento a definir" : `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(item.intake.monthly_budget_brl)}/mês de referência`}</span></div>
    <p className="stage-guidance">{item.publication_revoked ? "A publicação anterior foi revogada. Uma nova versão precisa de revisão e publicação para ficar disponível." : stageGuidance[role][item.status]}</p>
    {item.status === "intake" && <div className="diagnostic-start"><div className="empty-icon small"><FileText size={24} /></div><h3>Necessidade recebida.</h3><p>Prepare o diagnóstico inicial para a Camaleão revisar o escopo e os próximos passos.</p><button className="button primary" disabled={busy !== null} onClick={() => onAction("generate", { case_id: item.id, version: item.version, confirm: true })}>{busy === "generate" ? <LoaderCircle className="spin" size={17} /> : <FileText size={17} />} Preparar diagnóstico</button></div>}
    {!apiConfigured && <p className="mode-note"><span className="status-dot" /> IA externa desativada para novas preparações.</p>}
    {role === "reviewer" && item.status === "draft" && <AiPreparation item={item} ai={ai} busy={busy} onAction={onAction} />}
    {version && <div className="diagnostic-content"><div className="content-heading"><h3>{item.status === "published" || (role === "client" && item.published) ? "Seu diagnóstico publicado" : role === "reviewer" ? "Conteúdo para revisão" : "Diagnóstico em preparação"}</h3><span>VERSÃO {version.version}</span></div>{role === "reviewer" && item.status === "draft" && edited ? <fieldset className="review-editor" disabled={busy !== null} aria-label="Editar diagnóstico"><label className="field-label">Necessidade resumida<textarea rows={2} value={edited.goal_summary} maxLength={2000} onChange={(event) => change("goal_summary", event.target.value)} /></label><label className="field-label">Recomendação<textarea rows={4} value={edited.recommendation} maxLength={8000} onChange={(event) => change("recommendation", event.target.value)} /></label>{([{ field: "alternatives", label: "Alternativas" }, { field: "missing_information", label: "Informações a confirmar" }, { field: "evidence_refs", label: "Referências utilizadas" }] as const).map(({ field, label }) => <label key={field} className="field-label">{label}<textarea rows={3} value={edited[field].join("\n")} maxLength={8000} onChange={(event) => change(field, event.target.value.split("\n"))} /><small>Um item por linha.</small></label>)}</fieldset> : <DiagnosticReadout content={version.content} />}
      <details className="exact-version" open={role === "reviewer"}><summary>{role === "reviewer" && item.status === "draft" ? "Conferir todo o conteúdo a aprovar" : "Conferir conteúdo e versão"}</summary><pre>{JSON.stringify(exactContent, null, 2)}</pre><div className="hash-line">{role === "reviewer" && item.status === "draft" ? `Versão de origem ${version.version}. Ao aprovar, a revisão salva será a versão ${version.version + 1}, com seu próprio identificador.` : `Identificador do conteúdo salvo da versão ${version.version}:`}<code>{version.hash}</code></div></details>
      {role === "reviewer" && item.status === "draft" && edited && <div className="review-action"><label className="check-field"><input type="checkbox" disabled={busy !== null} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Revisei o conteúdo acima para o pedido {item.id.slice(0, 8)} e aprovo salvar a versão {version.version + 1}. Ela ainda não será publicada.</span></label><button className="button primary" disabled={busy !== null || !confirmed || !edited.goal_summary.trim() || !edited.recommendation.trim()} onClick={() => onAction("review", { case_id: item.id, version: version.version, hash: version.hash, diagnostic: reviewDiagnostic })}>{busy === "review" ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} Aprovar versão revisada</button><p>A publicação exige uma nova confirmação da versão aprovada. Alterar o conteúdo desmarca esta aprovação.</p></div>}
      {role === "reviewer" && item.status === "reviewed" && <div className="review-action"><label className="check-field"><input type="checkbox" disabled={busy !== null} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Conferi a versão {version.version} acima do pedido {item.id.slice(0, 8)} e quero disponibilizar este conteúdo ao cliente.</span></label><button className="button primary" disabled={busy !== null || !confirmed} onClick={() => onAction("publish", { case_id: item.id, version: version.version, hash: version.hash })}>{busy === "publish" ? <LoaderCircle size={17} className="spin" /> : <ArrowUpRight size={17} />} Publicar versão aprovada</button></div>}
      {item.status === "published" && <p className="published-note"><Check size={17} /> Versão {version.version} publicada. O conteúdo corresponde à revisão aprovada.</p>}
    </div>}
    {role === "reviewer" && item.published && <section className="review-action revoke-action" aria-label="Revogar publicação"><h3>Retirar esta publicação do cliente</h3><p>Revogar a versão {item.published.version} do pedido {item.id.slice(0, 8)} remove seu conteúdo das próximas consultas do cliente e preserva o histórico. Isso não apaga cópias já lidas ou salvas.</p><p className="hash-line">Identificador da publicação: <code>{item.published.hash}</code></p><label className="check-field"><input type="checkbox" disabled={busy !== null} checked={revokeConfirmed} onChange={event => setRevokeConfirmed(event.target.checked)} /><span>Confirmo revogar apenas esta publicação da versão {item.published.version}.</span></label><button className="button" disabled={busy !== null || !revokeConfirmed} onClick={() => onAction("revoke", { case_id: item.id, version: item.published!.version, hash: item.published!.hash })}>{busy === "revoke" ? <LoaderCircle size={17} className="spin" /> : null}Revogar publicação</button></section>}
    {role === "client" && item.status !== "published" && <p className="review-pending"><ShieldCheck size={17} /> {item.published ? "Uma nova revisão está em preparação. O diagnóstico publicado acima continua disponível." : "A versão final estará disponível após a revisão e a publicação pela Camaleão."}</p>}
    {role === "reviewer" && item.published && item.status !== "published" && <details className="previous-publication"><summary>Diagnóstico já publicado · versão {item.published.version}</summary><DiagnosticReadout content={item.published.content} /><p className="hash-line">Identificador da publicação: <code>{item.published.hash}</code></p></details>}
  </article>;
}

function AiPreparation({ item, ai, busy, onAction }: { item: Case; ai?: AiReadiness; busy: string | null; onAction: (action: string, payload: Record<string, unknown>) => Promise<boolean> }) {
  const [confirmed, setConfirmed] = useState(false);
  const operationId = useRef<string | null>(null);
  const permitted = item.intake.sensitivity === "normal" && item.intake.external_processing_allowed;
  const available = ai?.enabled === true && permitted;
  const prepare = () => {
    operationId.current ??= crypto.randomUUID();
    return onAction("generate_ai", { case_id: item.id, version: item.version, hash: item.hash, operation_id: operationId.current, confirm: true });
  };
  return <section className="review-action ai-preparation" aria-label="Preparação assistida por IA"><h3>Preparar uma alternativa com IA</h3>
    <p>{!permitted ? "Este pedido exige processamento privado. A preparação externa está bloqueada." : ai?.reason ?? "A preparação externa ainda não foi habilitada."}</p>
    {available && <><p>As respostas deste pedido serão enviadas à OpenAI. Uma nova versão interna será criada e precisará de revisão humana. Alterações não salvas no editor serão descartadas após sua confirmação.</p>
      <label className="check-field"><input type="checkbox" checked={confirmed} disabled={busy !== null} onChange={event => setConfirmed(event.target.checked)} /><span>Confirmo o envio das respostas autorizadas deste pedido e o consumo dentro do limite configurado pela Camaleão.</span></label></>}
    <button className="button" disabled={busy !== null || !available || !confirmed} onClick={prepare}>{busy === "generate_ai" ? <LoaderCircle size={17} className="spin" /> : null}Preparar com IA</button>
    <small>A revisão e a publicação continuam sendo decisões separadas.</small>
  </section>;
}

function DiagnosticReadout({ content }: { content: Record<string, unknown> }) {
  const parsed = asDiagnostic(content);
  if (!parsed) return <pre className="plain-diagnostic">{JSON.stringify(content, null, 2)}</pre>;
  return <div className="readout"><div><span>NECESSIDADE</span><p>{parsed.goal_summary}</p></div><div><span>RECOMENDAÇÃO</span><p>{parsed.recommendation}</p></div>{([{ items: parsed.alternatives, title: "ALTERNATIVAS" }, { items: parsed.missing_information, title: "A CONFIRMAR" }, { items: parsed.evidence_refs, title: "REFERÊNCIAS" }]).map(({ items, title }) => <div key={title}><span>{title}</span>{items.length ? <ul>{items.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="muted">Nenhum item registrado.</p>}</div>)}<p className="cost-note">Custos ainda precisam de validação. Este diagnóstico não autoriza contratação ou gastos.</p></div>;
}
