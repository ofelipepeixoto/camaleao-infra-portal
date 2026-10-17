# Entrega 02 — diagnóstico assistido e consumo persistente

**Estado em 17/10/2026: implementação testada e publicada no Sites versão 3, API desligada por padrão, sem chamadas pagas.** Os resultados finais de teste, CI e implantação serão registrados em [VERIFICACAO.md](VERIFICACAO.md). Este documento não declara essas etapas aprovadas por antecipação.

## Ponto de partida e escopo

A [Entrega 01](ENTREGA-01.md) homologou o percurso com duas contas distintas em 11/10: cliente registra necessidade e prepara rascunho, revisora aprova e publica, cliente confirma **Diagnóstico publicado · versão 2**. A versão e o hash publicados corresponderam à aprovação. Domínio e SSL estão ativos no Sites e a audiência é privada.

Esta fatia implementa um adaptador OpenAI no servidor do próprio Site e um ledger D1 para reservar e registrar consumo. A preparação usa dados e respostas simulados nos testes. A ativação real só poderá ocorrer após registrar autorização financeira e configuração protegida.

| Incluído nesta preparação | Aceite esperado |
| --- | --- |
| Paginação do histórico | Casos além dos primeiros 100 continuam acessíveis com a mesma política de autorização |
| Limites coerentes de revisão | Interface, validação e transporte aceitam o mesmo contrato, inclusive texto multibyte |
| Adaptador Responses | Endpoint/modelo fixos, schema estrito, sem ferramentas e rascunho sujeito a revisão |
| Ledger e reservas D1 | Estado durável, tetos cumulativos global e por cliente, reserva atômica |
| Operação controlada | Uma única operação pendente global, incluindo estado de resultado desconhecido |
| Estado seguro de implantação | Diagnóstico determinístico disponível e API paga desligada por padrão |

## Contrato do provedor

Parâmetros desta preparação, com referência de preço consultada em **17/10/2026**:

| Parâmetro | Valor fixado |
| --- | --- |
| API | Responses: `https://api.openai.com/v1/responses` |
| Modelo | `gpt-5.4-mini-2026-03-17` |
| Camada de serviço | Padrão, sem Batch/Flex/Priority |
| Entrada | Somente texto mínimo do intake autorizado; sem documentos ou URLs arbitrárias |
| Limite de saída | 1.024 tokens |
| Ferramentas | Nenhuma; sem busca, MCP, shell, provisionamento ou ações externas |
| Persistência no provedor solicitada | `store: false` |
| Formato | `text.format` com `json_schema`, `strict: true` e campos delimitados |
| Entrada usada no teto conservador | 400.000 tokens; é base de reserva, não tamanho de prompt pretendido |
| Tarifa entrada, sem desconto de cache | US$ 0,75 por 1 milhão de tokens |
| Tarifa saída | US$ 4,50 por 1 milhão de tokens |

A documentação do [modelo GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) confirma o snapshot, janela de contexto e tarifas de texto. O [guia de Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) descreve o schema estrito e o tratamento de recusas. O modelo e o preço são uma configuração limitada desta entrega; não representam comparação de qualidade já concluída.

O servidor valida novamente o JSON e as regras do diagnóstico. Recusa, resposta incompleta, ferramenta inesperada, erro ou conteúdo fora do contrato não geram uma versão publicável. `store: false` não é promessa de ausência completa de retenção nem de IA soberana; contratos, logs e política de dados têm aceites próprios.

## Reserva e tetos em microUSD

O ledger usa **inteiros em microUSD**, em que 1 USD = 1.000.000 microUSD. O teto conservador por chamada é:

```text
400.000 × 0,75 + 1.024 × 4,50 = 304.608 microUSD = US$ 0,304608
```

A fórmula usa tarifas por milhão de tokens, expressas em microUSD por token. Reservar o contexto completo é uma escolha conservadora de controle; o prompt real é curto e o limite contextual do modelo continua aplicável. A reserva não é uma estimativa do consumo típico nem autorização de gasto.

- Os limites **global** e **por cliente** são cumulativos para este piloto, sem reset diário, mensal ou automático.
- O orçamento comercial `monthly_budget_brl` da triagem não alimenta esses tetos nem autoriza chamadas.
- A operação reserva o valor integral antes do envio. Ambas as cotas precisam comportar a reserva, considerando custo já registrado e reservas pendentes.
- Apenas uma operação pode permanecer pendente globalmente. Estado `unknown` também ocupa essa posição e mantém a reserva.
- Uma operação idempotente vincula cliente, caso, versão e conteúdo; reenvio não dispara outra chamada nem duplica a reserva.
- Reinício, timeout e repetição do navegador não liberam reserva nem autorizam envio de novo. Não há retry automático.
- O consumo retornado pelo provedor é validado e reconciliado no ledger; resultados incertos exigem tratamento operacional. Uma recusa ou resposta incompleta ainda pode ter custo.
- Preço ou consumo inesperados bloqueiam novas chamadas para conferência; não assumir que uma falha local significa ausência de cobrança.

Esses controles limitam o envio feito por esta aplicação com a política configurada. Chamadas externas ao portal, mudanças de tarifa e fatura do fornecedor exigem verificação própria. A preparação não define um teto financeiro contratual para todos os serviços da empresa.

## Quem pode gerar e o que pode sair

Apenas a revisora autenticada pode solicitar a geração assistida nesta fatia. O cliente continua registrando necessidades e consultando seu resultado; a chamada é vinculada ao caso e ao workspace no servidor.

O intake precisa ter sensibilidade **normal** e consentimento explícito para processamento externo. Dados restritos ou ausência de consentimento bloqueiam a saída. Não existe fallback automático para outro fornecedor. O modelo recebe somente o contexto mínimo permitido, sem segredos de ambiente, e-mail, identificador autenticado bruto ou configuração administrativa.

O retorno é um novo rascunho identificado como assistido. Antes de persistir, o servidor checa associação ativa e a mesma versão/hash da solicitação. Revogação ou mudança concorrente impede aplicar o resultado, ainda que a chamada já possa ter custo. A revisão humana cria a aprovação da versão exata e a publicação exige essa mesma versão/hash. O adaptador não aprova nem publica.

## Condições para ativação real

1. Registrar os tetos autorizados global e por cliente em microUSD e a finalidade do piloto. Nenhum valor foi autorizado por este documento.
2. Configurar a chave de um projeto OpenAI por segredo protegido do servidor Sites, com escopo apropriado. Chaves não entram no chat, navegador, GitHub, fixtures ou logs.
3. Fixar o snapshot e a tarifa acima na configuração. A confirmação do preço deve expirar em no máximo **30 dias**; preço ausente, vencido ou incompatível bloqueia chamadas.
4. Verificar as migrações D1, testes de concorrência/recuperação e o código que será implantado. Confirmar que falta de orçamento, chave ou política falha fechada.
5. Com autorização financeira registrada, habilitar explicitamente o modo assistido e executar um único caso fictício. Conferir cobrança, ledger e revisão/publicação antes de ampliar o acesso.

Publicar o código com a chave configurada não deve habilitar sozinho o modo pago. A expectativa desta preparação é implantar com a API **desligada**. Desligar novas chamadas não apaga operações pendentes nem zera orçamento já consumido.

### Variáveis exclusivas do servidor

| Nome | Configuração antes de ativar |
| --- | --- |
| `CAMALEAO_AI_ENABLED` | Apenas `true` habilita; ausente ou `false` mantém bloqueado |
| `OPENAI_API_KEY` | Segredo de projeto configurado no Sites; nunca no chat |
| `CAMALEAO_AI_MODEL` | Snapshot exato documentado acima |
| `CAMALEAO_AI_GLOBAL_CAP_MICROUSD` | Inteiro positivo, autorizado separadamente, para todo o piloto |
| `CAMALEAO_AI_CLIENT_CAP_MICROUSD` | Inteiro positivo, autorizado separadamente, por workspace cliente |
| `CAMALEAO_AI_PRICE_VALID_UNTIL` | Data/hora UTC ISO com `Z`, futura e no máximo 30 dias adiante |

A aplicação só aceita uma tentativa de IA por versão de origem, inclusive após uma resposta não utilizável. Não há botão de liberação de reserva incerta nesta entrega: a API deve permanecer pausada enquanto o operador confere a evidência do fornecedor e prepara reconciliação controlada. Não apagar o ledger nem alterar valores para contornar esse bloqueio.

## Casos de aceite antes da ativação

| Caso | Resultado exigido |
| --- | --- |
| API desligada ou falta de chave/modelo/preço/teto | Nenhuma chamada; erro controlado |
| Preço expirado ou validade maior que 30 dias | Geração bloqueada |
| Cliente solicita IA, ou associação revogada | Permissão recusada no servidor |
| Dados restritos ou processamento externo negado | Nenhuma saída de dados |
| Duas solicitações concorrentes | Uma reserva/operação pendente; saldo nunca ultrapassado |
| Mesma operação repetida | Sem nova chamada ou reserva |
| Reinício com operação pendente | Estado e reserva preservados |
| Timeout após possível envio | Estado incerto conserva reserva; sem retry automático |
| Recusa, resposta incompleta, schema inválido | Sem diagnóstico publicável; consumo tratado sem presumir gratuidade |
| Versão muda ou acesso é revogado durante a chamada | Retorno não sobrescreve caso nem produz aprovação |
| Diagnóstico revisado é alterado | Publicação depende de nova versão/hash aprovada |
| Falha após resultado e antes do commit | Sem reenvio cego; estado durável permite investigação |
| Mais de 100 casos e texto multibyte dentro do contrato | Histórico acessível e revisão válida sem 413 inesperado |

## Organização dos PRs

| Camada | Situação deste registro |
| --- | --- |
| [PR #1](https://github.com/ofelipepeixoto/camaleao-infra-portal/pull/1) | Diagnóstico persistente inicial |
| [PR #2](https://github.com/ofelipepeixoto/camaleao-infra-portal/pull/2) | Camada intermediária existente; revisar junto à base |
| [PR #3](https://github.com/ofelipepeixoto/camaleao-infra-portal/pull/3) | Base atual `89e1f3e0bfde7d962e31439fb832574070e3b5e1` |
| [PR #4](https://github.com/ofelipepeixoto/camaleao-infra-portal/pull/4) | Paginação e limite de revisão, acima do PR #3 |
| PR #5 planejado, link pendente | Adaptador/ledger e documentação, acima da correção anterior |

PR #4 foi aberto sobre a base #3; a camada de IA será aberta acima dele. PR aberto, CI e implantação são evidências diferentes. A integração das camadas precisa preservar o histórico e o estado D1.

## Próximas integrações

n8n e WhatsApp não são ativados por esta entrega. A futura rotina n8n deverá consumir evento interno autenticado e deduplicado, emitido por outbox transacional junto ao estado do portal. A conta cliente, seu consentimento e a versão do recurso devem continuar sendo verificados. O canal WhatsApp exigirá seus próprios ativos, consentimento, política e testes.
