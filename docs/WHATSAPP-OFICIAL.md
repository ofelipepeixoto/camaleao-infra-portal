# WhatsApp oficial — canal opcional do Camaleão Infra

Data de consulta: 11/10/2026. Marca e portal: Agência Camaleão, https://camaleaoweb3.com.br/.

## Decisão de produto

Adicionar WhatsApp na fase 2, depois que diagnóstico, autenticação, isolamento de clientes e revisão humana funcionarem no portal. O canal facilita o primeiro contato, encaminha para um diagnóstico guiado e avisa sobre avanços solicitados pelo cliente. O portal guarda o histórico verificável, documentos autorizados, propostas e aprovações.

Exemplo de entrada: “Quero organizar minha infraestrutura de IA”. O atendimento oferece três caminhos: começar diagnóstico, acompanhar projeto ou falar com uma pessoa. O diagnóstico reúne empresa, objetivo, stack atual, volume aproximado, orçamento por faixa e prazo. Uma pergunta por vez, com alternativas claras e opção de continuar no portal.

Não solicitar senhas, tokens, chaves privadas, documentos pessoais completos ou arquivos confidenciais pelo WhatsApp. Uploads e configuração de credenciais usam uma sessão autenticada no portal e um canal protegido específico. O atendimento explica quando algo será encaminhado à equipe e identifica o uso de automação.

## Regras oficiais verificadas

- A política exige número fornecido e autorização para contatos posteriores, além de respeitar pedidos de saída.
- A janela de atendimento dura 24 horas e reinicia a cada mensagem do usuário; fora dela, somente templates aprovados. Iniciar contato exige template aprovado.
- Atendimento automatizado precisa oferecer um caminho claro para atendimento humano. Mensagens de outros clientes não podem ser compartilhadas.
- A cobrança da plataforma é por mensagem entregue, conforme mercado e categoria. A fonte oficial informa isenção de mensagens de serviço e algumas mensagens utilitárias em resposta ao usuário; confirmar condições no momento da implantação.

Fontes: [Política de mensagens](https://whatsappbusiness.com/policy/), atualizada em 23/09/2026; [preços oficiais](https://whatsappbusiness.com/products/platform-pricing/).

Os [termos da solução](https://www.whatsapp.com/legal/business-solution-terms?lang=ur), modificados em 06/03/2026, contêm condições específicas para provedores de IA, exceções geográficas e restrições ao uso dos dados para treinamento. A decisão de produto é manter o canal dedicado ao atendimento dos serviços de infraestrutura da Agência Camaleão. Rever termos e elegibilidade antes de expandir o canal para um assistente de IA de uso geral.

## Arquitetura proposta

| Componente | Responsabilidade |
| --- | --- |
| Cloud API oficial | Transporte de mensagens pelo número empresarial autorizado |
| Entrada HTTPS do backend | Verificação do webhook, validação de eventos e persistência em fila |
| Serviço de identidade | Associação explícita do contato à pessoa e à organização do portal |
| Backend Camaleão Infra | Autorizações, estado do projeto, cotas, consentimentos e intenções de envio |
| OpenAI API | Triagem e redação limitada, com dados mínimos e regras de atendimento |
| n8n | Orquestração de eventos já validados, filas de atendimento e avisos autorizados |
| MCP | Consultas permitidas e preparação de ações, com autorização aplicada no servidor |
| Equipe humana | Exceções, revisão de propostas e execução de ações de infraestrutura |

MCP e n8n consomem as mesmas regras do backend. Mensagem recebida e instrução do modelo não equivalem a autorização para acessar outra organização, implantar infraestrutura, contratar serviço ou mudar custos.

### Identidade e vínculo

1. Um contato novo pode iniciar uma triagem com dados comerciais mínimos.
2. O cliente entra no portal, confirma a conta e solicita vinculação do contato.
3. O backend gera um desafio temporário, de uso único, vinculado à sessão e à organização; o cliente confirma o vínculo pelo fluxo autorizado.
4. Vínculo não concede automaticamente permissão administrativa. Ao trocar de organização, o backend confirma associação e papel novamente.
5. Informações sensíveis, documentos e aprovações de infraestrutura requerem autenticação no portal. A notificação contém texto mínimo e link para a página que exigirá login.

## Webhooks e confiabilidade

O GET de verificação deve comparar o verify token e devolver o desafio válido. O POST precisa verificar `X-Hub-Signature-256` por HMAC-SHA256 usando o App Secret e os bytes originais do corpo, com comparação em tempo constante. O verify token não substitui o App Secret. Rejeitar assinatura ausente ou inválida antes de interpretar o evento.

Aplicar limite de tamanho, validar tipo de evento e WABA/número esperado, persistir em fila durável e confirmar recebimento rapidamente. Deduplicar eventos de mensagem separadamente de seus estados de entrega/leitura para preservar mudanças legítimas. Suportar reentrega e ordem variável. Guardar logs redigidos, correlação e retenção definida, evitando conteúdo integral indiscriminado.

Esses controles são requisitos de engenharia propostos. A documentação principal da Cloud API retornou HTTP 429 na consulta; esquema de eventos, versão Graph, escopos e inscrições deverão ser confirmados na implementação. O [Developer Hub oficial](https://whatsappbusiness.com/developers/developer-hub/) foi acessado e aponta para API, webhooks, erros, limites e opt-in. O [SDK histórico oficial](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK/blob/main/website/docs/api-reference/webhooks/start.md) distingue GET e assinatura POST com App Secret; está arquivado e não é dependência recomendada para um novo serviço.

## Consentimento e notificações

No portal, oferecer uma preferência desmarcada por padrão: “Quero receber no WhatsApp atualizações deste diagnóstico/projeto”. Registrar destinatário, finalidade, versão do texto apresentado, origem, instante, estado e revogação. Separar atualização de projeto de oferta comercial. Permitir saída no portal e reconhecer pedidos como “parar” no canal; cancelar itens pendentes antes de novos envios.

Templates candidatos: diagnóstico revisado, proposta disponível e atualização solicitada do projeto. São rascunhos; categoria, texto, idioma, parâmetros e aprovação serão validados pela Meta antes do uso. Não afirmar que um texto é automaticamente utilitário.

O serviço de envio confere consentimento, vínculo, template, janela, política, quota e orçamento. Intenções guardadas no servidor vinculam usuário/organização, destinatário, payload, prazo e autorização. Um campo `approved: true` gerado pelo modelo não autoriza envio. Resposta aceita pela API não prova entrega. Timeout ambíguo deixa estado desconhecido para investigação, sem reenvio cego.

## Custos e aceite da fase 2

Orçar separadamente Meta, eventual provedor, OpenAI, infraestrutura e atendimento humano. Usar a tabela vigente de mercado/categoria/moeda, registrar data da estimativa e aplicar reserva de orçamento antes do envio. Um atendimento sem cobrança Meta ainda pode ter custo de IA e operação.

Aceite exige: webhook inválido bloqueado; reentrega sem duplicação; mudança de status preservada; usuário de uma organização sem acesso à outra; saída respeitada; envio sem consentimento, template exigido ou quota negado; referência a documentos encaminhada ao portal; atendimento humano acessível; erros/timeout com estado auditável. Testes reais dependem de ativo empresarial confirmado, credenciais no servidor, destinatário definido e autorização específica de envio.

## Estado desta entrega

Este documento é um plano de integração. Nenhuma conta, app Meta, número, template ou webhook foi criado/configurado, e nenhuma mensagem foi enviada.

O plugin Meta Developers Sênior fornece habilidades e procedimentos; ele não instala nem autentica um servidor. O ambiente também expõe ferramentas de outro plugin, WhatsApp Official API Developer v2, para saúde, informações do servidor, estado de conexão, conta, números, templates e envio de teste a destinatário previamente fixado. A presença desses nomes não comprova disponibilidade para a Agência Camaleão ou conexão com este portal. Esses recursos não foram chamados neste trabalho.

Antes da implantação, inventariar os ativos existentes autorizados, confirmar propriedade e finalidade do número e avaliar elegibilidade/coexistência. Não migrar número em uso nem criar outro aplicativo para contornar um erro existente.
