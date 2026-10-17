# Registro de verificação

## Homologação humana hospedada — 11/10/2026

Ambiente: Site privado em [infra.camaleaoweb3.com.br](https://infra.camaleaoweb3.com.br/), identidade nativa ChatGPT e D1 do portal. Foram usados dados fictícios e duas contas autorizadas distintas. Identificadores pessoais e e-mails são omitidos deste registro público.

| Passo observado | Evidência e resultado |
| --- | --- |
| DNS e HTTPS | Sites confirmou domínio/provedor ativos e SSL ativo |
| Revisora | `CAMALEAO_REVIEWER_SUBJECT` configurado na revisão de ambiente 4 |
| Conta cliente | Entrada autenticada, necessidade persistida e diagnóstico inicial preparado |
| Conta revisora distinta | Revisão humana e publicação registradas por outro sujeito na auditoria |
| Versão publicada | Versão 2 aprovada e publicada com o mesmo hash |
| Leitura do cliente | Usuário confirmou visualmente **Diagnóstico publicado · versão 2** em 11/10 |

**Aceite:** o percurso positivo cadastro → diagnóstico → revisão → publicação → consulta funcionou com duas identidades distintas no Site privado. A confirmação visual foi realizada pelo usuário; não atribuir essa evidência a um navegador automatizado.

Esse aceite não comprova testes negativos de acesso cruzado em todas as superfícies, recuperação de backup, novas funcionalidades, faturamento OpenAI, n8n, WhatsApp ou MCP remoto. A atualização destes documentos em 17/10 não representa repetição do teste humano.

## Publicação inicial e testes locais — histórico de 11/10

- 23 testes Python e 22 testes Node passaram: isolamento, identidade ausente, origem externa, reenvio idempotente, revogação, concorrência de versões/publicação, rollback transacional e persistência após reabrir SQLite.
- A jornada HTTP de teste usou o schema SQL real para cadastro → diagnóstico por critérios → revisão humana → publicação de versão/hash correspondentes.
- TypeScript sem emissão e build Sites/Vinext passaram. QA automatizado por navegador não foi executado naquela entrega porque o controle previsto não estava disponível.
- Primeira publicação privada: origem Sites `48d4ab243c4de5d1ed8b1bac85d4e9c6911a3022`, implantação `appgdep_6acb0eda81a08191b57b8cfd2a609e92`.
- A inspeção inicial do banco confirmou binding `DB` e cinco tabelas: `portal_memberships`, `portal_intakes`, `portal_revisions`, `portal_approvals`, `portal_audit`.
- O modo do diagnóstico era determinístico; OpenAI, n8n, WhatsApp e MCP remoto não foram ativados para essa homologação.

As pendências iniciais de DNS, revisora e percurso positivo cliente/revisora foram posteriormente resolvidas conforme o registro humano acima. A recuperação após reabrir SQLite é um teste local e não equivale a restauração de backup hospedado.

## Laboratório offline inicial — histórico preservado

Data: 11/10/2026. Ambiente local, sem chamadas pagas ou dados reais de clientes.

| Verificação | Resultado informado na entrega inicial |
| --- | --- |
| `python3 -m unittest discover -s tests -v` | 23 testes locais passaram |
| `python3 scripts/demo.py` | Diagnóstico determinístico; dados restritos bloqueiam envio externo; custo não verificado |
| Leitura de seis arquivos JSON | Sintaxe válida |
| `node --check` no script da interface | Sintaxe válida |
| Revisão estática de núcleo e MCP | Profundidade JSON/Unicode tratados com testes de continuidade |
| Busca textual de marca antiga | Nenhuma ocorrência nos arquivos daquela entrega |

O laboratório cobre intake estrito, tipos, bloqueio de saída, acesso A/B, reservas concorrentes abstratas, idempotência e estados incertos. As aprovações experimentais são vinculadas a hash/versão/alvo/teto/expiração; o stdio cobre inicialização, catálogo, chamadas e entradas inválidas. Isso descreve os testes do núcleo offline, não um ledger de moeda implantado.

As reservas do laboratório Python vivem em memória, usam unidades abstratas e são perdidas com o processo. Não fornecem controle de fatura. SDK/cliente MCP reais, protocolo remoto, OAuth e execução externa não foram homologados por esses testes.

## Próxima entrega — preparação de IA em 17/10

Base de código revisada: PR #3, SHA `89e1f3e0bfde7d962e31439fb832574070e3b5e1`. O Sites informou origem `5ce6ee9b7e11a6799bac4930eec19be5806fef33` e implantação `appgdep_6aceace9bd8c8191b6333edc5b300408` na inspeção; o estado de uma nova implantação e a equivalência final com o código desta preparação ainda exigem verificação própria.

| Gate desta preparação | Estado |
| --- | --- |
| Correção de paginação e limite de revisão | PR #4: 53 testes Node passaram; páginas de 25 e revisão máxima Unicode bruto/escapado |
| Ledger D1 e concorrência de orçamento | 11 testes do adaptador e 12 de integração SQLite passaram; reserva persistente, limites e bloqueio de resultado incerto |
| Adaptador OpenAI simulado e políticas | Provedor injetado nos testes; nenhuma chamada real. Revisão interna e publicação de versão exata testadas |
| TypeScript, build e CI da nova fatia | 76 testes Node, TypeScript, lint exigido pela CI e build Sites passaram localmente; CI remota pendente |
| Nova implantação com API desligada | Sites versão 3 publicada com sucesso, ambiente revisão 4; somente variável da revisora configurada, sem chave OpenAI |
| Chamada OpenAI real | Não executada; exige chave protegida e orçamento autorizado |
| n8n, WhatsApp e MCP remoto | Inativos para esta jornada |

O contrato planejado e os casos de aceite estão em [ENTREGA-02-IA.md](ENTREGA-02-IA.md). Só substituir pendente por aprovado após obter a evidência correspondente. Registro de CI deve indicar o SHA e o resultado remoto; testes locais não comprovam CI verde.

### Testes locais da Entrega 02 — 17/10/2026

Comandos no diretório `apps/site`: `node --test tests/*.test.mjs` (76/76), `tsc --noEmit`, lint dos quatro arquivos exigidos pela CI e build nativo do Sites. Banco SQLite real executa as migrations D1. A migração preservou os registros de um banco preenchido e passou `foreign_key_check`. Foram testadas revogação de cliente/revisora durante resposta e revogação no mesmo milissegundo: o CAS usa também `operation_token`, além de versão/hash/data. Não houve chave, API paga ou identidade nativa simulada em produção.

### Implantação hospedada da Entrega 02

- Sites versão **3**, origem `185b5c0349eabe3c5e5b51d51b5e1f024ab616ce`.
- Implantação `appgdep_6ad3d62286c88191a90c6f2df7a470f3`: `succeeded` em 17/10/2026 20:10:30 UTC (17:10:30 em São Paulo).
- Ambiente revisão 4 aplicado; `OPENAI_API_KEY` ausente e IA paga desativada por padrão.
- Audiência preservada: proprietária e uma visitante externa, acesso privado.
- Migração aplicada: sexta tabela `portal_ai_operations`, com **zero operações**.
- Comparação direta antes/depois confirmou preservação integral dos registros existentes: 2 associações, 3 necessidades, 4 versões, 2 aprovações e 9 eventos de auditoria.
- Navegação autenticada na conta revisora confirmou o Console, a fila de 3 pedidos, publicação v2 existente e aviso de IA paga desativada. Nenhuma mutação de pedido foi feita por esse teste de navegação.
- A homologação humana anterior com duas contas está registrada acima. Não foi repetida uma chamada OpenAI real; o teste de API exige configuração e orçamento específicos.
