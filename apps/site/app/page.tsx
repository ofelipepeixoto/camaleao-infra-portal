import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import PortalClient from "./portal-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (user) return <PortalClient initialUser={{ userId: user.userId, displayName: user.displayName }} />;
  return (
    <main className="landing">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Camaleão Infra Portal"><span className="brand-symbol">C<span /></span><span>camaleão<small>INFRA PORTAL</small></span></Link>
        <a className="quiet-link" href="https://camaleaoweb3.com.br/" target="_blank" rel="noopener noreferrer">Conheça a Camaleão ↗</a>
      </header>
      <section className="landing-hero">
        <div className="eyebrow"><span className="status-dot" /> SUA PRÓXIMA ETAPA COM IA</div>
        <h1>A infraestrutura por trás<br /><em>da sua próxima ideia.</em></h1>
        <p>Conte o que sua empresa precisa. A Camaleão transforma essa necessidade em um diagnóstico claro, revisado por pessoas, para você decidir o próximo passo.</p>
        <a className="button primary hero-button" href={chatGPTSignInPath("/")} target="_top">Entrar com ChatGPT <span aria-hidden="true">↗</span></a>
        <span className="hero-caption">Seu espaço para solicitar e acompanhar um diagnóstico.</span>
      </section>
      <section className="landing-journey" aria-label="Como funciona">
        <div><span className="step-number">01</span><h2>Você conta a necessidade</h2><p>Seis perguntas simples sobre sua operação, equipe e prioridades.</p></div>
        <div><span className="step-number">02</span><h2>A Camaleão revisa o plano</h2><p>O diagnóstico inicial passa por revisão humana antes da publicação.</p></div>
        <div><span className="step-number">03</span><h2>Você acompanha a evolução</h2><p>Acesse a versão publicada e veja cada etapa do seu pedido.</p></div>
      </section>
      <footer className="site-footer"><span>Agência Camaleão · IA com direção.</span><span>Diagnóstico → revisão → publicação</span></footer>
    </main>
  );
}
