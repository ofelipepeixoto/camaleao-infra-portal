# Arquitetura e contratos de integração

Status: desenho alvo e contratos exemplificativos; serviços reais pendentes.

## Decisões

| Decisão | Motivo e condição de revisão |
| --- | --- |
| Um backend Python, proposto FastAPI | Estado e regras em um lugar; adotar versão fixada após revisão de dependências |
| Sites como interface, identidade nativa | Validar recursos da conta, acesso externo e fricção de login; alternativa portátil se necessário |
| PostgreSQL/Supabase dedicado ao projeto | Reusar provedor relatado com fronteira de dados; não usar base de outro projeto |
| Outbox PostgreSQL no início | Consistência transacional sem nova fila; medir carga antes de Redis/queue adicional |
| OpenAI como adaptador configurável | LLM escreve e explica; regras exatas ficam no código |
| MCP stdio somente laboratório inicial | Evitar expor transporte remoto sem identidade; migração HTTP requer gate específico |
| n8n interno | Operação e workflows sob Camaleão, análise de licença por uso concreto |
| Sem Kubernetes/GPU no MVP | Capacidade contratada/privada depende de requisitos e benchmarks |

## Modelo relacional proposto

`organizations` → `memberships`, `projects`, `intakes`, `diagnostic_versions`, `proposal_versions`, `documents`, `connection_grants`, `jobs`, `budget_accounts`, `usage_reservations`, `audit_events`, `outbox_events`.

`document_acl` vincula documentos a usuários/papéis autorizados; `chunks` e vetores preservam documento, organização, hash e versão. `approvals` vincula versão/hashes e autorização; `inbox_receipts` deduplica callbacks/eventos. Foreign keys compostas ou verificações equivalentes impedem relações entre recursos de organizações diferentes.

Estado de diagnóstico: `draft → validating → review_pending → approved → published → superseded/revoked`. Somente backend muda estado; publicar exige mesma versão revisada. Nova geração invalida aceite antigo; revogação impede leitura de links e exportações subsequentes.

Estado de job: `pending → reserved → running → succeeded/failed/unknown → reconciled`. Um timeout após envio não demonstra falha sem efeito. Não liberar reserva nem repetir um efeito até reconciliação.

O worker precisa de lease durável ou bloqueio equivalente para uma execução; uma reserva de orçamento já existente não é autorização para reenviar a chamada. Distinguir retry de conexão antes do envio, chamada em andamento, conclusão conhecida e resultado desconhecido. Preservar idempotência no recurso externo quando suportado.

## API alvo

Todas as rotas protegidas resolvem sujeito, organização e papel por identidade verificada e membresia. Não confiar em `organization_id` do corpo. Requisições de escrita têm `Idempotency-Key`; erros distinguem 401/403/409/422/429. IDs abaixo são contratos de campo, não recursos criados.

| Método / rota | Função | Controle |
| --- | --- | --- |
| `POST /v1/intakes` | Registrar triagem | Schema, rate limit, organização |
| `POST /v1/intakes/{id}/diagnostics` | Solicitar geração | Reserva de consumo, dados autorizados |
| `GET /v1/diagnostics/{id}` | Consultar versão visível | Organização e estado publicado |
| `POST /v1/diagnostics/{id}/reviews` | Revisar versão | Papel humano; hash/versão no registro |
| `POST /v1/proposals/{id}/acceptances` | Registrar aceite comercial | Comprador autorizado, texto/versionamento |
| `GET /v1/projects/{id}` | Etapas do projeto | Membresia por projeto |
| `POST /v1/documents/uploads` | Preparar upload privado | Cota, allowlist tipo, quarantine e ACL |
| `GET /v1/usage` | Exibir consumo e reservas | Tenant da sessão |
| `POST /v1/execution-requests` | Preparar ação técnica | Alvo cadastrado, tipo allowlisted, teto |
| `POST /v1/execution-requests/{id}/approvals` | Autorizar ação imutável | Revisor humano, expiração, mesma versão |
| `POST /internal/v1/events/{id}/results` | Callback de worker/n8n | Assinatura, audience, deduplicação |

## Contratos MCP

O arquivo `contracts/mcp-tools.json` descreve somente ferramentas públicas de catálogo e preparação offline. Não lê arquivos arbitrários, não consulta contas, não executa shell e não abre URLs. `mcp/server.py` implementa um subconjunto experimental stdio; é laboratório local e não tem banco ou identidade real.

Ferramentas futuras `project_get`, `usage_get`, `document_search` precisam de contexto autenticado vinculado fora dos argumentos LLM. `proposal_prepare` e `execution_request_prepare` apenas preparam objetos. Aprovação e execução pertencem a endpoints humanos/operacionais separados, sem ferramenta `approve_anything`.

Para remoto, usar SDK compatível fixado, Streamable HTTP, proteção OAuth audience/issuer/scopes, TLS, egress controlado e lista de ferramentas. Não repassar tokens de um recurso para outro. SDK/cliente reais e protocolo completo precisam de testes; a prova stdio não demonstra essa interoperabilidade.

## OpenAI — requisição offline

`scripts/build_openai_request.py --model <versão-aprovada>` cria JSON local com `store:false`, schema de saída, limite de saída e instruções mínimas. Nenhum envio acontece. Não incluir MCP remoto direto nesse exemplo, pois o laboratório stdio não é URL alcançável pela API.

Na integração alvo: reservar orçamento; checar política de dados; montar contexto mínimo com versão; enviar; validar status/recusa/schema/invariantes; persistir rascunho; reconciliar consumo; exigir revisão antes de publicar. Falta de chave, modelo aprovado ou cota bloqueia geração. Não gerar orçamento financeiro pelo LLM sem fonte/unidade/data.

Se o backend controlar ferramentas locais, faz function calling com argumentos validados e invoca o cliente MCP; resultados são minimizados antes de compor a próxima chamada. Alternativamente, MCP remoto direto usa `allowed_tools`, autenticação de servidor e tratamento de cada `mcp_approval_request`. A aprovação de compartilhamento não muda papéis comerciais ou técnicos.

## n8n — especificações futuras

`workflows/n8n-blueprints.json` é especificação, **não workflow importável ou ativo**. Não executar um webhook experimental sem validação só porque contém `approved:true`.

Envelope de evento proposto: `event_id`, `schema_version`, `organization_id`, `project_id`, `resource_version`, `intent_hash`, `issued_at`, `expires_at`, `payload_ref`. Headers internos contêm assinatura e identificador da chave. n8n obtém contexto permitido via backend; credencial técnica limitada não pode consultar todas as organizações livremente.

## Implantação e recuperação

Separar dev/teste/piloto; no piloto, rede de serviço, containers sem root, limites de CPU/memória, volumes separados, TLS/proxy e secrets protegidos. Implantar somente depois de inventariar a VPS compartilhada para evitar competição com serviços existentes. Não presumir que Swarm, Portainer ou outro painel está disponível.

Versionar imagem/dependências; migrations revisadas com backup e teste de restore. Promover por ambiente, registrar release e plano de rollback. Mudança de schema destrutiva requer migração em etapas e restauração comprovada. Jobs respeitam cancelamento, expiração e versões para não executar autorizações antigas após rollback.
