# Segurança e homologação — Camaleão Infra Portal

Data: 11/10/2026. Natureza: revisão do desenho proposto, com requisitos verificáveis para a implementação.

## 1. Decisão de segurança

O primeiro produto permite ao cliente explicar sua necessidade, organizar evidências, receber um diagnóstico e acompanhar um plano preparado pela Agência Camaleão. A IA pode consultar informação autorizada e preparar propostas. A implantação de infraestrutura segue uma execução operada por pessoa responsável, em ambiente definido e após aprovação da versão concreta da mudança.

O repositório inicial contém planejamento, contratos e demonstração local. Os requisitos abaixo são critérios de implantação, e não comprovação de controles já operantes. Não houve auditoria da VPS, do Supabase, do n8n, de contas OpenAI, de Meta ou do site publicado da Agência Camaleão.

| Estágio | Uso admitido | Evidência necessária |
| --- | --- | --- |
| Demonstração local | Dados fictícios; demonstração do diagnóstico; ferramentas MCP experimentais em processo local | Testes dos contratos e comportamento local registrado no README |
| Homologação isolada | Contas de teste, usuários nomeados e documentos autorizados | Autenticação, isolamento, custos, retomada e recuperação demonstrados no ambiente escolhido |
| Piloto com cliente | Consulta e preparação; revisão técnica; responsabilidade e condições comerciais definidas | Gates G1 a G7 aprovados, com evidências e pendências aceitas |
| Execução de mudanças | Operador específico, alvo cadastrado, aprovação válida e plano de retorno | Gate G8 por conector e tipo de mudança; nenhum comando livre gerado pela IA |

## 2. Fronteiras de confiança

| Componente | Responsabilidade | Limite |
| --- | --- | --- |
| Interface no Sites | Coletar respostas simples, apresentar diagnóstico e andamento | O navegador não guarda chaves de fornecedores, não decide autorização e não acessa consoles de infraestrutura |
| API da Agência Camaleão | Verificar identidade, associação à organização, permissões, orçamento e transições de estado | Toda operação relevante passa por validação no servidor |
| OpenAI Responses API | Produzir diagnóstico e plano estruturado com contexto mínimo autorizado | Saída do modelo é proposta; não pode conceder permissão, aumentar cota ou aprovar ação |
| MCP próprio | Expor funções pequenas de consulta e preparação | Catálogo fixo e versionado; sem shell, SSH, SQL arbitrário, Terraform apply, Docker socket ou HTTP genérico |
| n8n interno | Receber eventos aprovados pela API e organizar tarefas operacionais | O cliente e o modelo não editam workflows, expressões, URLs, credenciais ou nós |
| PostgreSQL/Auth/storage | Guardar identidade, associação, estado, documentos e evidências | Segregação por organização e documento; acesso de serviço mínimo |
| Operador humano | Revisar proposta, alvo, estimativa, dependências e procedimento | Sua aprovação não substitui validações técnicas, nem autoriza versões futuras |

Documentos, mensagens, inventários declarados, resultados de ferramentas e instruções contidas em arquivos são dados não confiáveis. O sistema valida esses dados antes de usá-los e impede que alterem sua política de acesso.

## 3. Modelo de ameaças prioritárias

Todos os itens nesta tabela são ameaças de projeto. Não representam vulnerabilidades confirmadas de um ambiente real.

| ID | Condição concreta | Impacto | Prioridade | Controle e verificação exigidos |
| --- | --- | --- | --- | --- |
| SEC-01 | Cliente troca `organization_id`, `project_id` ou `document_id` na requisição | Leitura ou alteração de informação de outro cliente | P0 | Resolver organização a partir da sessão e associação persistida; testar A contra objetos de B pela API, storage, busca, download, exportação e MCP |
| SEC-02 | Documento orienta a IA a revelar informações ou chamar ferramenta indevida | Exfiltração e proposta manipulada | P0 | Contexto mínimo, catálogo restrito, autorização por ferramenta e tratamento do documento como dado; testar PDF/texto com instrução adversarial |
| SEC-03 | Aprovação de uma versão é reutilizada para outro alvo, custo ou mudança | Alteração de infraestrutura sem consentimento correspondente | P0 | Vincular aprovação a hash, versão, alvo, limites e expiração; negar qualquer divergência e consumo repetido |
| SEC-04 | Chamadas simultâneas ou retries ultrapassam a cota | Custo não previsto e indisponibilidade | P0 | Reserva atômica antes da chamada; considerar reservas em andamento; limitar tokens, etapas, duração, volume e concorrência; reconciliar utilização |
| SEC-05 | URL de inventário, integração ou arquivo aponta para localhost/metadados de cloud | Acesso a serviço interno ou credenciais | P0 | Usar alvos cadastrados; bloquear URL livre; política de egress; validação de DNS e redirects nos conectores que precisam de HTTP |
| SEC-06 | Credencial administrativa é enviada no chat, ao modelo ou no bundle web | Comprometimento de contas e serviços | P0 | Formulário protegido de credenciais, referências opacas ao cofre e redaction; varredura de código, artefatos e logs antes de publicação |
| SEC-07 | Webhook repetido ou processo reiniciado dispara a mesma tarefa | Duplicação de custo, mensagem ou mudança | P0 | Inbox/outbox persistidas, chave única, leases e reconciliação; testar repetição, concorrência e queda após aceitação do fornecedor |
| SEC-08 | Documento perde permissão, mas vetor, cache ou resposta antiga continua acessível | Exposição após revogação | P0 | ACL na ingestão, recuperação e entrega; versões de ACL; invalidação de cache e fila; negação imediata do documento revogado |
| SEC-09 | Modelo envia argumento manipulando expressão de n8n, SQL ou comando | Execução de código e alteração indevida | P0 | JSON Schema fechado, queries parametrizadas e templates fixos; nenhuma concatenação da saída do modelo em comandos ou expressões |
| SEC-10 | Upload malformado, enorme, HTML ativo ou arquivo comprimido abusivo | Exaustão de recursos ou ataque ao parser/visualizador | P1 | Limites de bytes/páginas/tempo, inspeção MIME, quarentena, processamento isolado e renderização de texto sem HTML ativo |
| SEC-11 | Contexto confidencial é enviado a fornecedor incompatível com o contrato | Descumprimento do compromisso de localização e controle de dados | P0 | Classificação e política de egress por projeto; mostrar fornecedores e regiões reais; bloquear caminho externo quando não permitido |
| SEC-12 | Backup existe, mas não é restaurável; estado depende de memória do processo | Perda de projeto, evidência ou aprovação | P1 | Persistência transacional, backup, ensaio de restauração e retomada após restart; documentar RPO/RTO medidos |
| SEC-13 | MCP aceita token destinado a outro serviço ou mistura identidades | Acesso por permissão de outro usuário/cliente | P0 | Validar emissor, público, expiração e escopos; credenciais separadas por recurso; consentimento por cliente quando houver proxy OAuth |
| SEC-14 | Mensagem de WhatsApp se passa por cliente ou amplia uma autorização | Aprovação inválida ou divulgação a destinatário errado | P1 | Vincular canal e identidade, destino cadastrado e consentimento; WhatsApp notifica ou coleta triagem, mas aprovação sensível acontece no portal autenticado |

P0 bloqueia o piloto se o caminho correspondente estiver habilitado. P1 deve ter correção ou mitigação documentada antes de exposição a clientes. A ausência de um conector no piloto reduz a superfície de ataque; não comprova a segurança desse conector futuro.

## 4. Isolamento entre organizações

### Identidade e autorização

- O backend valida assinatura, emissor, público, expiração e estado da sessão, além de associação ativa à organização. `organization_id` fornecido por navegador, modelo ou webhook não concede acesso.
- A associação e o papel são administrados por operações próprias. O usuário não pode promover seu papel, mudar a organização de um objeto ou aceitar convites de forma indireta pelo modelo.
- Papel inicial: cliente acompanha o próprio projeto; consultor atende organizações atribuídas; revisor autoriza versões sob sua responsabilidade; administrador gerencia o serviço. Acesso administrativo fica auditado e exige MFA.
- Toda consulta, alteração, exportação e download verifica organização, projeto e permissão do objeto. Um identificador difícil de adivinhar não substitui autorização.

### Banco e armazenamento

- Tabelas do domínio possuem chave de organização e relacionamentos que impedem referenciar objetos de outra organização. Migrações criam grants e RLS em conjunto.
- O papel normal do backend não tem `BYPASSRLS`, não é proprietário das tabelas e não depende de credencial administrativa para consultar dados de clientes. Trabalho administrativo usa identidade separada e autorização específica.
- Revisar views, RPCs e funções privilegiadas; quando aplicável, usar `security_invoker`, `search_path` restrito e grants explícitos. Testar com a identidade real usada pela aplicação, além de testes no SQL Editor.
- Buckets privados, caminho por organização, política de acesso e URLs assinadas curtas. Revalidar permissão no momento de emitir o link; sua validade curta é parte do risco residual após revogação.
- Vetores e chunks conservam `organization_id`, `document_id`, versão do documento e versão de ACL. A seleção autorizada ocorre antes de entregar contexto ao modelo.
- Cache inclui organização, identidade ou conjunto efetivo de permissões, versões do conteúdo e política. Memória conversacional e índices nunca são compartilhados apenas por semelhança de perguntas.

### Revogação e descarte

Revogar acesso deve impedir novas consultas imediatamente. A remoção definitiva abrange original, chunks, embeddings, caches, exportações e tarefas pendentes, com política declarada para retenção de logs e backups. Um trabalhador de fila verifica novamente a ACL ao executar; uma autorização antiga não mantém acesso.

## 5. Contrato da aprovação humana

Aprovar diagnóstico, contratar serviço, permitir acesso a um fornecedor e autorizar uma mudança de infraestrutura são decisões diferentes. A tela apresenta em linguagem simples o objeto concreto de cada decisão.

Para mudança futura, o backend congela um artefato com pelo menos:

| Campo | Regra |
| --- | --- |
| Identidade | Organização, projeto, tipo de ação e responsável pela aprovação |
| Versão | `proposal_id`, revisão, versão do template e versão da política |
| Hash | SHA-256 dos bytes canônicos do artefato completo; o formato de canonicalização é especificado e testado |
| Alvo | Conta, recurso cadastrado, ambiente e regiões; nenhuma URL ou credencial livre |
| Pré-condições | Versões/configurações esperadas do alvo e janela de mudança |
| Limites financeiros | Custo máximo aprovado, moeda, taxa de conversão ou referência, prazo e custos recorrentes separados |
| Limites operacionais | Ações permitidas, duração, volume, concorrência, tentativa máxima e procedimento de retorno |
| Dados | Classes de dados e fornecedores autorizados a recebê-los |
| Validade | Criação, expiração, identidade autenticada do aprovador, escopo e estado de consumo |

Regras de aplicação:

1. A aprovação ocorre em endpoint autenticado separado, com verificação de papel e proteção CSRF quando a sessão usa cookies. O modelo não tem ferramenta para aprovar.
2. O servidor calcula o hash; um hash enviado pelo navegador não é evidência de integridade. O aprovador visualiza a versão congelada, o alvo e o teto.
3. Mudar custo, alvo, escopo, dados, política, template ou artefato invalida a autorização. Alterar pré-condição do recurso exige nova validação e, quando material, nova aprovação.
4. Na execução, verificar aprovação, hash, validade, papel atual, política atual e cota. Consumir autorização e criar comando/outbox na mesma transação.
5. Autorização expirada, revogada, usada ou de outra organização falha com negação; silêncio, uma mensagem no chat e um checkbox local não concedem autorização.
6. Mudanças de alto impacto exigem revisão técnica independente e aprovação comercial do cliente conforme política definida. O MVP não promete execução remota automatizada.

## 6. Estado durável, outbox e n8n

Fluxos de produto seguem estados persistidos, como rascunho, evidências solicitadas, revisão, proposta preparada, decisão pendente, aprovada, recusada, expirada e concluída. Os nomes definitivos seguem o contrato do projeto. A transição válida é feita pelo backend em função de ator, versão e evento; a IA apenas sugere conteúdo.

- Gravar mudança de estado e evento de outbox na mesma transação do PostgreSQL. Se a transação falhar, nenhum webhook deve ser tratado como autorização.
- Cada evento contém ID estável, organização, projeto, versão e tipo. Inbox possui chave única para rejeitar repetição; a resposta do webhook não comprova conclusão da tarefa.
- Autenticar API → n8n com credencial de serviço limitada, TLS e controles de replay. Se houver assinatura HMAC, verificar o corpo bruto, timestamp e nonce; não assinar JSON reserializado sem contrato.
- Worker usa lease com expiração, backoff limitado e dead-letter queue. Retoma depois de restart; registra resultado sem documento completo, token ou senha.
- Para ação externa, reutilizar a chave idempotente do fornecedor quando disponível. Sem esse recurso, persistir correlação e reconciliar o estado antes de tentar novamente. Não afirmar execução exatamente uma vez em chamadas externas sem essa prova.
- Selecionar workflows pelo tipo interno do evento. O payload não escolhe workflow arbitrário, expressão, nó, credencial, URL ou destino.
- n8n é console interno operado pela Camaleão. Templates de integração no repositório permanecem inativos até validação do ambiente, das credenciais e da versão.

## 7. Orçamento com bloqueio na aplicação

Há limites por organização, projeto, usuário e operação. A API reserva o custo máximo conservador antes de iniciar a chamada e rejeita novas operações quando o saldo disponível não cobre a reserva. A operação que não tem estimativa confiável usa teto restrito ou permanece bloqueada.

O cálculo considera entrada, saída máxima, embeddings, OCR, ferramentas cobradas, reprocessamentos e tentativas possíveis. Reservas em andamento contam contra o saldo. A mesma chave de operação não reserva duas vezes. Tarifas, modelo e referência cambial utilizados ficam versionados; uma mudança de preço que invalida o teto suspende novas chamadas.

Limitar tamanho de contexto, saída, número de ferramentas, etapas do agente, duração, uploads e concorrência. Se o serviço de orçamento estiver indisponível, negar nova operação cobrada. Alertas do fornecedor complementam o controle local.

O bloqueio da aplicação impede novas chamadas acima de seu limite configurado. A fatura externa ainda pode incluir chamadas já enviadas, cobrança tardia, arredondamento ou variação tarifária. Homologar reserva, reconciliação e contingência antes de apresentar um teto financeiro contratual. Recursos persistentes, como servidores e GPUs, exigem limite e política de desligamento próprios; um teto de tokens não limita sua conta mensal.

## 8. MCP, entrada de dados e rede

### Ferramentas MCP

Catálogo inicial: consultar catálogo de soluções, consultar projeto autorizado, validar briefing, preparar diagnóstico e preparar plano. Escritas preparatórias, se implementadas, só criam artefatos no domínio autorizado; não recebem poderes administrativos externos.

- JSON Schema estrito, campos e enums permitidos, limites de string/lista e rejeição de campos desconhecidos.
- Contexto de organização vem da identidade da conexão e de política do servidor; a ferramenta não aceita organização como autoridade do modelo.
- Descrições, schemas e implementação versionados e revisados juntos. Anotações como `readOnlyHint` orientam o cliente, mas não impõem acesso.
- Servidor remoto, se necessário, usa autenticação e validação do público do token. Não encaminhar token de outro serviço como autorização do MCP.
- Cliente OpenAI recebe somente ferramentas aprovadas e mínimo contexto. Aprovação da API OpenAI complementa a política da aplicação; não substitui aprovação financeira ou de mudança.
- A demonstração em stdio é experimental e local. Não comprova MCP remoto com OAuth, identidade de clientes, TLS e segregação de produção.

### Uploads e HTTP

O cliente envia arquivo autorizado ou referência interna cadastrada. Não permitir que a IA busque uma URL arbitrária para inventariar servidores. Conectores com HTTP recebem ID de alvo cadastrado, resolvido no backend.

Onde URL externa for requisito real: aceitar somente esquema e portas permitidos, bloquear credenciais na URL, redes privadas, loopback, link-local e metadados de cloud; validar IPv4/IPv6, resolução DNS e cada redirect com biblioteca apropriada; aplicar egress de rede, timeout e tamanho de resposta. Uma integração interna necessária recebe exceção específica, com host controlado e serviço identificado, sem liberar uma rede privada inteira.

Uploads passam por tamanho máximo, MIME/magic bytes, número de páginas e limite de CPU/memória/tempo; conversores executam isolados, sem rede e sem permissões da API. Saída visível é escapada; links e HTML retornados pelo modelo não podem executar código na interface.

## 9. Dados, fornecedores e compromisso de soberania

| Modalidade de projeto | Política exigida | Comunicação ao cliente |
| --- | --- | --- |
| API gerenciada autorizada | Contexto mínimo e classes de dados permitidas para fornecedor contratado | Informar fornecedor, localização contratual aplicável, retenção e subprocessadores verificados |
| Híbrida | Separar conteúdo local de conteúdo que pode sair; regras por documento e tarefa | Explicar quais dados permanecem privados e quais operações usam serviço externo |
| Inferência privada | Runtime, dados, vetores e logs no perímetro contratado; bloquear caminhos externos incompatíveis | Demonstrar o perímetro, controle de chaves, operação e testes de egress |

A opção por OpenAI API ou banco hospedado exige verificar condições reais de região, retenção, subprocessadores e contrato. Não chamar o produto de LLM soberana apenas por possuir VPS, containers ou prompt próprio. A modalidade privada fica como expansão sujeita a custo, capacidade e validação.

Credenciais ficam em mecanismo de segredos, com escopo, rotação e registro de acesso. No portal, usar conexão protegida ou fluxo OAuth adequado; no diagnóstico, pedir tipo de provedor, recursos e evidências sem senha. O modelo recebe referência opaca e resultados mínimos, nunca o segredo. Logs e traces têm minimização, redaction e prazo de retenção por classe de dado.

## 10. Canal Meta/WhatsApp futuro

WhatsApp Oficial pode oferecer triagem, notificação de pendência e link para o portal. Habilitar envio somente após definição de identidade comercial, número, permissões, destinatários, consentimento e política vigente de mensagens. A integração valida autenticidade de webhook, destino e deduplicação; tokens não transitam no prompt.

Não usar recebimento de mensagem como aprovação de infraestrutura. A pessoa conclui a decisão no portal autenticado e visualiza versão, alvo e custos. Notificações evitam documentos confidenciais e enviam links que exigem autorização.

## 11. Gates de homologação

| Gate | Critério de GO | Evidência mínima | Bloqueio correspondente |
| --- | --- | --- | --- |
| G1 — Identidade e isolamento | Contas A/B separadas e papéis válidos; nenhuma leitura ou alteração cruzada | Testes da API, RLS, storage, RAG, cache, exports, MCP e revogação | Dados reais de clientes |
| G2 — Credenciais e publicação | Bundle, repositório, logs e workflows sem segredos; cofre e rotação definidos | Secret scan, inspeção de build e teste de acesso dos papéis de serviço | Conexão com fornecedores reais |
| G3 — IA e documentos | Schema validado, citações autorizadas, injection sem acesso extra e egress aplicado | Perguntas de referência e casos adversariais, erros/recuas registrados | Diagnósticos automáticos com documentos reais |
| G4 — Custo | Reserva concorrente, retry limitado, bloqueio e reconciliação corretos | Corrida por saldo final, falha do ledger, timeout e fatura divergente | Chamadas cobradas abertas ao cliente |
| G5 — Estado e integração | Reinício e eventos repetidos não perdem estado nem repetem efeitos | Testes de interrupção, leases, inbox/outbox e reconciliação do conector | Automação persistente e tarefas externas |
| G6 — Operação e recuperação | Backup restaurado; monitoramento e resposta operacional exercitados | Ensaio isolado de restauração, RPO/RTO medidos, responsáveis e rollback | Dependência comercial do serviço |
| G7 — Contrato e dados | Fornecedores, finalidade, retenção, exclusão e responsabilidades definidos | Registro da decisão e política de egress aplicada por projeto | Promessa comercial de privacidade/localização |
| G8 — Mudanças reais | Aprovação vinculada à versão, limite e alvo; conector determinístico; procedimento de retorno | Mutação de hash/alvo/teto, expiração, revogação, replay e falha após envio | Execução de alteração de infraestrutura |

Cada evidência registra SHA, versões, configuração relevante, comando/procedimento, data, resultado e limitações sem segredos. CI local verde não homologa conexão PostgreSQL, integração OpenAI, n8n, Meta, Sites ou ambiente de cliente.

## 12. Casos negativos indispensáveis

1. Usuário A tenta abrir, buscar, exportar e apagar objetos de B, inclusive com IDs válidos.
2. ACL de um documento muda durante uma tarefa enfileirada; nenhum chunk, citação ou download é entregue após a revogação.
3. PDF inclui instrução de revelar credenciais e executar comando; a IA não recebe essa ferramenta nem segredo, e a API nega qualquer tentativa fora do contrato.
4. Três chamadas tentam consumir o último saldo simultaneamente; somente operações com reserva válida são enviadas.
5. Aprovação é alterada, expirada, revogada ou repetida; nenhuma tarefa de execução é criada.
6. Processo cai antes/depois do commit, do envio e do retorno externo; estado é recuperado e evento é reconciliado.
7. URL redireciona para localhost ou metadados, ou muda DNS para IP privado; nenhuma conexão indevida é realizada.
8. Token com público incorreto, sessão inválida ou associação removida é rejeitado pelo backend e MCP remoto.
9. Arquivo ultrapassa limites ou usa formato ativo; processamento encerra com falha controlada e sem impacto nos demais clientes.
10. Backup é restaurado em ambiente isolado e projeto/aprovações/logs de auditoria são recuperados com consistência.

Esses são cenários de homologação planejados. Registrar resultados reais quando executados; não marcar teste como aprovado por existir no documento.

## 13. Limites da entrega inicial

A demonstração offline e os contratos experimentais ajudam a revisar UX e lógica preparatória. Eles não comprovam autenticação real, RLS de produção, persistência de servidor, outbox distribuída, orçamento faturado, backup, MFA, isolamento de rede ou integração com serviços externos. Usar dados fictícios até que o gate correspondente tenha evidência.

Uma decisão de GO sempre identifica o ambiente e o escopo autorizado. O GO do diagnóstico não habilita execução de infraestrutura; o GO de um conector não habilita todos os demais.

## 14. Fontes técnicas verificadas

Consultadas em 11/10/2026. As decisões e gates deste documento são recomendações de arquitetura para o projeto.

- [OpenAI — MCP servers](https://developers.openai.com/api/docs/guides/tools-connectors-mcp): ferramentas MCP, aprovação e risco de prompt injection.
- [OpenAI — Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety): tratamento de entradas não confiáveis e limitação do impacto de ações do agente.
- [Model Context Protocol — Security Best Practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices): validação de público, proibição de token passthrough, consentimento por cliente e SSRF.
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): RLS, views/funções privilegiadas e risco de credenciais que ignoram políticas.
- [n8n — Enable SSRF protection](https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/enable-ssrf-protection.md): proteção adicional à política de rede. A documentação consultada indica disponibilidade desde 2.12.0; a versão efetivamente instalada deve ser identificada antes de aplicar configuração.

