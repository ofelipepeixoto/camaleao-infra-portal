"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, FileText, Layers, LoaderCircle, LogOut, MessagesSquare, Plus, RefreshCw, ShieldCheck, Workflow } from "lucide-react";

type User = { userId: string; displayName: string };
type Role = "client" | "reviewer";
type Stage = "intake" | "draft" | "reviewed" | "published";
type Intake = { goal: "documents" | "process" | "support"; existing_tools: string[]; users: number; sensitivity: "normal" | "restricted"; external_processing_allowed: boolean; monthly_budget_brl: number | null };
type Diagnostic = { status: "draft"; goal_summary: string; recommendation: string; alternatives: string[]; missing_information: string[]; evidence_refs: string[]; cost_status: "unverified"; human_review: true };
type Version = { version: number; hash: string; content: Record<string, unknown> };
type Case = { id: string; status: Stage; version: number; hash: string | null; created_at?: string; updated_at?: string; intake: Intake; draft?: Version | null; published?: Version | null };
type PortalData = { user: User; role: Role; cases: Case[]; apiConfigured: boolean };
type View = "overview" | "new";

const goals = {
  documents: { title: "Organizar e consultar documentos", short: "Documentos e conhecimento", description: "Encontrar respostas nos materiais da empresa.", Icon: FileText },
  process: { title: "Automatizar uma rotina", short: "Automação de processos", description: "Reduzir trabalho repetitivo em um processo definido.", Icon: Workflow },
  support: { title: "Apoiar o atendimento", short: "Atendimento assistido", description: "Ajudar sua equipe a responder com mais contexto.", Icon: MessagesSquare },
};
const stages: Stage[] = ["intake", "draft", "reviewed", "published"];
const labels: Record<Stage, string> = { intake: "Necessidade registrada", draft: "Diagnóstico inicial", reviewed: "Revisado pela Camaleão", published: "Diagnóstico publicado" };
const shortLabels: Record<Stage, string> = { intake: "Registrado", draft: "Em revisão", reviewed: "Revisado", published: "Publicado" };

function dateLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function friendlyError(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string") return value.message;
  return "Não foi possível concluir esta etapa. Tente novamente.";
}
function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A resposta do portal não pôde ser lida. Atualize a página.");
  return value as Record<string, unknown>;
}
function portalBody(body: Record<string, unknown>): PortalData {
  const user = objectBody(body.user);
  if (typeof user.userId !== "string" || typeof user.displayName !== "string" || !["client", "reviewer"].includes(String(body.role)) || !Array.isArray(body.cases) || typeof body.apiConfigured !== "boolean") throw new Error("Não foi possível carregar seu espaço. Atualize a página.");
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

  const load = useCallback(async () => {
    const response = await fetch("/api/portal", { credentials: "same-origin", cache: "no-store" });
    const body = objectBody(await response.json());
    if (!response.ok) throw new Error(friendlyError(body.error));
    const portal = portalBody(body);
    return portal;
  }, []);

  useEffect(() => {
    let mounted = true;
    load().then((portal) => { if (mounted) setData(portal); }).catch((reason) => { if (mounted) setError(reason instanceof Error ? reason.message : friendlyError(reason)); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [load]);

  const act = async (action: string, payload: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(action); setError(""); setNotice("");
    try {
      const response = await fetch("/api/portal", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const body = objectBody(await response.json());
      if (!response.ok) throw new Error(friendlyError(body.error));
      const fresh = await load();
      setData(fresh);
      if (action === "create") {
        const createdCase = body.case && typeof body.case === "object" ? body.case as Record<string, unknown> : null;
        const createdId = createdCase?.id ?? body.id ?? fresh.cases[0]?.id;
        if (typeof createdId === "string") setSelectedId(createdId);
        setView("overview");
      }
      setNotice(({ create: "Sua necessidade foi registrada.", generate: "Diagnóstico inicial preparado para revisão.", review: "Versão revisada e aprovada. Agora ela pode ser publicada.", publish: "A versão aprovada foi publicada para o cliente." } as Record<string, string>)[action] ?? "Etapa concluída.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : friendlyError(reason));
      return false;
    } finally { setBusy(null); }
  };
  const refresh = async () => {
    setLoading(true); setError("");
    try { setData(await load()); } catch (reason) { setError(reason instanceof Error ? reason.message : friendlyError(reason)); } finally { setLoading(false); }
  };

  const user = data?.user ?? initialUser;
  const role = data?.role ?? "client";
  const cases = data?.cases ?? [];
  const selected = cases.find((item) => item.id === selectedId) ?? cases[0];
  const publishedCount = cases.filter((item) => item.status === "published").length;
  const reviewingCount = cases.filter((item) => item.status === "draft" || item.status === "reviewed").length;

  return (
    <div className="portal-shell">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-symbol">C<span /></span><span>camaleão<small>INFRA PORTAL</small></span></Link>
        <div className="header-account"><details className="account-details"><summary className="account-name">{user.displayName}</summary><div><strong>Sua conta</strong><p>Identificador para ativação de revisor</p><code>{user.userId}</code><small>A Camaleão usa este identificador para habilitar o acesso de revisão.</small></div></details><a className="icon-button" href="/signout-with-chatgpt?return_to=%2F" target="_top" aria-label="Sair"><LogOut size={18} /></a></div>
      </header>
      <div className="portal-body">
        <aside className="sidebar">
          <div className="sidebar-heading">SEU ESPAÇO</div>
          <button className={`nav-item ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}><Layers size={18} /> {role === "reviewer" ? "Console de revisão" : "Meus diagnósticos"}</button>
          <button className={`nav-item ${view === "new" ? "active" : ""}`} onClick={() => { setView("new"); setError(""); setNotice(""); }}><Plus size={18} /> Nova necessidade</button>
          <div className="sidebar-note"><ShieldCheck size={20} /><p>Clareza em cada etapa.<br /><span>A publicação depende de revisão humana.</span></p></div>
          <a className="sidebar-site" href="https://camaleaoweb3.com.br/" target="_blank" rel="noopener noreferrer">Agência Camaleão <ArrowUpRight size={15} /></a>
        </aside>
        <main className="workspace">
          <div className="workspace-top"><span className="eyebrow">CAMALEÃO / {role === "reviewer" ? "REVISÃO" : "INFRAESTRUTURA DE IA"}</span><span className="pilot-badge"><span className="status-dot" /> Portal piloto</span></div>
          {error && <div className="feedback error" role="alert">{error}</div>}
          {notice && <div className="feedback success" role="status"><Check size={18} />{notice}</div>}
          {view === "new" ? <IntakeWizard busy={busy !== null} onCancel={() => setView("overview")} onSubmit={(intake, key) => act("create", { intake, idempotency_key: key })} /> : <>
            <div className="page-heading"><div><h1>{role === "reviewer" ? "Cada plano, uma decisão consciente." : "Da necessidade ao próximo passo."}</h1><p>{role === "reviewer" ? "Revise o diagnóstico e publique a versão aprovada para o cliente." : "Acompanhe seu diagnóstico e avance com a Camaleão."}</p></div><button className="button primary" onClick={() => setView("new")} disabled={busy !== null}><Plus size={17} /> Nova necessidade</button></div>
            <div className="stats-grid"><div className="stat-card"><span>Pedidos registrados</span><strong>{cases.length.toString().padStart(2, "0")}</strong><Layers size={20} /></div><div className="stat-card"><span>Na etapa de revisão</span><strong>{reviewingCount.toString().padStart(2, "0")}</strong><ShieldCheck size={20} /></div><div className="stat-card"><span>Diagnósticos publicados</span><strong>{publishedCount.toString().padStart(2, "0")}</strong><FileText size={20} /></div></div>
            <div className="section-heading"><h2>{role === "reviewer" ? "Fila de diagnósticos" : "Sua jornada com a Camaleão"}</h2><button className="quiet-button" onClick={refresh} disabled={loading || busy !== null}><RefreshCw size={14} className={loading ? "spin" : ""} /> Atualizar</button></div>
            {loading && !data ? <div className="empty-state"><LoaderCircle className="spin" size={24} /><h3>Carregando seu espaço</h3><p>Buscando seus pedidos e as últimas versões.</p></div> : cases.length === 0 ? <div className="empty-state"><span className="empty-icon"><Workflow size={28} /></span><span className="eyebrow">COMECE COM O QUE VOCÊ PRECISA</span><h2>Sua primeira solução começa<br />com uma boa pergunta.</h2><p>Você não precisa escolher a tecnologia agora. Conte a necessidade, e nós organizamos os próximos passos.</p><button className="button primary" onClick={() => setView("new")}>Iniciar meu diagnóstico <ArrowRight size={17} /></button></div> : <div className="cases-layout"><div className="case-list" aria-label="Pedidos">{cases.map((item) => { const GoalIcon = goals[item.intake.goal]?.Icon ?? FileText; return <button key={item.id} className={`case-card ${selected?.id === item.id ? "selected" : ""}`} onClick={() => { setSelectedId(item.id); setNotice(""); }}><span className="case-card-icon"><GoalIcon size={20} /></span><span className="case-card-copy"><strong>{goals[item.intake.goal]?.short ?? "Diagnóstico"}</strong><small>Pedido {item.id.slice(0, 8)} · {dateLabel(item.created_at)}</small><span className={`status-tag stage-${item.status}`}>{shortLabels[item.status]}</span></span><ArrowUpRight size={15} /></button>; })}</div>{selected && <CaseDetail key={`${selected.id}-${selected.draft?.hash ?? selected.status}`} item={selected} role={role} busy={busy} apiConfigured={data?.apiConfigured ?? false} onAction={act} />}</div>}
          </>}
          <footer className="workspace-footer"><span>Agência Camaleão</span><span>Necessidade → diagnóstico → revisão → publicação</span></footer>
        </main>
      </div>
    </div>
  );
}

function IntakeWizard({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (intake: Intake, key: string) => Promise<boolean> }) {
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<Intake>({ goal: "documents", existing_tools: [], users: 1, sensitivity: "restricted", external_processing_allowed: false, monthly_budget_brl: null });
  const [tools, setTools] = useState("");
  const [users, setUsers] = useState("1");
  const [budget, setBudget] = useState("");
  const [validation, setValidation] = useState("");
  const submitted = useRef<{ content: string; key: string } | null>(null);
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
  return <section className="wizard"><button className="quiet-button wizard-back" onClick={onCancel} disabled={busy}><ChevronLeft size={16} /> Voltar aos diagnósticos</button><div className="wizard-card"><div className="wizard-meta"><span className="eyebrow">NOVA NECESSIDADE</span><span>ETAPA {step + 1} DE 6</span></div><div className="wizard-progress" aria-label={`Etapa ${step + 1} de 6`}>{titles.map((title, index) => <span key={title} className={index <= step ? "done" : ""} />)}</div><h1>{titles[step]}</h1><p className="wizard-description">{descriptions[step]}</p><div className="wizard-fields">
    {step === 0 && (Object.entries(goals) as [Intake["goal"], typeof goals.documents][]).map(([key, goal]) => { const Icon = goal.Icon; return <button key={key} className={`choice-card ${intake.goal === key ? "chosen" : ""}`} onClick={() => setIntake({ ...intake, goal: key })} aria-pressed={intake.goal === key}><span className="choice-icon"><Icon size={22} /></span><span><strong>{goal.title}</strong><small>{goal.description}</small></span><span className="choice-radio">{intake.goal === key && <Check size={13} />}</span></button>; })}
    {step === 1 && <label className="field-label">Ferramentas atuais <textarea value={tools} onChange={(event) => setTools(event.target.value)} placeholder="Ex.: Google Drive, WhatsApp, Excel, CRM" rows={4} maxLength={2450} /><small>Separe os nomes por vírgula. Não inclua senhas, chaves de acesso ou documentos.</small></label>}
    {step === 2 && <label className="field-label">Pessoas no piloto <div className="number-field"><input type="number" min={1} max={100000} step={1} value={users} onChange={(event) => setUsers(event.target.value)} /><span>pessoas</span></div><small>Considere quem terá acesso à primeira versão.</small></label>}
    {step === 3 && <>{([{ value: "normal", title: "Dados comuns", description: "Informações que podem ser avaliadas para uso externo, com autorização." }, { value: "restricted", title: "Dados restritos ou ainda não classificados", description: "Informações pessoais, sigilosas ou sujeitas a restrições." }] as const).map((option) => <button key={option.value} className={`choice-card ${intake.sensitivity === option.value ? "chosen" : ""}`} onClick={() => setIntake({ ...intake, sensitivity: option.value, external_processing_allowed: option.value === "restricted" ? false : intake.external_processing_allowed })} aria-pressed={intake.sensitivity === option.value}><span className="choice-icon"><ShieldCheck size={22} /></span><span><strong>{option.title}</strong><small>{option.description}</small></span><span className="choice-radio">{intake.sensitivity === option.value && <Check size={13} />}</span></button>)}</>}
    {step === 4 && <><div className="permission-note"><ShieldCheck size={21} /><p>{intake.sensitivity === "restricted" ? "Você indicou dados restritos. O diagnóstico seguirá sem processamento externo." : "Sua escolha fica registrada junto à necessidade. Nenhum dado deve ser enviado a um provedor sem a configuração e a revisão previstas."}</p></div><label className={`check-field ${intake.sensitivity === "restricted" ? "disabled" : ""}`}><input type="checkbox" checked={intake.external_processing_allowed} disabled={intake.sensitivity === "restricted"} onChange={(event) => setIntake({ ...intake, external_processing_allowed: event.target.checked })} /><span>Autorizo considerar processamento externo no diagnóstico desta necessidade.</span></label></>}
    {step === 5 && <><label className="field-label">Referência mensal para o piloto <div className="number-field"><span>R$</span><input type="number" min={0} step={1} value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Ainda não definido" /></div><small>Opcional. Deixe vazio para definir junto à Camaleão.</small></label><div className="intake-summary"><span>SUA NECESSIDADE</span><strong>{goals[intake.goal].short}</strong><p>{intake.users} {intake.users === 1 ? "pessoa" : "pessoas"} · {intake.sensitivity === "restricted" ? "Dados restritos" : "Dados comuns"} · {intake.external_processing_allowed ? "Avaliação externa autorizada" : "Sem processamento externo"}</p></div></>}
  </div>{validation && <p className="field-error" role="alert">{validation}</p>}<div className="wizard-actions"><button className="quiet-button" onClick={() => { setStep(step - 1); setValidation(""); }} disabled={step === 0 || busy}><ChevronLeft size={16} /> Anterior</button><button className="button primary" onClick={advance} disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : null}{step === 5 ? "Registrar necessidade" : "Continuar"}{!busy && <ArrowRight size={17} />}</button></div></div><p className="wizard-caption">As respostas ficam associadas ao seu pedido para revisão e acompanhamento.</p></section>;
}

function CaseDetail({ item, role, busy, apiConfigured, onAction }: { item: Case; role: Role; busy: string | null; apiConfigured: boolean; onAction: (action: string, payload: Record<string, unknown>) => Promise<boolean> }) {
  const original = item.draft ? asDiagnostic(item.draft.content) : null;
  const [edited, setEdited] = useState<Diagnostic | null>(original);
  const [confirmed, setConfirmed] = useState(false);
  const version = role === "client" ? item.published ?? item.draft : item.status === "published" ? item.published ?? item.draft : item.draft;
  const stageIndex = stages.indexOf(item.status);
  const change = (field: keyof Diagnostic, value: string | string[]) => { if (edited) setEdited({ ...edited, [field]: value }); setConfirmed(false); };
  const reviewDiagnostic = edited ? { ...edited, goal_summary: edited.goal_summary.trim(), recommendation: edited.recommendation.trim(), alternatives: edited.alternatives.map((value) => value.trim()).filter(Boolean), missing_information: edited.missing_information.map((value) => value.trim()).filter(Boolean), evidence_refs: edited.evidence_refs.map((value) => value.trim()).filter(Boolean) } : null;
  const exactContent = role === "reviewer" && item.status === "draft" && reviewDiagnostic ? reviewDiagnostic : version?.content;
  return <article className="case-detail"><div className="detail-heading"><div><span className="eyebrow">PEDIDO {item.id.slice(0, 8)}</span><h2>{goals[item.intake.goal]?.short ?? "Diagnóstico"}</h2></div><span className={`status-tag stage-${item.status}`}>{shortLabels[item.status]}</span></div><ol className="journey" aria-label="Etapas do pedido">{stages.map((stage, index) => <li key={stage} className={index < stageIndex ? "complete" : index === stageIndex ? "current" : ""}><span className="journey-marker">{index < stageIndex ? <Check size={12} /> : index + 1}</span><span>{labels[stage]}</span></li>)}</ol><div className="case-context"><span>{item.intake.users} {item.intake.users === 1 ? "pessoa" : "pessoas"}</span><span>{item.intake.sensitivity === "restricted" ? "Dados restritos" : "Dados comuns"}</span><span>{item.intake.monthly_budget_brl === null ? "Orçamento a definir" : `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(item.intake.monthly_budget_brl)}/mês de referência`}</span></div>
    {item.status === "intake" && <div className="diagnostic-start"><div className="empty-icon small"><FileText size={24} /></div><h3>Necessidade recebida.</h3><p>Prepare o diagnóstico inicial para a Camaleão revisar o escopo e os próximos passos.</p><button className="button primary" disabled={busy !== null} onClick={() => onAction("generate", { case_id: item.id, version: item.version, confirm: true })}>{busy === "generate" ? <LoaderCircle className="spin" size={17} /> : <FileText size={17} />} Preparar diagnóstico</button></div>}
    {!apiConfigured && <p className="mode-note"><span className="status-dot" /> Diagnóstico inicial por critérios; IA externa pendente de ativação.</p>}
    {version && <div className="diagnostic-content"><div className="content-heading"><h3>{item.status === "published" || (role === "client" && item.published) ? "Seu diagnóstico publicado" : role === "reviewer" ? "Conteúdo para revisão" : "Diagnóstico em preparação"}</h3><span>VERSÃO {version.version}</span></div>{role === "reviewer" && item.status === "draft" && edited ? <div className="review-editor"><label className="field-label">Necessidade resumida<textarea rows={2} value={edited.goal_summary} maxLength={2000} onChange={(event) => change("goal_summary", event.target.value)} /></label><label className="field-label">Recomendação<textarea rows={4} value={edited.recommendation} maxLength={8000} onChange={(event) => change("recommendation", event.target.value)} /></label>{([{ field: "alternatives", label: "Alternativas" }, { field: "missing_information", label: "Informações a confirmar" }, { field: "evidence_refs", label: "Referências utilizadas" }] as const).map(({ field, label }) => <label key={field} className="field-label">{label}<textarea rows={3} value={edited[field].join("\n")} maxLength={8000} onChange={(event) => change(field, event.target.value.split("\n"))} /><small>Um item por linha.</small></label>)}</div> : <DiagnosticReadout content={version.content} />}
      <details className="exact-version" open={role === "reviewer"}><summary>{role === "reviewer" && item.status === "draft" ? "Conferir todo o conteúdo a aprovar" : "Conferir conteúdo e versão"}</summary><pre>{JSON.stringify(exactContent, null, 2)}</pre><div className="hash-line">Identificador da versão atual: <code>{version.hash}</code></div></details>
      {role === "reviewer" && item.status === "draft" && edited && <div className="review-action"><label className="check-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Li todo o conteúdo acima e aprovo esta revisão para publicação.</span></label><button className="button primary" disabled={busy !== null || !confirmed || !edited.goal_summary.trim() || !edited.recommendation.trim()} onClick={() => onAction("review", { case_id: item.id, version: version.version, hash: version.hash, diagnostic: reviewDiagnostic })}>{busy === "review" ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} Aprovar versão revisada</button><p>A revisão salva uma nova versão aprovada. A publicação acontece na próxima etapa.</p></div>}
      {role === "reviewer" && item.status === "reviewed" && <div className="review-action"><label className="check-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Conferi a versão {version.version} acima e quero publicá-la para o cliente.</span></label><button className="button primary" disabled={busy !== null || !confirmed} onClick={() => onAction("publish", { case_id: item.id, version: version.version, hash: version.hash })}>{busy === "publish" ? <LoaderCircle size={17} className="spin" /> : <ArrowUpRight size={17} />} Publicar versão aprovada</button></div>}
      {item.status === "published" && <p className="published-note"><Check size={17} /> Versão {version.version} publicada. O conteúdo corresponde à revisão aprovada.</p>}
    </div>}
    {role === "client" && item.status !== "published" && <p className="review-pending"><ShieldCheck size={17} /> {item.published ? "Uma nova revisão está em preparação. O diagnóstico publicado acima continua disponível." : "A versão final estará disponível após a revisão e a publicação pela Camaleão."}</p>}
    {role === "reviewer" && item.published && item.status !== "published" && <details className="previous-publication"><summary>Diagnóstico já publicado · versão {item.published.version}</summary><DiagnosticReadout content={item.published.content} /><p className="hash-line">Identificador da publicação: <code>{item.published.hash}</code></p></details>}
  </article>;
}

function DiagnosticReadout({ content }: { content: Record<string, unknown> }) {
  const parsed = asDiagnostic(content);
  if (!parsed) return <pre className="plain-diagnostic">{JSON.stringify(content, null, 2)}</pre>;
  return <div className="readout"><div><span>NECESSIDADE</span><p>{parsed.goal_summary}</p></div><div><span>RECOMENDAÇÃO</span><p>{parsed.recommendation}</p></div>{([{ items: parsed.alternatives, title: "ALTERNATIVAS" }, { items: parsed.missing_information, title: "A CONFIRMAR" }, { items: parsed.evidence_refs, title: "REFERÊNCIAS" }]).map(({ items, title }) => <div key={title}><span>{title}</span>{items.length ? <ul>{items.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="muted">Nenhum item registrado.</p>}</div>)}<p className="cost-note">Custos ainda precisam de validação. Este diagnóstico não autoriza contratação ou gastos.</p></div>;
}
