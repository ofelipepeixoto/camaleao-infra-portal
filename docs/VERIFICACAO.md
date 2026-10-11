# Verificação da entrega v0.1

## Entrega 01 — 11/10/2026

- 23 testes Python e 22 testes Node passaram: isolamento, identidade ausente, origem externa, reenvio idempotente, revogação, concorrência de versões/publicação, rollback transacional e persistência após reabrir SQLite.
- A jornada HTTP completa usa o schema SQL real: cadastro → diagnóstico por critérios → revisão humana → publicação de versão/hash correspondentes.
- TypeScript sem emissão e build Sites/Vinext passaram. Browser QA não foi executado porque o controle de navegador previsto para este runtime não estava disponível.
- Homologação **privada** publicada com sucesso pelo Sites: https://camaleao-infra-portal.radarjacarepagua.chatgpt.site.
- SHA do código fonte Sites: `48d4ab243c4de5d1ed8b1bac85d4e9c6911a3022`; implantação `appgdep_6acb0eda81a08191b57b8cfd2a609e92`.
- Verificação do banco hospedado confirmou binding `DB` e cinco tabelas: `portal_memberships`, `portal_intakes`, `portal_revisions`, `portal_approvals`, `portal_audit`. Isso verifica aplicação de schema; o percurso com pessoas autenticadas em produção ainda depende da ativação do revisor.
- `infra.camaleaoweb3.com.br` registrado no Sites e pendente de DNS/SSL. Valores reais em [SUBDOMINIO.md](SUBDOMINIO.md).
- Revisor ainda não configurado. O usuário autenticado consulta seu identificador em Conta; o administrador configura `CAMALEAO_REVIEWER_SUBJECT` no servidor.
- OpenAI, MCP remoto, n8n e WhatsApp não foram ativados. O modo de diagnóstico é determinístico, sem chamadas externas.
- Compartilhamento com clientes, cotas/frequência, backup/restauração e retenção precisam de homologação antes de operação comercial com dados reais.

## Verificação inicial preservada

Data: 11/10/2026. Ambiente local; sem chamadas pagas ou dados reais de clientes.

## Executado

| Verificação | Resultado |
| --- | --- |
| `python3 -m unittest discover -s tests -v` | 23 testes locais passaram |
| `python3 scripts/demo.py` | Diagnóstico determinístico executado; dados restritos bloqueiam envio externo; custo permanece não verificado |
| Leitura dos seis arquivos JSON | Sintaxe válida |
| `node --check` no script da interface | Sintaxe válida |
| Revisão estática de núcleo e MCP | Falhas de profundidade JSON/Unicode tratadas com testes de continuidade |
| Busca textual de marca antiga | Nenhuma ocorrência nos arquivos da entrega |

Os testes verificam intake estrito, tipos, bloqueio de egress, acesso A/B, teto global/por cliente sob concorrência, reserva idempotente e estados incertos, aprovação por hash/versão/alvo/teto/expiração, mutação e replay. O laboratório stdio cobre inicialização, catálogo, chamadas permitidas, entradas inválidas, IDs Unicode, JSON aninhado e continuidade da sessão. O exemplo OpenAI cobre configuração offline limitada e schema de rascunho.

## Limites

Não houve homologação de navegador ou fluxo ponta a ponta interface/backend. Não foram testados SDK/cliente MCP reais, protocolo completo, transporte remoto, OAuth, banco, backup real, identidade Sites, chamadas OpenAI, n8n, WhatsApp, infraestrutura ou desempenho em produção.

Reservas de orçamento e aprovações vivem na memória de um processo. Reinício perde estado. Retornar uma reserva existente não é lease de execução: o futuro worker deve checar status, lease, idempotência e resultado antes de qualquer envio. Unidades são abstratas, sem ligação com moeda/tokens ou fatura externa.

CI preparada para repetir os testes offline no GitHub, com acesso somente leitura e timeout. Estado remoto deve ser verificado pelo conector após publicar o commit; resultados locais não provam CI verde.

## Critério para a próxima entrega

Um usuário autenticado e autorizado conclui intake persistido, recebe rascunho, um revisor humano aprova uma versão e o cliente consulta somente essa versão. Registro do consumo, negativa de acesso cruzado, reinício sem perda de rodada, limite de custo e restauração precisam ser demonstrados no ambiente de homologação.
