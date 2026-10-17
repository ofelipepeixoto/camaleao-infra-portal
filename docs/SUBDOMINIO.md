# Subdomínio — infra.camaleaoweb3.com.br

## Estado observado

O [Camaleão Infra Portal](https://infra.camaleaoweb3.com.br/) é um Site independente da Agência Camaleão. A HostGator administra a zona DNS e o Sites hospeda o portal, a identidade e o banco D1.

Após o cadastro manual dos registros pelo responsável em 11/10/2026, o Sites confirmou associação **ativa**, provedor **ativo** e **SSL ativo**, sem erro registrado. A jornada foi depois concluída por duas contas distintas: cliente registra e prepara, revisora aprova e publica, cliente confirma **Diagnóstico publicado · versão 2**. O conteúdo publicado correspondeu à versão e ao hash aprovados.

| Registro | Valor |
| --- | --- |
| Projeto do portal | `appgprj_6acb0cb852e08191afeac9f98209d362` |
| Endereço próprio | [infra.camaleaoweb3.com.br](https://infra.camaleaoweb3.com.br/) |
| Endereço nativo | [Camaleão Infra Portal](https://camaleao-infra-portal.radarjacarepagua.chatgpt.site) |
| Associação de domínio existente | `appgdom_6acb0ef9c6c48191bdac83747d2085e2` |
| Audiência | Privada personalizada: proprietário e uma conta externa visitante; dados pessoais omitidos |
| Administração | Conta conectada do Radar no Sites; DNS sob a conta responsável na HostGator |

O domínio estar em outra conta não impede esse apontamento. A associação DNS também não transfere a propriedade do Site, banco ou permissões para a conta administradora do domínio. A identidade nativa é específica deste Site; uma migração para outro projeto requer configurar novamente audiência, sujeitos e permissões.

## Responsabilidades

| Lugar | Responsabilidade |
| --- | --- |
| Sites do ChatGPT | Código, D1, identidade, audiência, variáveis protegidas, domínio e certificado |
| DNS HostGator | Apontamentos e provas emitidos para a associação exata do Sites |
| GitHub Camaleão | Código, migrações, verificações e identificação das entregas |

## Manutenção do DNS

A associação atual já existe. Consultar ou atualizar seu estado usando os IDs acima. Uma nova implantação de código não exige criar outro projeto nem repetir a associação do domínio.

Para eventual correção na HostGator, consultar primeiro os registros atuais e os valores retornados pelo Sites para esta associação. Os valores de verificação não são reproduzidos neste documento; a resposta atual da plataforma é a referência. Um CNAME de subdomínio deve usar o destino efetivamente emitido, sem deduzir a partir da URL nativa.

O [guia oficial da HostGator](https://suporte.hostgator.com.br/hc/pt-br/articles/30813120385427-Como-criar-ou-alterar-um-registro-A-MX-TXT-CNAME-e-outros-na-Zona-DNS) descreve **Domínios → Configurar Domínio → Editar Zona Avançada DNS → Adicionar registro**. Selecionar a zona `camaleaoweb3.com.br`. Se o painel acrescenta o domínio automaticamente, preencher o nome relativo e conferir o nome completo resultante antes de salvar.

Alterar somente o registro necessário, preservando raiz, `www`, e-mail e demais serviços. Registrar o valor anterior para eventual retorno. Credenciais de conta e segredos de servidor devem usar o canal protegido do provedor.

## Revalidar o endereço

1. Consultar a associação existente no Sites e registrar `status`, `provider_status`, `ssl_status` e `last_error`.
2. Confirmar HTTPS e o endereço correto nos links de entrada e saída.
3. Entrar com conta autorizada e consultar o próprio diagnóstico. A audiência privada continua sendo controlada pelo Sites e a autorização de dados pelo portal.
4. Para uma nova versão funcional, executar o aceite correspondente; domínio ativo não comprova integrações de IA, n8n ou WhatsApp.

A homologação humana de 11/10 permanece um registro daquele percurso. A atualização documental de 17/10 não é uma nova execução completa desse teste.

## Recuperação

Falha de código usa uma versão anterior comprovada do mesmo Site. Falha de DNS usa restauração específica do registro alterado, conforme evidência anterior. Rollback de código ou DNS não desfaz migrações nem dados automaticamente; seguir [Entrega 01](ENTREGA-01.md) e exercitar restauração em ambiente isolado antes da dependência comercial.
