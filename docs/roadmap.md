# Roadmap — Rayzen AI

Objetivo: transformar o Rayzen de "coleção de módulos" em **orquestrador de contexto de desenvolvimento** — um sistema que acompanha projetos, captura o que acontece no trabalho, e materializa documentação viva sem esforço manual.

Cada fase tem escopo mínimo e critério de done explícito. Nada avança sem o critério da fase anterior estar satisfeito.

---

## Fase 1 — Project-aware

**Objetivo:** o Rayzen passa a saber a qual projeto cada conversa e documento pertence.

### O que implementar

- [x] Tabela `projects` no Prisma: `id`, `name`, `description`, `status`, `goals`, `created_at`
- [x] FK `project_id` nullable em `documents` e `conversation_messages`
- [x] `ProjectModule` na API: CRUD básico (`POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`)
- [x] Seletor de projeto ativo na UI (dropdown no header do Command Center)
- [x] `project_id` passado no body do `POST /chat/message` e salvo na sessão

### Critério de done

> Consigo abrir o Rayzen, selecionar "Rayzen AI" como projeto ativo, enviar uma mensagem e confirmar no banco que `conversation_messages.project_id` está preenchido.

---

## Fase 2 — Event log (captura bruta)

**Objetivo:** tudo que acontece no projeto entra como evento rastreável com origem, tipo e timestamp.

### O que implementar

- [x] Tabela `events` no Prisma: `id`, `project_id`, `source`, `type`, `content`, `metadata`, `ts`
- [x] `EventModule` na API: `POST /events`, `GET /events?project_id=&source=&type=`
- [x] Emitir evento automático em: novo `conversation_message`, novo `document` indexado, nova `execution` despachada
- [x] Timeline de eventos por projeto na UI (aba "Atividade" no projeto)

### Critério de done

> Indexo um arquivo, envio uma mensagem e executo uma ação — os três aparecem na timeline do projeto em ordem cronológica com origem correta.

---

## Fase 3 — Hooks Claude Code → Rayzen

**Objetivo:** o trabalho no terminal (Claude Code CLI) aparece automaticamente no Rayzen sem ação manual.

### O que implementar

- [x] Endpoint `POST /events/cli` na API
- [x] Hook `PostToolUse` no `settings.json` do Claude Code
- [x] Hook `Stop` no `settings.json`
- [x] Campo `active_project_id` via `hook.config.mjs`
- [x] Teste manual: rodar Claude Code, editar um arquivo, verificar evento no Rayzen

### Critério de done

> Trabalho 10 minutos no terminal com o Claude Code, abro o Rayzen e vejo na timeline: quais arquivos foram tocados, quais comandos rodaram e o resumo da sessão — sem ter feito nada manualmente.

---

## Fase 4 — Síntese de sessão

**Objetivo:** ao encerrar uma sessão de trabalho, o Rayzen extrai automaticamente decisões, próximos passos e um resumo narrativo a partir dos eventos capturados.

### O que implementar

- [x] `SynthesisService`: `synthesizeSession(session_id, project_id)`
- [x] Tabela `session_artifacts`: `id`, `project_id`, `session_id`, `type`, `content` (JSON), `created_at`
- [x] Trigger automático: síntese roda quando hook `Stop` chega
- [x] Painel "Sessão" na UI: exibe o artefato gerado

### Critério de done

> Encerro uma sessão de trabalho. O Rayzen gera automaticamente: o que foi decidido, o que ficou pendente, o que aprendi.

---

## Fase 5 — Documentação viva

**Objetivo:** o Rayzen materializa documentos derivados do histórico — sem digitar, revisáveis manualmente.

### O que implementar

- [x] `DocumentationService`: gera `project_state.md`, `decisions_log.md`, `next_actions.md`, `work_journal.md`
- [x] Endpoint `POST /documentation/generate/:project_id`
- [x] Tabela `project_documents`: `id`, `project_id`, `type`, `content`, `generated_at`, `reviewed_at`
- [x] UI: aba "Documentação" no projeto, exibe cada artefato em markdown, botão "Regenerar"
- [x] Regra: artefatos revisados manualmente não são sobrescritos sem confirmação

### Critério de done

> Clico em "Gerar documentação". O sistema produz `decisions_log.md` com decisões reais e `next_actions.md` com próximos passos pendentes.

---

## Fase 6 — Obsidian export

**Objetivo:** o vault do Obsidian espelha os artefatos do Rayzen.

### O que implementar

- [x] Endpoint `POST /obsidian/sync/:project_id`
- [x] Deep links `obsidian://open?vault=X&file=Y`
- [x] Criação automática de nota de projeto com frontmatter
- [x] Detecção de conflito por mtime
- [x] Configuração do vault path em `/configuration`

### Critério de done

> Gero documentação, clico em "Sincronizar Obsidian", encontro as notas atualizadas no vault. Se editar a nota no Obsidian e sincronizar de novo, o sistema detecta o conflito.

---

## Fase 7 — Estado estruturado do projeto

**Objetivo:** o Rayzen passa a *entender* o projeto, não só registrar. Um objeto tipado com estado derivado substitui o markdown livre de `project_state`.

**Por que agora:** com events + synthesis acumulando dados, é hora de sintetizar em algo navegável e confiável — não um blob de texto.

### O que implementar

- [ ] Tabela `project_states`: `id`, `project_id`, `objective`, `stage`, `blockers[]`, `recent_decisions[]`, `next_steps[]`, `risks[]`, `doc_gaps[]`, `risk_level` (`low|medium|high`), `updated_at`
- [ ] `ProjectStateService`: `refresh(project_id)` — agrega events + artifacts, chama LLM (json_object), upsert
- [ ] Endpoint `GET /projects/:id/state` e `POST /projects/:id/state/refresh`
- [ ] Campo `intent` em `events`: `decision | idea | problem | reference | checkpoint`
- [ ] `POST /synthesis/checkpoint` — checkpoint manual: sintetiza eventos recentes (últimas 2h ou desde último checkpoint)
- [ ] UI: painel de estado estruturado no header do projeto (objetivo, stage, risk_level, blockers)
- [ ] UI: botão "Checkpoint" na barra de ações
- [ ] UI: botões de captura rápida ("+ Decisão", "+ Ideia", "+ Problema") com modal leve

### Critério de done

> Abro um projeto no Rayzen e vejo o painel de estado: objetivo atual, estágio, nível de risco, bloqueios. Clico em "Checkpoint" e em 10 segundos aparece uma síntese do que aconteceu na última hora. Clico em "+ Decisão" e registro uma decisão em menos de 5 segundos.

---

## Fase 8 — Confiança e rastreabilidade

**Objetivo:** cada artefato gerado pela IA tem proveniência clara — o que foi usado, qual a confiança, o que mudou desde a última versão.

**Por que agora:** sem isso, o Rayzen acumula artefatos mas não gera confiança. A confiança vem de saber de onde veio cada coisa.

### O que implementar

- [ ] Tabela `project_document_versions`: `id`, `document_id`, `content`, `diff` (text), `reason`, `source_event_ids[]`, `created_at`
- [ ] Quando `DocumentationService` regenera um doc: salva versão anterior + diff antes de atualizar
- [ ] Campo `confidence` (`low|medium|high`) e `sources[]` no `SessionArtifact`
- [ ] Endpoint `GET /documentation/:project_id/:type/versions` — histórico de versões
- [ ] UI: botão "Ver histórico" no doc → lista de versões com diff colapsável
- [ ] UI: badge de confiança nos artefatos de síntese
- [ ] Endpoint `GET /events/:id/why` — eventos e artefatos que referenciam este evento (trilha de causalidade)

### Critério de done

> Regenero um documento. O sistema mostra: o que mudou (diff), quais eventos geraram a mudança, e o nível de confiança do artefato. Consigo rastrear "de onde saiu essa decisão" em menos de 3 cliques.

---

## Fase 9 — Git-aware context

**Objetivo:** o Rayzen entende o que foi codificado, não só o que foi dito.

**Por que depois de 8:** sem diff e causalidade, os dados git chegam mas não se conectam a nada útil.

### O que implementar

- [ ] Hook `PostToolUse` enriquecido: inclui branch atual + hash do último commit no payload
- [ ] Endpoint `POST /events/git` — recebe push/PR webhook do GitHub, salva como evento
- [ ] `GitContextService`: `getProjectContext(project_id)` — agrega branch, commits recentes, arquivos mais tocados
- [ ] Correlação na síntese: ao sintetizar sessão, inclui contexto git do período
- [ ] UI: na timeline, eventos de código mostram branch + arquivo alterado com link

### Critério de done

> Faço commits durante uma sessão. A síntese gerada ao encerrar inclui: branch, arquivos mais alterados, mensagens de commit. Na timeline, consigo ver "em qual commit essa decisão foi aplicada".

---

## Fase 10 — Inteligência proativa

**Objetivo:** o Rayzen deixa de reagir e começa a sugerir — o que fazer a seguir, o que está inconsistente, o que precisa de atenção.

**Por que por último:** requer dados acumulados de múltiplas sessões para ter sinal suficiente. Implementar antes é dar recomendações sem base.

### O que implementar

- [ ] `ProactiveService`: roda a cada 6h por projeto ativo
  - detecta projetos sem atividade há >7 dias → alerta
  - detecta docs com `reviewed_at` > 30 dias → sugere revisão
  - detecta `blockers[]` que não diminuíram em 3+ sessões → escalona
  - detecta next_steps que não viraram events → sugere ação
- [ ] Endpoint `GET /projects/:id/recommendations` — lista de recomendações com prioridade
- [ ] `ConsistencyAgent`: compara README vs project_state, decisions_log vs events recentes
- [ ] UI: painel "Recomendações" com ações sugeridas e botão de dismiss

### Critério de done

> Abro o Rayzen após 3 dias sem usar. O sistema mostra: "2 projetos sem atividade", "decisions_log desatualizado há 8 dias", "3 next_steps pendentes há mais de uma semana". Consigo agir em cada um com um clique.

---

## Fases futuras (não agora)

| Fase | O que é | Por que esperar |
|---|---|---|
| Deploy VPS Oracle | Colocar em produção | Login Oracle bloqueado — ver docs/deploy.md |
| Agente de retrospectiva | Resumo diário/semanal automático | Requer Fase 10 estável |
| Mapa de conhecimento | Cruzar projetos, estudos, padrões | Requer meses de dados |
| Playbooks pessoais | Detectar padrões de decisão do usuário | Requer Fase 10 + dados históricos |
| Plugin nativo Obsidian | Plugin que lê o vault e fala com a API | Só após Fase 6 + 8 estáveis |
| Multi-agent | Agentes especializados por domínio | Primeiro consolida inteligência proativa |

---

## Estado atual

| Fase | Status |
|---|---|
| Fase 1 — Project-aware | ✅ Concluído |
| Fase 2 — Event log | ✅ Concluído |
| Fase 3 — Hooks Claude Code | ✅ Concluído |
| Fase 4 — Síntese de sessão | ✅ Concluído |
| Fase 5 — Documentação viva | ✅ Concluído |
| Fase 6 — Obsidian export | ✅ Concluído |
| Fase 7 — Estado estruturado | 🔄 Em andamento |
| Fase 8 — Confiança e rastreabilidade | 🔲 Não iniciado |
| Fase 9 — Git-aware context | 🔲 Não iniciado |
| Fase 10 — Inteligência proativa | 🔲 Não iniciado |

---

## Princípios que guiam este roadmap

- **Captura é fácil** — entrada de dados com zero fricção
- **Consolidação é assíncrona** — síntese acontece em background, não bloqueia o trabalho
- **Publicação é revisável** — nada é publicado sem possibilidade de revisão humana
- **Automação é auditável** — tudo que a IA faz sozinha aparece na timeline
- **Edição humana tem precedência** — IA sugere merge, nunca sobrescreve
- **Confiança vem de rastreabilidade** — cada artefato tem proveniência clara
