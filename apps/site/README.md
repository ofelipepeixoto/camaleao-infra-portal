# Camaleão Infra Portal — Sites

Aplicação de homologação privada. Frontend Vinext, identidade nativa ChatGPT, persistência D1 e política de revisão no servidor.

## Código principal

- `app/portal-client.tsx`: jornada do cliente e console do revisor.
- `app/api/portal/route.ts`: identidade nativa e ponte HTTP.
- `lib/portal-http.mjs`: origem, limites de entrada e contrato da interface.
- `lib/portal-service.mjs`: isolamento, versões, aprovação e transações.
- `db/schema.ts` e `drizzle/`: schema e migração publicada.

O código em `build/` e `scripts/` e os contratos de conectores derivam do starter oficial Sites. O lockfile fixa as dependências. A aplicação não habilita conectores, não recebe chaves pelo navegador e não chama OpenAI. Componentes de exemplo não utilizados foram removidos.

## Verificação

```bash
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

O build e a publicação no ambiente ChatGPT seguem o workflow nativo Sites. A configuração `.openai/hosting.json` mantém o ID verdadeiro e binding `DB`. Migrações geradas e já aplicadas não devem ser alteradas; evolução cria nova migração.

`CAMALEAO_REVIEWER_SUBJECT` define um sujeito autenticado específico deste Site. Sem essa configuração, contas entram como clientes. A identificação aparece na seção Conta da interface. Um administrador com acesso ao Sites configura o valor por canal seguro; login não promove usuários.

Veja os runbooks em `../../docs/ENTREGA-01.md` e `../../docs/SUBDOMINIO.md`.
