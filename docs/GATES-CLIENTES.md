# Gates de cliente: revogação, sessão e recuperação

## Entrega revisável e dependência

Esta mudança é dependente da PR #2, head `f2b275af4186cab928c5b75a4b0285eee8a0f29d`, e, por ela, da PR #1. Não presume que essas PRs estejam integradas. Não altera schema, migrações já aplicadas, contas, papéis, política de compartilhamento, segredos, domínio, custos ou implantação.

Objetivo único: retirar uma publicação específica com confirmação exata, preservando o histórico e demonstrando as negativas de acesso e a recuperação em testes controlados. O serviço continua determinístico, sem envio a provedores de IA e sem API paga.

## Contrato e ordem de leitura

1. `apps/site/lib/portal-service.mjs`: operação `revoke`, condicionada ao revisor configurado e à associação ativa no momento da transação. Recebe `id`, `version` e `hash` da publicação, não da versão em edição. A comparação autoritativa e a gravação da auditoria são atômicas.
2. `apps/site/lib/portal-http.mjs`: contrato HTTP estrito, sem aceitar identidade do corpo. `X-Portal-Subject` vincula uma mutação à identidade exibida pela UI; não autentica nem concede permissões. Identidade ausente ou diferente da identidade nativa retorna 409 `session_changed` antes do serviço. Clientes antigos precisam recarregar antes de mutações.
3. `apps/site/app/portal-client.tsx` e `lib/portal-client-state.*`: confirmação separada de revogação; identifica pedido, versão, hash e consequência. Limpa conteúdo, rascunhos e confirmações ao receber 401/403/404 ou conflito de sessão. Confirmações são vinculadas ao sujeito. Resposta perdida exige consulta, sem repetição automática.
4. `apps/site/tests/`: contraprovas de serviço/HTTP, SQLite real local e fixture de interface com identidade/HTTP sintéticos.

### Efeito de revogar

- Remove os ponteiros da publicação apenas quando versão e hash ainda coincidem.
- Registra `diagnostic_revoked` no audit existente. Não apaga intake, revisão, aprovação ou auditoria.
- Se a publicação era a versão atual, volta para rascunho interno. A aprovação antiga não pode republicar essa versão, inclusive se o status fosse restaurado incorretamente.
- Uma nova revisão humana cria uma nova versão. Mesmo com hash igual, a nova versão exige aprovação e confirmação de publicação próprias.
- Se havia versão mais nova em preparação ou já revisada, conserva esse estado. Não a publica automaticamente.
- Outros pedidos e a associação do cliente permanecem intactos. O cliente ainda vê sua necessidade, mas não recebe o texto da revisão humana revogada.
- Não apaga texto já carregado numa aba ociosa nem cópias salvas fora do portal. O próximo contato com o serviço aplica a revogação; não existe push de invalidação ou garantia de retirada remota de cópias.

## Verificação local reproduzível

Na raiz:

```sh
python3 -m unittest discover -s tests -v
node --test apps/site/tests/*.test.mjs
```

Em `apps/site`, com o lockfile e o gerenciador já fixados no projeto:

```sh
pnpm install --frozen-lockfile
pnpm exec eslint app/portal-client.tsx lib/portal-client-state.mjs lib/portal-client-state.d.mts tests/client-state.test.mjs
pnpm exec tsc --noEmit
npm run build
pnpm exec vite build --config tests/ui/vite.config.ts
node tests/ui/run-browser.mjs
```

O navegador da fixture precisa de Chrome disponível (ou `CHROME_BIN` apontando para Chromium). A suite repete os cenários em 1280 e 320 px. Isso não comprova identidade Sites, D1 hospedado, smartphone real ou conformidade de acessibilidade.

Cobertura adicionada: revogação pontual e histórico; cliente sem poder revogar; versão/hash incorretos; aprovação revogada; revisão nova com hash igual; revisão mais nova preservada; dupla revogação; permissão retirada durante transação; nova publicação durante revogação; rollback de auditoria; A → B e B → A; nova sessão com versão/hash/conteúdo exatos; precondição de troca de conta; cópia e restauração local.

## Recuperação: alcance da prova

O teste de restauração cria dados fictícios em SQLite, fecha a conexão, copia o banco para um snapshot e restaura em outro arquivo temporário. Confere integridade, chaves estrangeiras, auditoria exata, publicação exata, revogação e associação inativa, além das negativas cruzadas.

É uma prova local do estado lógico persistido. Não é backup operacional, restauração do D1 hospedado, ensaio de desastre, medição de RPO/RTO nem autorização para restaurar produção. Não há endpoint de exportação/importação ou mecanismo que amplie acesso.

Uma cópia anterior à revogação pode ressuscitar acesso. Antes de qualquer restauração hospedada, manter o destino fechado aos clientes, reconciliar revogações e associações desativadas posteriores ao snapshot com fonte confiável, e repetir as negativas. Sem fonte completa e verificada, não reabrir o acesso. O teste local conserva as revogações contidas no snapshot; não resolve perda de eventos posteriores a ele.

## Roteiro de homologação hospedada, ainda pendente

Consulta de catálogo em 11/10/2026: o Site existente está ativo em modo de acesso restrito personalizado, versão hospedada 1, com proprietário e um visitante externo. Isso confirma configuração de acesso, não sessões autenticadas utilizáveis nem o papel de revisor de cada pessoa. A entrega desta branch não foi implantada.

Pré-requisitos: autorização e ambiente de homologação escolhido; deploy do commit revisado por fluxo Sites; identificação do Site, versão, commit, bindings e migrações efetivamente aplicadas; duas identidades de cliente A/B separadas e uma revisora R já legitimamente autorizadas. R não substitui B na negativa, porque seu acesso transversal é intencional. Nenhuma conta deve ser criada, promovida ou convidada silenciosamente para satisfazer esse requisito.

Usar somente dados fictícios, em perfis de navegador separados. Não enviar cookies, tokens, chaves ou identificadores de contas reais para logs ou evidências públicas.

1. A e B registram uma necessidade cada. Registrar IDs dos objetos fictícios e papel efetivo; R revisa e publica versões exatas para cada um.
2. A lista apenas seus pedidos e não pode ler/alterar o objeto de B; repetir B → A. Tentativas de revisão, publicação e revogação por cliente devem ser negadas. Cabeçalhos/corpos forjados não concedem papel.
3. Encerrar A, iniciar B no mesmo perfil controlado e atualizar. Nenhum conteúdo/rascunho de A pode permanecer depois da resposta. Testar também confirmação pendente de A após a sessão mudar: 409 antes da mutação.
4. Abrir uma nova sessão de A. A publicação ainda autorizada deve conservar número, hash e conteúdo iguais aos da revisão aprovada. Nova versão não herda confirmação antiga.
5. R revoga apenas um dos pedidos publicados de A. A atualiza e não recebe o conteúdo revogado; outro pedido de A e o de B permanecem disponíveis. Conferir evento único, ator e versão/hash no audit por rota administrativa previamente autorizada.
6. Simular resposta perdida em ambiente controlado após a revogação. Consultar estado sem reenviar. Testar uma confirmação antiga contra publicação mais recente e verificar negação.
7. Repetir perda de associação e restauração em destino descartável por mecanismo oficial previamente autorizado. Exigir integridade, publicação exata e negativas depois da recuperação, incluindo revogações posteriores ao snapshot reconciliadas.
8. Usar teclado e viewport estreito para revisar, confirmar, revogar e recuperar erros. Registrar foco, rótulos, conteúdo/versão exibidos e ausência de transbordamento.

Evidência mínima por caso: data, commit/versão implantada, identidade rotulada A/B/R sem segredo, ação, objeto fictício, resposta/status, versão/hash e resultado observado. Marcar `não executado` onde faltar sessão, permissão ou mecanismo de recuperação. Interromper diante de acesso cruzado, versão divergente, auditoria ausente ou reaparecimento de publicação revogada.

## Reversão e gate comercial

Esta branch não exige migração. Antes de integração pode ser descartada sem efeito hospedado. Se for implantada no futuro, reverter código não deve reconstituir ponteiros publicados: o histórico e os ponteiros nulos devem ser mantidos. Não voltar a uma implementação incapaz de respeitar o bloqueio de aprovações revogadas nem remover a precondição de identidade para evitar um erro de compatibilidade.

Enquanto homologação hospedada e recuperação operacional estiverem pendentes, demonstração e entrega de testes permanecem sintéticas. Nenhum resultado local libera dados reais, contratação, gasto, implementação automática ou envio a terceiros.
