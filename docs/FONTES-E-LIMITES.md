# Fontes oficiais, consulta e limitações

Consultas realizadas em 11/10/2026. Revalidar versões, licenças, modelos e políticas na implementação. As fontes confirmam documentação e anúncios; não comprovam que uma conta foi habilitada ou serviço integrado.

| Fonte primária | Aplicação no projeto |
| --- | --- |
| [Agência Camaleão](https://camaleaoweb3.com.br/) | Conteúdo oficial indexado: diagnóstico, validação, implementação e segmentos de IA/infraestrutura; abertura direta falhou com HTTP 403. Logo e assets não capturados |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | Contrato JSON Schema de diagnóstico; schema não substitui validação semântica |
| [OpenAI MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) | MCP remoto, allowed_tools, compartilhamento e aprovações; stdio experimental não é endpoint remoto |
| [OpenAI Data controls](https://developers.openai.com/api/docs/guides/your-data) | Retenção por endpoint/recurso, estado e terceiros; store:false não configura ZDR |
| [MCP Transports 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) | Subconjunto stdio do laboratório; protocolo completo e clientes reais pendentes |
| [MCP Security Best Practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices) | Audience, scopes, SSRF e prevenção de token passthrough |
| [n8n License FAQ](https://docs.n8n.io/n8n-community-license/community-license/license-faq.md) | Avaliar serviço interno versus acesso/controle de workflow pelo cliente, inclusive via agente/API/MCP |
| [n8n OEM](https://docs.n8n.io/deploy/host-n8n/deploy-as-an-oem-integration) | Editor exposto, termos comerciais e identidade do fornecedor |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | Políticas e caminhos privilegiados; nenhum banco real foi alterado/testado |
| [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/) | Opt-in, opt-out, janela, templates e atendimento humano |
| [WhatsApp Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/) | Custo depende de mercado, categoria e regras atuais; nenhuma tabela de preço fixada |

Instruções Sites lidas nesta sessão: runtime Worker/HTTP, identidade nativa, secrets, revisão da audience e fluxo de publicação. Nenhum Site, domínio ou runtime foi criado neste trabalho; conta/plano e acesso de visitantes externos dependem de verificação.

A documentação principal Cloud API retornou HTTP 429 na consulta da especialidade Meta; requisitos de webhook estão registrados como projeto de engenharia a confirmar. O acesso aos termos WhatsApp variou entre a consulta documental e redirecionamento a login; não pressupor liberação de um assistente genérico. O caso proposto é atendimento dos serviços da Camaleão.

## Limites da referência

- Interface estática: demonstração guiada local; sem autenticação, persistência, integração ou homologação de browser.
- Python: biblioteca padrão; regras determinísticas e controles de memória de um processo. Não é limite financeiro real nem autenticação de cliente.
- MCP: catálogo público e diagnóstico offline, stdio e subconjunto do ciclo de vida. SDK, transportes remotos, OAuth, reconexão e compatibilidade continuam pendentes.
- OpenAI: gerador de JSON local, modelo configurável ilustrativo, sem chave ou envio.
- n8n: blueprints não importáveis e inativos. Não representam fluxo real validado.
- Infraestrutura: recursos relatados, sem inventário técnico ou mudanças remotas.
- Comercial: ofertas, datas, volumes e métricas do piloto são hipóteses de gestão. Conteúdo público não prova contratos, caixa ou capacidade.

Para homologação usar o plano de gates e evidências em [Segurança](SEGURANCA-E-HOMOLOGACAO.md).
