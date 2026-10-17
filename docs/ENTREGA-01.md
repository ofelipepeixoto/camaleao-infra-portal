# Entrega 01 — diagnóstico persistente da Camaleão

O objetivo desta fatia foi homologar **entrada do cliente → diagnóstico → revisão humana → publicação da mesma versão**. O portal usa o endereço [infra.camaleaoweb3.com.br](https://infra.camaleaoweb3.com.br/).

Registro inicial de entrega: 11/10/2026, publicação privada às 01:22:08 no horário de São Paulo (04:22:08 UTC). Posteriormente, o Sites confirmou domínio e SSL ativos; a variável `CAMALEAO_REVIEWER_SUBJECT` foi configurada na revisão de ambiente 4.

**Aceite humano em 11/10/2026:** duas identidades distintas concluíram cadastro e preparo pelo cliente, revisão e publicação pela revisora. O banco confirmou a versão 2 aprovada e publicada com o mesmo hash. A conta cliente confirmou visualmente **Diagnóstico publicado · versão 2**. Não foram executadas chamadas OpenAI, rotinas n8n ou envios WhatsApp nesse percurso.

| Registro observado | Valor |
| --- | --- |
| Projeto Sites | `appgprj_6acb0cb852e08191afeac9f98209d362` |
| URL publicada, privada | [Camaleão Infra Portal](https://camaleao-infra-portal.radarjacarepagua.chatgpt.site) |
| SHA da publicação inicial, histórico | `48d4ab243c4de5d1ed8b1bac85d4e9c6911a3022` |
| Implantação inicial, histórico | `appgdep_6acb0eda81a08191b57b8cfd2a609e92` |
| Versão salva inicial, histórico | `appgprj_6acb0cb852e08191afeac9f98209d362~appgver_22ba5747d82c8191a5f1b782a9dbed09` |
| Código hospedável | `apps/site`, aplicação Vinext |
| Banco nativo | D1, binding `DB` |
| Audiência observada | Privada personalizada: proprietário e uma conta externa visitante; dados pessoais omitidos |
| Domínio | `infra.camaleaoweb3.com.br`, ativo com SSL ativo |
| Revisora | Configurada na revisão de ambiente 4 |
| Homologação humana | Percurso com duas identidades, versão 2 aprovada/publicada e confirmação visual do cliente |

Os IDs de publicação acima registram a primeira entrega, não identificam automaticamente o código atualmente em produção. Na inspeção de 17/10, o Sites informou origem `5ce6ee9b7e11a6799bac4930eec19be5806fef33`, versão salva `appgprj_6acb0cb852e08191afeac9f98209d362~appgver_f87cd9624be48191a04419c08b5b3a78` e implantação `appgdep_6aceace9bd8c8191b6333edc5b300408`. Esses identificadores não constituem, isoladamente, uma nova homologação humana ou confirmação recém-executada de sucesso de implantação.

## Escopo e decisão de implantação

Para a primeira homologação, a implementação selecionada usa **Worker do Sites, identidade nativa e banco D1 do próprio Site**. Isso concentra interface e regras do diagnóstico no mesmo servidor, com persistência real disponível na plataforma e sem introduzir outro serviço de autenticação.

O backend Python/PostgreSQL descrito no [desenho inicial](ARQUITETURA-E-CONTRATOS.md) permanece uma opção de expansão para documentos, processamento demorado e integrações. Ele não é pré-requisito para esta fatia. Migração futura exige preservar identidade, organizações, versões e trilha de auditoria; não compartilhar silenciosamente bancos de outros projetos.

| Componente | Estado e condição desta entrega |
| --- | --- |
| Interface Camaleão | Publicada em Site privado para intake, diagnóstico e acompanhamento |
| Identidade | Login nativo Sites; workspace individual derivado do sujeito e autorização de cada operação no servidor |
| Persistência | D1 `DB`; cinco tabelas confirmadas na entrega inicial. Jornada autenticada comprovada com duas identidades; restauração de backup ainda requer ensaio próprio |
| Diagnóstico determinístico | Referência verificável sem envio a fornecedor externo |
| OpenAI | Modo pago desativado; sem chave nem adaptador de consumo configurados nesta entrega |
| Revisão e publicação | Revisora configurada; versão 2 aprovada/publicada com o mesmo hash, confirmada visualmente pelo cliente |
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

O revisor é a identidade exata configurada pelo operador na variável de servidor `CAMALEAO_REVIEWER_SUBJECT`. O valor deve vir do próprio Site; sem configuração, ninguém recebe esse papel. Essa variável foi configurada na revisão de ambiente 4. Não existe promoção automática do primeiro visitante. A pessoa configurada pode acessar a fila de workspaces para revisão, enquanto os clientes continuam restritos ao próprio workspace. Conteúdo de revisão humana permanece interno até a publicação.

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

A Entrega 01 produz diagnóstico determinístico. O adaptador controlado está descrito na [Entrega 02](ENTREGA-02-IA.md), em preparação e desligado por padrão. A configuração usa diretamente os segredos do servidor. Para futura ativação real:

1. Confirmar o projeto OpenAI, o modelo avaliado e o teto financeiro autorizado para esta homologação.
2. Configurar uma chave do projeto OpenAI diretamente nos segredos do servidor Sites por um administrador autorizado, usando o painel seguro. Não colar a chave no chat. Manter somente nomes de variáveis em arquivos de exemplo.
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

Registrar SHA, comando, ambiente e resultado em [verificação](VERIFICACAO.md). Foram informados 45 testes locais aprovados (23 Python e 22 Node), checagem TypeScript e build aprovados, e publicação privada confirmada pela plataforma. QA por navegador nativo estava indisponível. A homologação humana posterior comprova o percurso descrito no início deste documento. Os testes locais e esse aceite não comprovam restauração de backup nem chamada real de fornecedor.

## Operação e retorno

O código é versionado no [repositório Camaleão](https://github.com/ofelipepeixoto/camaleao-infra-portal). Cada publicação deve apontar para o SHA exato e para a versão salva no Sites.

Se uma versão da interface ou Worker falhar, retornar à versão hospedada anterior comprovada, preservando os registros. Migrações podem já ter sido aplicadas mesmo quando uma implantação falha: verificar estado antes de tentar outra publicação e corrigir com nova migração compatível. Retorno de código não desfaz dados nem schema automaticamente.

Backup, exportação/restauração, exclusão e retenção devem ser exercitados antes de depender comercialmente do portal com dados reais. Não declarar um RPO, RTO ou SLA sem ensaio e responsável definidos. Na homologação, usar dados fictícios e controlar quem recebe acesso.

## Dependências externas ainda por confirmar

- Site institucional da Camaleão: acesso à respectiva conta ainda não demonstrado; ele não foi alterado.
- Site independente para o portal: audiência privada na conta conectada do Radar; uma segunda conta autorizada concluiu a jornada cliente/revisora em 11/10.
- Revisora: `CAMALEAO_REVIEWER_SUBJECT` configurado na revisão de ambiente 4; valor pessoal omitido.
- DNS HostGator: os registros foram aplicados pelo responsável; Sites confirmou domínio e SSL ativos. Procedimento em [SUBDOMINIO.md](SUBDOMINIO.md).
- OpenAI: desligada; [Entrega 02](ENTREGA-02-IA.md) em preparação. Chave protegida, orçamento autorizado e homologação real ainda pendentes.
- n8n, MCP remoto e WhatsApp: não são requisitos para homologar esta jornada e exigem seus próprios testes e autorizações.

## Referências de implantação

Este runbook foi preparado com as instruções atuais do plugin Sites para identidade, D1, publicação e domínio personalizado, e com as habilidades Infra Master e Meta Developers para entrega verificável e integração por etapas. O estado observado prevalece sobre desenhos antigos ou recursos apenas planejados.

