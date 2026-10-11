# Camaleão Infra Portal

**Agência Camaleão · projeto de Carlos Felipe**

Portal planejado para transformar necessidades de infraestrutura de IA em diagnóstico guiado, plano revisado, implantação contratada e operação acompanhada. Marca: [Agência Camaleão](https://camaleaoweb3.com.br/).

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

## O que existe nesta versão

Plano completo e uma **referência offline experimental**, sem dependências externas:

- Demonstração visual guiada em `apps/portal/index.html`; abrir esse arquivo no navegador após baixar/clonar o projeto.
- Validação de intake e recomendações determinísticas.
- Exemplos em memória de isolamento, reserva de orçamento e aprovação vinculada à ação.
- Subconjunto MCP stdio para catálogo público e diagnóstico offline.
- Prompt Camaleão, schemas e gerador local de requisição de exemplo OpenAI Responses.
- Especificações n8n não importáveis, sem credenciais ou workflow ativo.
- Testes e CI que não chamam APIs nem serviços de clientes.

Esta versão não é um portal autenticado ou hospedado. Não contém banco, persistência, pagamento, integração real de API, provisionamento, envio WhatsApp ou medição de custo real. A demonstração visual e o núcleo Python são referências separadas; a conexão entre interface/backend entra na próxima fatia funcional.

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

## Próxima fatia funcional

Confirmar oferta, responsável, ambiente, login de clientes e teto de custo. Inventariar recursos por acesso seguro. Implementar um intake persistido com membresia, diagnóstico, revisão humana e publicação da mesma versão, integrando uma chamada OpenAI autorizada e registrando consumo. Os gates constam do backlog e do plano de segurança.

## Autoria e direitos

Projeto original preparado para a Agência Camaleão e Carlos Felipe. Não é fork. A decisão de licença de distribuição permanece pendente; não foi concedida licença open source nesta entrega. Licenças de serviços, modelos e componentes externos devem ser verificadas por versão e uso antes de incorporar ou revender.
