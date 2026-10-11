# Auditoria UX e validação — 11/10/2026

## Escopo e método
Base: `a000d53d7d7495e1c4114e3cac0544d017bb3e85`, branch `feat/diagnostico-persistente`, PR #1. A proposta usa branch nova e PR dependente dessa branch, para isolar o delta de UX sem incorporar a entrega inteira à main. Não altera PR #1, D1, schema, serviço, permissões ou Site.

O executor selecionado falhou ao iniciar; não houve checkout, terminal ou navegador local. A inspeção e a preparação dos arquivos foram feitas pelo conector GitHub autorizado. Não foi acessado o portal privado nem contornado login. A jornada positiva cliente → revisora → cliente versão 2 foi confirmada pelo usuário em outro chat; é evidência fornecida pelo usuário e não um teste repetido nesta sessão.

Skill Sênior UX/UI consultada, com os módulos interação, humano–IA, validação/acessibilidade, UI/identidade e multiclientes. Fontes oficiais consultadas em 11/10/2026: [React: estado e keys](https://react.dev/learn/preserving-and-resetting-state), [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Chrome Headless](https://developer.chrome.com/docs/automation-and-testing/headless). As fontes orientam o método; não comprovam conformidade ou comportamento em produção.

## Achados e antes/depois
| Gravidade / tarefa | Evidência anterior | Correção proposta | Critério de aceite |
| --- | --- | --- | --- |
| Alta — aprovar e publicar | CaseDetail usava id + draft.hash como key; serviço cria nova versão e hash do conteúdo. Aprovar sem editar pode conservar o hash e o estado confirmed=true | Identidade inclui papel, pedido, versão, status e versões/hashes exibidos; nova confirmação para publicação; origem e versão resultante explícitas | Revisar sem mudar conteúdo gera v2 e deixa publicação desmarcada |
| Alta — recuperar após enviar | POST e GET subsequente no mesmo try, com erro genérico; usuário podia interpretar falha no GET como falha na gravação | Diferencia resposta confirmada de resultado desconhecido; trava novas ações até consultar estado salvo; mantém chave de idempotência do formulário | POST confirmado + GET falhando não repete POST; mostra registrado; recuperar não marca publicação |
| Média — carregar pedidos | Falha inicial deixa data=null e cases=[], mostrando estado vazio e contadores 00 | Estado indisponível separado; contadores — até carregar; ações aguardam sessão/dados | Erro não é apresentado como ausência de pedidos |
| Média — retomar formulário | IntakeWizard desmontado ao voltar à visão geral, perdendo respostas | Mantém formulário em memória da aba e oferece Retomar necessidade; aviso ao fechar/recarregar | Texto e etapa sobrevivem à navegação interna; não promete persistência após fechar |
| Média — teclado e orientação | Etapas trocavam sem mover foco; indicadores dependiam de classes | Foco em etapa, erro e pedido; skip link; aria-current e seleção; texto de próximo passo por papel/status | Foco e percurso verificáveis; avaliação manual completa ainda pendente |
| Média — revisão e dispositivo móvel | Campos editáveis durante envio; controles pequenos usam fontes abaixo de 16px no mobile | Fieldsets bloqueados durante requisições; fontes de entrada 16px no mobile; avisos e navegação quebram linha | Estado enviado não muda enquanto ocupado; largura 320px sem overflow nos cenários testados |

## Estados, transições e limites
| Estado / evento | Próximo estado e recuperação |
| --- | --- |
| GET inicial pendente | Carregamento anunciado; criação indisponível |
| GET falha | Indisponível; conferir estado salvo |
| GET confirma lista vazia | Convite para primeira necessidade |
| Formulário → visão geral → retomar | Rascunho em memória da mesma aba; sem gravação automática no servidor |
| POST retorna versão válida | Conteúdo recebido aparece como salvo; GET atualiza contexto |
| POST sem confirmação, timeout ou 5xx | Resultado desconhecido; não afirmar cancelamento; conferir estado antes de repetir |
| 401 | Entrar em outra aba; preservar tela e atualizar |
| 403/404 | Conferir acessos atuais; nenhuma permissão concedida pelo frontend |
| 409 | Conferir versão salva; atualização de revisão não salva pede confirmação por poder substituir conteúdo |
| Revisão aceita com mesmo hash | Nova versão/status mudam identidade do componente; publicação exige novo checkbox |
| Publicação | Serviço continua conferindo versão/hash/aprovação e autorização atomicamente |

Uma key de interface não é controle de autorização. O serviço existente mantém subject confiável, membership ativo, isolamento, revisão explícita, CAS de versão e publicação da mesma versão/hash. Não foi alterado. O plano financeiro continua referência; a interface não concede consentimento para consumo pago nem autorização de gastos.

## Validação preparada
- `node --test apps/site/tests/*.test.mjs`: testes existentes de serviço/HTTP com SQLite local e 10 novos testes de contexto de revisão, recuperação, respostas inválidas e timeout.
- CI offline existente: `python3 -m unittest discover -s tests -v` e demonstração determinística.
- CI de build adicionada ao workflow existente, usando pnpm fixado e dependências do lockfile: lint do código alterado, `tsc --noEmit`, `npm run build`.
- Browser: fixture isolada compila o PortalClient real e seu CSS com React/Vite já presentes; Chrome do runner exercita quatro cenários em 1280px e 320px. HTTP e identidade são explicitamente fictícios. Não testa autenticação Sites, D1 hospedado ou jornada real entre contas; não há chamada ao portal privado.
- Não foram adicionadas dependências, credenciais, servidores hospedados ou serviços pagos. O runner temporário serve arquivos em 127.0.0.1 apenas durante o teste; não é infraestrutura de produto.
- Nenhum desses comandos foi executado localmente nesta sessão. Resultados remotos e SHA serão registrados no PR; não considerar testes preparados como aprovados.

## Pendências comerciais e de segurança
Continuam pendentes as negativas hospedadas entre clientes, revogação individual, restauração e controles atômicos de orçamento/consentimento antes de ativar OpenAI. Testes locais de revogação/isolamento do serviço não substituem esses gates. A IA externa permanece desligada. Não se alteraram permissões/D1/serviço para “fechar” esses itens.

Faltam ainda revisão manual com teclado/leitor de tela, contraste/reflow em estados não cobertos, avaliação formativa com cliente, aceite do escopo, preço e critério de sucesso do piloto. A identidade Camaleão e componentes existentes foram preservados. Nenhum código ou asset do Radar foi reutilizado.

## Demonstração proposta — 90 segundos
Roteiro a ensaiar; duração e eficácia ainda não medidas. Usar fixture explicitamente fictícia da interface em ambiente de revisão, ou um pedido já autorizado; não divulgar dados reais.
- 0–20s: mostrar objetivo e dados fictícios; apontar etapa e próximo passo.
- 20–45s: mostrar recomendação, lacunas e referências que precisam de confirmação.
- 45–70s: na visão da revisora, explicar versão de origem e aprovar no ambiente fictício; conferir a nova versão e a exigência de confirmação separada.
- 70–90s: mostrar o conteúdo de uma versão publicada fictícia e a próxima decisão: combinar com o cliente uma entrega pequena, o responsável pelo aceite e como verificar resultado.

Destrava uma demonstração honesta de diagnóstico/revisão e reduz perda/repetição de trabalho. Não representa execução automática de infraestrutura, IA paga pronta, piloto contratado ou integração já publicada. Próxima ação real: revisar com um potencial cliente as informações faltantes e um escopo com aceite verificável; nenhuma mensagem, postagem ou cobrança foi enviada.

## Execução confirmada na CI
Código validado: `58dcbf0ef8ef70ed5fc587e6b09d3d892eecd7a5`, PR [#2](https://github.com/ofelipepeixoto/camaleao-infra-portal/pull/2).
[Run 38119159119](https://github.com/ofelipepeixoto/camaleao-infra-portal/actions/runs/38119159119), GitHub Actions/Ubuntu com Node 24 e pnpm 11.25.0:
- Offline: 23 testes Python aprovados e demonstração determinística concluída.
- Portal: 32 testes Node aprovados (22 existentes + 10 novos), 0 falhas.
- Build: instalação congelada, lint dos arquivos de cliente alterados, TypeScript e build Vinext aprovados.
- Navegador: fixture do PortalClient/CSS em Chrome real, quatro cenários aprovados em 1280px e novamente em 320px (oito execuções). Inclui confirmação desmarcada na versão 2 com mesmo hash, retomada de texto/etapa, foco de erro e recuperação sem novo POST.
- HTTP/identidade da fixture são fictícios; o servidor de arquivos é local ao runner. Não há teste da hospedagem, integração real ChatGPT ou alteração de D1 neste resultado.

Revisão final do diff: mudanças em interface, helper de recuperação, testes, CI e este relatório; nenhum delta em portal-service.mjs, portal-http.mjs, schema/migrações, autenticação, permissões, orçamento ou consentimento. Nenhum merge/deploy foi executado. A atualização posterior deste relatório altera somente documentação; resultados acima pertencem ao SHA explicitado.
