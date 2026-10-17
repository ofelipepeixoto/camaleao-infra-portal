# Backlog priorizado

Estado revisto em 17/10/2026. O percurso positivo de diagnóstico foi homologado em 11/10 com cliente e revisora distintos; a versão 2 publicada corresponde à aprovada e foi confirmada visualmente pelo cliente. Domínio e SSL ativos no Sites. Esse aceite não encerra testes negativos, recuperação, custo ou integrações externas.

Esforço/calendário somente após inventário. Ordem baseada em dependências e risco.

| ID | Prioridade | Trabalho | Aceite observável |
| --- | --- | --- | --- |
| CAM-001 | P0 | Confirmar ICP/oferta com 10 entrevistas | Comprador, dor, baseline e 3 contas comparáveis |
| CAM-002 | P0 | Revisar marca/logo e protótipo guiado | Cliente entende próxima ação e conclui sem ajuda contínua |
| CAM-003 | P0 | Inventariar VPS/n8n/banco e custo | Capacidade, isolamento, versões, responsáveis e orçamento registrados |
| CAM-004 | P0 | Sites e login clientes — percurso positivo homologado | Login privado de duas identidades e jornada demonstrados em 11/10; ampliar acesso exige novo aceite |
| CAM-005 | P0 | Schema D1 e memberships implementados; ampliar provas negativas | Percurso individual demonstrado; negar acesso cruzado e revogação em cada nova superfície |
| CAM-006 | P0 | Diagnóstico persistido e revisão — percurso positivo homologado | Versão 2 aprovada/publicada com mesmo hash e visualização confirmada; negativa e revogação mantêm aceites próprios |
| CAM-007 | P0 | Adaptador OpenAI guardado — em preparação e desligado | Secrets no servidor; modelo/preço fixados; consentimento e revisão; testes simulados antes de qualquer chamada autorizada |
| CAM-008 | P0 | Ledger D1 e reserva de custo — em preparação | Tetos cumulativos global/cliente, uma operação pendente incluindo unknown; concorrência/restart testados; sem retry automático |
| CAM-009 | P0 | Restauração, logs e operação | Restore isolado demonstrado e runbook executado |
| CAM-010 | P1 | Conector MCP real e escopos | SDK/cliente reais, ciclo de vida, auth e negativa por escopo |
| CAM-011 | P1 | Rotina n8n interna | Evento assinado/deduplicado; versão e papel checados no backend |
| CAM-012 | P1 | Piloto documental autorizado | ACL ingestão/consulta, citações, exclusão e perguntas sem resposta |
| CAM-013 | P1 | Propostas e projetos | Custos/escopo revisados, aceite versionado e acompanhamento |
| CAM-014 | P2 | WhatsApp oficial | Ativos confirmados, consentimento, webhook e envios autorizados |
| CAM-015 | P2 | Operação paga e template reutilizável | Resultado aceito, margem e suporte medidos |
| CAM-016 | P3 | White-label/parceiros | Licenças, contrato, suporte e onboarding validados |
| CAM-017 | P3 | LLM privada/GPU | Política exige, benchmark, demanda e TCO sustentam |

As prioridades P2/P3 são oportunidades condicionais. A próxima fatia está detalhada em [ENTREGA-02-IA.md](ENTREGA-02-IA.md): corrigir paginação/limite de revisão, preparar adaptador e ledger, testar sem chamadas pagas e publicar com API desligada. A ativação real depende de orçamento explícito, chave protegida, modelo e preço válido. n8n continua posterior ao contrato transacional de eventos e não está ativo.

