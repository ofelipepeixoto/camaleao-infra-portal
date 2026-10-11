# Especialidades transformadas em módulos Camaleão

Um módulo é um pacote versionado de procedimento, catálogo, fontes, schema, avaliações e runbook. A tabela descreve planejamento; nenhuma especialidade implica serviço implantado ou integração habilitada.

| Especialidade | Módulo / resultado para o cliente | Momento |
| --- | --- | --- |
| Diagnóstico e viabilidade | Descoberta guiada, lacunas, recomendação e aceite | MVP |
| Arquitetura e stack | Aproveitar ferramentas existentes e desenhar plano | MVP |
| Infraestrutura e operação | Implantação e acompanhamento com recuperação | Piloto contratado |
| White-label e licenças | Oferta replicável, marca, direitos e suporte | Após repetibilidade |
| IA, agentes, RAG e MCP | Assistente documental e ferramentas estreitas | Piloto |
| IA soberana e LLM privada | Política de dados e opções externa/híbrida/privada | Triagem no MVP; capacidade privada sob demanda |
| n8n e integrações | Automação específica operada pela equipe | Piloto |
| Dados e isolamento | Permissões por organização/recurso/documento | Gate anterior a dados reais |
| Segurança e continuidade | Revisão, riscos, segredos e restauração | Gate anterior a dados reais |
| Blockchain e governança | Estudo de confiança, integração e simulação | Demanda comprovada |
| Implementação e validação | Código revisado, testes, evidências e rollback | Todas as fases |
| Documentação e entrega | Diagnóstico/proposta/aceite versionados | MVP |
| GPU/HPC e MLOps | Capacidade privada, benchmark e operação | Contrato enterprise |
| Data center, energia e redes | Estudos/RFP/requisitos e revisão habilitada | Projeto específico |
| Custos e contratos | TCO, teto, responsabilidades e portabilidade | MVP |
| Ecossistemas e hubs | Educação/pesquisa/automação/tech/parcerias | Após validação dos produtos individuais |

## Uso das especialidades e dos plugins

- Infra Master orienta a arquitetura e o catálogo. Instruções do assistente são adaptadas para a marca Camaleão e avaliadas; não existe importação automática das ferramentas desta sessão.
- Sênior IA Engineer orienta backend, integração, avaliações e entrega verificável.
- Cibersegurança revisa controles e evidências; não concede certificação.
- Startup e competências de negócio orientam público, oferta e experimentos, preservando a decisão do usuário de vincular tudo à Agência Camaleão.
- OpenAI Developers fornece documentação e mecanismos de configuração quando disponíveis. O app precisa de chave de projeto própria e orçamento.
- Meta Developers orienta Cloud API oficial, ativos e consentimento. Canal somente depois de identidade e autorização.
- GitHub mantém autoria, revisão e releases. O conector usado na criação não será uma credencial compartilhada com clientes.

## Política de evolução

Cada módulo só entra após: dor identificada, responsável, economia, compatibilidade, licença e avaliação. Catálogos nunca prometem disponibilidade, preço, SLA, conformidade ou capacidade física sem evidência do projeto.

Versionar `module_version`, `prompt_version`, `catalog_version`, schema e suite de avaliações. Congelar versões usadas no diagnóstico para permitir reprodução. Após alteração de catálogo/modelo/prompt, avaliar casos de regressão antes de promover.
