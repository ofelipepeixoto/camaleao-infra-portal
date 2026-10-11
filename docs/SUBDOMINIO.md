# Subdomínio — infra.camaleaoweb3.com.br

O portal da Agência Camaleão deve ser um **Site independente no endereço `infra.camaleaoweb3.com.br`**. O site institucional já usa Sites do ChatGPT; a HostGator administra o DNS. Criar um registro DNS não implanta o portal: primeiro publicar o Site, depois associar e validar o hostname.

Estado em 11/10/2026: Site separado publicado com audiência privada às 01:22:08 no horário de São Paulo. Associação do subdomínio criada no Sites, com estado `pending`; aguardando os três registros DNS abaixo na HostGator. O endereço `infra.camaleaoweb3.com.br` ainda não foi confirmado ativo.

| Registro observado | Valor |
| --- | --- |
| Projeto do portal | `appgprj_6acb0cb852e08191afeac9f98209d362` |
| URL publicada, privada | [Camaleão Infra Portal](https://camaleao-infra-portal.radarjacarepagua.chatgpt.site) |
| Conta de publicação atual | Conta conectada do Radar; Site privado |
| Associação de domínio | `appgdom_6acb0ef9c6c48191bdac83747d2085e2` |
| Estado da associação | `pending`, aguardando DNS e validação |
| DNS conectado | Nenhuma capacidade HostGator encontrada nesta execução |

## Responsabilidades

| Lugar | O que configurar |
| --- | --- |
| Sites do ChatGPT | Projeto do portal, código, banco D1, autenticação, audiência e associação do domínio |
| DNS HostGator | Somente os apontamentos e provas de domínio devolvidos pelo Sites |
| GitHub Camaleão | Código, migrações, testes e identificação da versão publicada |

A conexão Sites observada nesta execução lista projetos do Radar, e o portal foi registrado como novo projeto nessa conta. Isso não demonstra acesso à conta que hospeda o site institucional da Camaleão. O portal usa marca Camaleão, mas permanece administrado pela conta conectada atual. O código preparado em `apps/site` é transferível caso a operação precise ocorrer na conta da Camaleão; essa transferência exige nova configuração das identidades específicas do Site.

## Sequência de implantação e estado

1. Continuar no Site registrado `appgprj_6acb0cb852e08191afeac9f98209d362`, preservando sua identidade e audiência. Confirmar que esse ID está na configuração de hospedagem de `apps/site`; não criar outro projeto para repetir a implantação.
2. Publicação concluída com schema D1 e identidade nativa. SHA, versão e implantação estão registrados em [Entrega 01](ENTREGA-01.md).
3. Associação concluída usando `add_custom_domain`, com o `project_id` confirmado. Usar a associação existente `appgdom_6acb0ef9c6c48191bdac83747d2085e2`; não repetir sua criação.
4. Os valores abaixo foram copiados da resposta do Sites. Não deduzir destinos a partir da URL de publicação, nome do projeto ou de outro domínio.
5. Pendente: na zona DNS de `camaleaoweb3.com.br` administrada pela HostGator, inserir os registros exatos. A forma de preencher o campo de nome depende da tela atual: conferir se ela aceita o nome relativo ou o hostname completo para evitar duplicar o sufixo.
6. Atualizar o estado com `refresh_custom_domain_status`, usando os IDs exatos devolvidos pelo serviço. Registrar `status`, `provider_status`, `ssl_status` e eventual `last_error`.
7. Concluir somente após confirmar domínio ativo, HTTPS válido e jornada autorizada funcionando no novo endereço. O portal atualmente privado não se torna acessível a clientes só por receber um domínio: homologar a audiência e autorização de visitantes separadamente.

## Registros exatos para a HostGator

Cadastrar os três registros retornados pelo Sites. Os valores TXT são provas públicas de domínio, não credenciais de acesso.

| Registro | Nome | Valor |
| --- | --- | --- |
| CNAME | `infra.camaleaoweb3.com.br` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.infra.camaleaoweb3.com.br` | `openai-site-verification=LYnrbk8w8wGG_8jeL9zusjTfFTT97Y8TwiX1K0s3DwU` |
| TXT | `_cf-custom-hostname.infra.camaleaoweb3.com.br` | `f0833a07-914f-49b7-8a7e-7928b3349fac` |

No [guia oficial da HostGator](https://suporte.hostgator.com.br/hc/pt-br/articles/30813120385427-Como-criar-ou-alterar-um-registro-A-MX-TXT-CNAME-e-outros-na-Zona-DNS), a rota é **Domínios → Configurar Domínio → Editar Zona Avançada DNS → Adicionar registro**. Selecionar o domínio `camaleaoweb3.com.br`. Se o editor exigir nomes relativos, os nomes correspondentes são `infra`, `_openai-site-verification.infra` e `_cf-custom-hostname.infra`; conferir o nome completo resultante antes de salvar. Não colar espaços extras nos valores.

O serviço fornece destinos A para domínios raiz e CNAME para subdomínios. Neste projeto, usar os dados devolvidos para o subdomínio selecionado. Se a resposta estiver incompleta, registrar a pendência e consultar o estado; nunca cadastrar um valor inventado.

Guardar no registro de implantação os IDs e os apontamentos retornados. Não publicar tokens de serviço, credenciais de origem ou segredos de runtime nesse registro.

## Preservar o site e o DNS existentes

Antes de alterar a zona, verificar se `infra` já está em uso e registrar os valores atuais dos registros que serão modificados. Resolver um conflito específico, em vez de substituir toda a zona ou mudar nameservers.

Conservar os registros atuais do domínio raiz, `www`, e-mail e demais serviços. O portal não requer migrar a hospedagem institucional para a HostGator. Tampouco um subdomínio aumenta a quantidade de Sites permitida pela conta.

A integração DNS não foi encontrada nesta execução; os registros precisam ser aplicados na HostGator por quem administra a zona. Não pedir senha, token nem código de autenticação no chat. Após cadastro, atualizar o estado da associação no Sites; a etapa continua pendente até confirmação de domínio ativo e SSL.

## Verificação do endereço final

- `infra.camaleaoweb3.com.br` resolve para o destino esperado sem conflito de registro.
- Sites devolve estado ativo e SSL válido, sem erro pendente.
- A URL abre o portal Camaleão e os links de entrada/saída mantêm o hostname correto.
- Uma conta autorizada conclui intake, revisor aprova, e o cliente consulta a mesma versão publicada.
- Uma segunda identidade não acessa os recursos da primeira.
- `camaleaoweb3.com.br` e `www` continuam servindo o site institucional como antes.

Não prometer um prazo fixo de propagação ou emissão de certificado. Avaliar a resposta do DNS e do serviço para distinguir registro incorreto, prova faltante e validação em andamento.

## Retorno em caso de falha

Se apenas o código falhar, retornar à versão anterior no mesmo Site; não alterar o DNS como primeira medida. Se o apontamento estiver errado, restaurar somente os registros modificados a partir da evidência anterior. Remover a associação do domínio no Sites apenas quando isso fizer parte do retorno escolhido e após considerar o efeito sobre o portal.

Rollback de DNS não apaga o banco. Rollback de código não reverte migrações; consultar [Entrega 01](ENTREGA-01.md) antes de publicar uma versão incompatível.
