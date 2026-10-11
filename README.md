# Camaleão Infra Portal

**Agência Camaleão · projeto de Carlos Felipe**

Portal em homologação para transformar necessidades de infraestrutura de IA em diagnóstico guiado, plano revisado, implantação contratada e operação acompanhada. Marca: [Agência Camaleão](https://camaleaoweb3.com.br/).

## Comece por aqui

- [Plano mestre](docs/PLANO-MESTRE.md)
- [Negócio, ofertas e jornada](docs/NEGOCIO-E-JORNADA.md)
- [Arquitetura, OpenAI API, MCP, Sites e n8n](docs/ARQUITETURA-E-CONTRATOS.md)
- [Segurança e homologação](docs/SEGURANCA-E-HOMOLOGACAO.md)
- [WhatsApp oficial opcional](docs/WHATSAPP-OFICIAL.md)
- [Mapa das 16 especialidades](docs/MODULOS.md)
- [Backlog](docs/BACKLOG.md)
- [Fontes e limites](docs/FONTES-E-LIMITES.md)
- [Verificação realizada](docs/VERIFICACAO.md)

## Primeira entrega funcional

A aplicação em `apps/site` usa Sites/Vinext, login ChatGPT e banco D1. A jornada conecta cadastro de necessidade, diagnóstico inicial por critérios, revisão humana e publicação da versão aprovada. Cada pessoa trabalha em seu espaço individual; times empresariais entram em uma próxima entrega.

- Autorização no servidor em todas as operações e isolamento por identidade.
- Diagnósticos e revisões persistidos, com hash calculado no servidor.
- Revisor definido por `CAMALEAO_REVIEWER_SUBJECT` em configuração segura do servidor, sem promoção por formulário.
- Publicação condicionada à versão e ao conteúdo da aprovação.
- API OpenAI desativada nesta entrega; não há envio a provedores de IA nem consumo pago.
- Subdomínio reservado como objetivo: `infra.camaleaoweb3.com.br`. A configuração DNS usa somente os valores reais retornados pelo Sites.

Veja [Entrega 01](docs/ENTREGA-01.md), [subdomínio e HostGator](docs/SUBDOMINIO.md) e [verificação](docs/VERIFICACAO.md) para o estado observado da implantação.

O laboratório offline original permanece separado: `apps/portal/index.html`, núcleo Python, MCP stdio experimental e gerador local de requisição OpenAI. Os blueprints n8n não são workflows ativos. WhatsApp, provisionamento de infraestrutura, pagamento e MCP remoto continuam pendentes.

## Reproduzir

Python 3.11+; biblioteca padrão. Sem instalação de pacotes e sem chave API.

```bash
python3 -m unittest discover -s tests -v
python3 scripts/demo.py
python3 mcp/server.py
```

O servidor MCP lê JSON-RPC por stdin e escreve somente mensagens JSON-RPC por stdout. Não escuta uma porta. Exemplo de requisição no stdin:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"local-lab","version":"0.1"}}}
```

Em seguida enviar `notifications/initialized`, `tools/list` ou `tools/call`. O teste automatizado cobre o fluxo local. Compatibilidade com SDK/cliente real, ciclo de vida completo, OAuth e transporte remoto continuam pendentes. Não cadastrar este script como URL de MCP na OpenAI API.

Para gerar um exemplo local Responses:

```bash
python3 scripts/build_openai_request.py --model APPROVED_MODEL_PLACEHOLDER
```

O argumento é um identificador ilustrativo; escolher modelo disponível e avaliado antes do uso real. O script **só imprime JSON** e não lê uma chave nem faz uma chamada.

## Verificar a aplicação persistente

Node 24+ para os testes com SQLite local; a aplicação hospedada usa D1. Os testes não chamam APIs externas.

```bash
node --test apps/site/tests/*.test.mjs
```

Para desenvolver a interface, usar a configuração e o lockfile em `apps/site`. A publicação é feita pelo fluxo nativo do Sites, que aplica as migrações de `apps/site/drizzle` e preserva o ID em `.openai/hosting.json`. Valores de ambiente e credenciais nunca entram no repositório.

A API OpenAI permanece desativada nesta entrega. Sua ativação futura exige uma chave de projeto configurada diretamente nos segredos do servidor e controles persistentes de consumo. Configurar somente a chave não habilita a integração atual; o plugin OpenAI Developers foi dispensado pelo usuário.

## Autoria e direitos

Projeto original preparado para a Agência Camaleão e Carlos Felipe. Não é fork. A decisão de licença de distribuição permanece pendente; não foi concedida licença open source nesta entrega. Licenças de serviços, modelos e componentes externos devem ser verificadas por versão e uso antes de incorporar ou revender.
