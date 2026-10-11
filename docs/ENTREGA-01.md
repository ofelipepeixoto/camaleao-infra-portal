# Entrega 01 — diagnóstico persistente da Camaleão

O objetivo desta fatia é homologar **entrada do cliente → diagnóstico → revisão humana → publicação da mesma versão**. O portal terá endereço próprio em `infra.camaleaoweb3.com.br`; o site institucional permanece em `camaleaoweb3.com.br`.

Registro de entrega: 11/10/2026. O portal foi publicado no Sites com audiência privada na conta conectada do Radar, às 01:22:08 no horário de São Paulo (04:22:08 UTC). A associação de `infra.camaleaoweb3.com.br` foi criada e aguarda os registros DNS na HostGator. Revisor, acesso de clientes e integrações cobradas ainda precisam de configuração e homologação específicas.

| Registro observado | Valor |
| --- | --- |
| Projeto Sites | `appgprj_6acb0cb852e08191afeac9f98209d362` |
| URL publicada, privada | [Camaleão Infra Portal](https://camaleao-infra-portal.radarjacarepagua.chatgpt.site) |
| SHA da origem publicada no Sites | `48d4ab243c4de5d1ed8b1bac85d4e9c6911a3022` |
| Implantação | `appgdep_6acb0eda81a08191b57b8cfd2a609e92` |
| Versão salva | `appgprj_6acb0cb852e08191afeac9f98209d362~appgver_22ba5747d82c8191a5f1b782a9dbed09` |
| Código hospedável | `apps/site`, aplicação Vinext |
| Banco nativo | D1, binding `DB` |
| Audiência atual | Privada; acesso de clientes externos ainda não homologado |

## Escopo e decisão de implantação

Para a primeira homologação, a implementação selecionada usa **Worker do Sites, identidade nativa e banco D1 do próprio Site**. Isso concentra interface e regras do diagnóstico no mesmo servidor, com persistência real disponível na plataforma e sem introduzir outro serviço de autenticação.

O backend Python/PostgreSQL descrito no [desenho inicial](ARQUITETURA-E-CONTRATOS.md) permanece uma opção de expansão para documentos, processamento demorado e integrações. Ele não é pré-requisito para esta fatia. Migração futura exige preservar identidade, organizações, versões e trilha de auditoria; não compartilhar silenciosamente bancos de outros projetos.

| Componente | Estado e condição desta entrega |
| --- | --- |
| Interface Camaleão | Publicada em Site privado para intake, diagnóstico e acompanhamento |
| Identidade | Login nativo Sites; workspace individual derivado do sujeito e autorização de cada operação no servidor |
| Persistência | Binding D1 `DB` e as cinco tabelas confirmados por consulta à plataforma; jornada autenticada e recuperação hospedada ainda precisam de homologação |
| Diagnóstico determinístico | Referência verificável sem envio a fornecedor externo |
| OpenAI | Modo pago desativado; sem chave nem adaptador de consumo configurados nesta entrega |
| Revisão e publicação | Código publicado e testado localmente; revisor ainda não configurado no runtime hospedado |
| MCP | Laboratório stdio existente; sem exposição remota ou permissão de aprovar/publicar |
| n8n | Fase 2, rotinas internas após contrato de eventos e autenticação |
| WhatsApp | Fase 2, conforme [plano do canal oficial](WHATSAPP-OFICIAL.md); nenhum envio incluído nesta fatia |

## Jornada e permissões

1. O cliente entra com sua identidade, acessa seu workspace individual e registra uma necessidade com dados mínimos. Equipes com vários usuários da mesma empresa ainda não estão implementadas.
2. O servidor valida a entrada e persiste o intake. IDs e papéis recebidos do navegador não concedem acesso.
3. A geração prepara uma versão identificada por regras determinísticas, sem API externa. O cliente pode conferir esse rascunho, identificado como não revisado; isso não equivale a um diagnóstico publicado.
4. Um revisor da Camaleão lê a versão completa, verifica limitações e registra uma decisão humana vinculada àquela versão.
5. A publicação compara o conteúdo e a identificação com a decisão registrada. Alteração posterior exige outra revisão.
6. O cliente consulta o diagnóstico liberado e seu estado. Um link conhecido não autoriza ler diagnóstico de outro cliente.

Login no Sites comprova a identidade da pessoa, não seu vínculo com uma empresa nem seu papel de revisor. O tenant desta fatia é derivado do sujeito autenticado; não há convites, grupos empresariais ou administração por organização. Nenhum cliente se promove a administrador por formulário, cabeçalho próprio ou argumento de ferramenta.

O revisor é a identidade exata configurada pelo operador na variável de servidor `CAMALEAO_REVIEWER_SUBJECT`. O valor deve vir do próprio Site; sem configuração, ninguém recebe esse papel. Essa variável ainda não foi definida nesta implantação. Não existe promoção automática do primeiro visitante. Depois de configurada, essa pessoa pode acessar a fila de workspaces para revisão, enquanto os clientes continuam restritos ao próprio workspace. Conteúdo de revisão humana permanece interno até a publicação.

Para habilitar o revisor, o responsável abre o portal com a conta autorizada, expande seu nome no topo e consulta **Sua conta → Identificador para ativação de revisor**. O operador configura esse identificador exato como variável do servidor pelos controles seguros do Sites. Trata-se de um identificador específico do Site, não de senha ou chave API. Então confirmar que a sessão recebe o papel de revisor e homologar revisão/publicação com dados fictícios.

Os cabeçalhos de identidade da plataforma só são aceitos na fronteira hospedada do Sites. Um modo local de teste precisa ser identificado e jamais liberar identidades de teste na implantação pública. O identificador de usuário é específico do Site; não copiar memberships de outro Site por coincidência de IDs.

## Contrato implementado

`GET /api/portal` consulta a sessão e a lista de casos autorizados. `POST /api/portal` recebe JSON com uma das ações abaixo, exige identidade, origem do próprio portal e validação de campos no servidor.

| Ação | Campos do contrato HTTP | Resultado |
| --- | --- | --- |
| `create` | `action`, `intake`, `idempotency_key` | Persistir intake validado no workspace do sujeito; chave UUID evita duplicar o mesmo envio |
| `generate` | `action`, `case_id`, `version`, `confirm` | Criar rascunho determinístico por confirmação explícita e versão esperada |
| `review` | `action`, `case_id`, `version`, `hash`, `diagnostic` | Revisor valida o diagnóstico e aprova uma nova versão imutável |
| `publish` | `action`, `case_id`, `version`, `hash` | Liberar exatamente a versão/hash revisados |

Campos de tenant e papel não são aceitos nesse contrato. Atualizações usam comparação de versão; uma requisição baseada em estado antigo não sobrescreve uma versão mais recente. Na criação, preservar a mesma `idempotency_key` UUID ao repetir o mesmo envio; reutilizar a chave com conteúdo diferente produz conflito. Uma nova chave representa uma nova criação intencional.

## Habilitar OpenAI com controle

Esta implementação só produz diagnóstico determinístico. Não contém chamada paga habilitada nem substitui esse modo silenciosamente por um modelo externo. O usuário dispensou o plugin OpenAI Developers. A conexão pode ser configurada diretamente nos segredos do servidor, em uma entrega posterior. Para uma próxima entrega com geração pela API:

1. Confirmar o projeto OpenAI, o modelo avaliado e o teto financeiro autorizado para esta homologação.
2. Configurar uma chave do projeto OpenAI diretamente nos segredos do servidor Sites por um administrador autorizado, usando o painel seguro. Não colar a chave no chat. Manter somente nomes de variáveis em arquivos de exemplo. O plugin OpenAI Developers foi recusado pelo usuário nesta solicitação; nenhuma integração depende de sua instalação.
3. Registrar consentimento e classe de dados permitida. Dados restritos não saem para um provedor externo por um fallback automático.
4. Implementar e testar a reserva de consumo antes da chamada, limites de entrada/saída, validação estruturada da resposta e reconciliação. Aviso de gasto não substitui bloqueio efetivo.
5. Executar um teste autorizado com dados fictícios; registrar resultado, modelo, versão do diagnóstico e consumo sem segredos.

Falta de chave, orçamento ou política de dados deve produzir um estado explícito. Não anunciar um resultado determinístico como se tivesse sido gerado por OpenAI. Um timeout depois do envio pode ter custo: preservar o estado desconhecido e reconciliar antes de repetir.

`store: false` não basta para prometer ausência de retenção ou IA soberana. O fornecedor, contrato, logs, identidade e backups fazem parte da política do projeto.

## Aceite verificável

| Caso | Resultado exigido |
| --- | --- |
| Visitante sem identidade | Operação protegida recusada |
| Cliente A consulta ou altera objeto de B | Acesso recusado, inclusive com ID válido |
| Cliente tenta revisar ou publicar | Permissão recusada |
| Intake inválido | Erro controlado; nenhum diagnóstico válido criado |
| Cliente conclui intake | Registro recuperável em outra sessão autenticada |
| Revisor aprova uma versão | Decisão registra a mesma versão e conteúdo apresentados |
| Conteúdo muda depois da aprovação | Publicação recusada até nova revisão |
| Geração/revisão/publicação com versão antiga | Conflito controlado, sem sobrescrever a versão atual |
| Criação repetida com a mesma chave UUID e conteúdo | Mesmo caso recuperado, sem duplicação |
| Mesma chave UUID com conteúdo diferente | Conflito controlado |
| Cliente abre resultado | Apenas recurso autorizado e liberado é exibido |
| Chave/cota ausente | Nenhuma chamada OpenAI enviada |
| Reinício ou nova publicação | Dados persistidos preservados |

Registrar SHA, comando, ambiente e resultado em [verificação](VERIFICACAO.md). Foram informados 45 testes locais aprovados (23 Python e 22 Node), checagem TypeScript e build aprovados, e publicação privada confirmada pela plataforma. QA por navegador nativo estava indisponível. Esses resultados não substituem a homologação de cliente e revisor autenticados no Site publicado, a recuperação após reinício ou uma chamada real de fornecedor.

## Operação e retorno

O código é versionado no [repositório Camaleão](https://github.com/ofelipepeixoto/camaleao-infra-portal). Cada publicação deve apontar para o SHA exato e para a versão salva no Sites.

Se uma versão da interface ou Worker falhar, retornar à versão hospedada anterior comprovada, preservando os registros. Migrações podem já ter sido aplicadas mesmo quando uma implantação falha: verificar estado antes de tentar outra publicação e corrigir com nova migração compatível. Retorno de código não desfaz dados nem schema automaticamente.

Backup, exportação/restauração, exclusão e retenção devem ser exercitados antes de depender comercialmente do portal com dados reais. Não declarar um RPO, RTO ou SLA sem ensaio e responsável definidos. Na homologação, usar dados fictícios e controlar quem recebe acesso.

## Dependências externas ainda por confirmar

- Site institucional da Camaleão: acesso à respectiva conta ainda não demonstrado; ele não foi alterado.
- Site independente para o portal: publicado em audiência privada na conta conectada do Radar; acesso de clientes ainda por homologar.
- Revisor: `CAMALEAO_REVIEWER_SUBJECT` ainda não configurado; identificar a conta no portal e habilitá-la no servidor antes da revisão hospedada.
- DNS HostGator: nenhuma capacidade conectada encontrada nesta execução; associação do domínio criada, aguardando cadastro dos três registros exatos em [runbook do subdomínio](SUBDOMINIO.md).
- OpenAI: modo pago desativado; chave de projeto no servidor, adaptador, modelo e teto autorizado ainda precisam ser configurados e validados para a próxima entrega.
- n8n, MCP remoto e WhatsApp: não são requisitos para homologar esta jornada e exigem seus próprios testes e autorizações.

## Referências de implantação

Este runbook foi preparado com as instruções atuais do plugin Sites para identidade, D1, publicação e domínio personalizado, e com as habilidades Infra Master e Meta Developers para entrega verificável e integração por etapas. O estado observado prevalece sobre desenhos antigos ou recursos apenas planejados.
