# Roadmap — Rayzen AI

Objetivo: transformar o Rayzen de "coleção de módulos" em **orquestrador de contexto de desenvolvimento** — um sistema que acompanha projetos, captura o que acontece no trabalho, e materializa documentação viva sem esforço manual.

Cada fase tem escopo mínimo e critério de done explícito. Nada avança sem o critério da fase anterior estar satisfeito.

---

## Fase 1 — Project-aware

**Objetivo:** o Rayzen passa a saber a qual projeto cada conversa e documento pertence.

**Por que primeiro:** sem isso, todo o histórico acumulado é uma pilha plana. Com isso, cada fase seguinte tem contexto.

### O que implementar

- [ ] Tabela `projects` no Prisma: `id`, `name`, `description`, `status` (`active` | `paused` | `archived`), `goals` (text), `created_at`
- [ ] FK `project_id` nullable em `documents` e `conversation_messages`
- [ ] `ProjectModule` na API: CRUD básico (`POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`)
- [ ] Seletor de projeto ativo na UI (dropdown no header do Command Center)
- [ ] `project_id` passado no body do `POST /chat/message` e salvo na sessão

### Critério de done

> Consigo abrir o Rayzen, selecionar "Rayzen AI" como projeto ativo, enviar uma mensagem e confirmar no banco que `conversation_messages.project_id` está preenchido.

---

## Fase 2 — Event log (captura bruta)

**Objetivo:** tudo que acontece no projeto entra como evento rastreável com origem, tipo e timestamp.

**Por que agora:** antes de sintetizar qualquer coisa, precisamos dos dados brutos. Síntese sem captura não funciona.

### O que implementar

- [ ] Tabela `events` no Prisma: `id`, `project_id`, `source` (`chat` | `memory` | `cli` | `voice` | `manual`), `type` (`message` | `index` | `execution` | `decision` | `note` | `error`), `content` (text), `metadata` (JSON), `ts`
- [ ] `EventModule` na API: `POST /events` (ingestão), `GET /events?project_id=&source=&type=`
- [ ] Emitir evento automático em: novo `conversation_message`, novo `document` indexado, nova `execution` despachada
- [ ] Timeline de eventos por projeto na UI (aba "Atividade" no projeto)

### Critério de done

> Indexo um arquivo, envio uma mensagem e executo uma ação — os três aparecem na timeline do projeto em ordem cronológica com origem correta.

---

## Fase 3 — Hooks Claude Code → Rayzen

**Objetivo:** o trabalho no terminal (Claude Code CLI) aparece automaticamente no Rayzen sem ação manual.

**Por que Claude Code:** ele emite eventos via hooks (`PostToolUse`, `Stop`, `Notification`) que podem chamar qualquer comando. Isso permite capturar o contexto de desenvolvimento sem acoplar ao código do Claude Code — só observando o que ele já emite.

### O que implementar

- [ ] Endpoint `POST /events/cli` na API — recebe payload do hook, associa ao projeto ativo, salva como evento
- [ ] Hook `PostToolUse` no `settings.json` do Claude Code:
  - captura: arquivo editado, comando bash executado, arquivo lido
  - envia para `/events/cli` com `source: 'cli'`, `type: 'execution'`
- [ ] Hook `Stop` no `settings.json`:
  - ao encerrar sessão, envia resumo da conversa para `/events/cli` com `type: 'note'`
- [ ] Campo `active_project_id` em `~/.claude/settings.json` ou variável de ambiente para identificar projeto atual no hook
- [ ] Teste manual: rodar Claude Code, editar um arquivo, verificar evento no Rayzen

### Critério de done

> Trabalho 10 minutos no terminal com o Claude Code, abro o Rayzen e vejo na timeline: quais arquivos foram tocados, quais comandos rodaram e o resumo da sessão — sem ter feito nada manualmente.

### Referência

Hooks do Claude Code: `~/.claude/settings.json` → campo `hooks` com `PostToolUse`, `PreToolUse`, `Stop`, `Notification`.

---

## Fase 4 — Síntese de sessão

**Objetivo:** ao encerrar uma sessão de trabalho, o Rayzen extrai automaticamente decisões, próximos passos e um resumo narrativo a partir dos eventos capturados.

**Por que agora:** os dados brutos da Fase 2 e 3 já estão lá. Sem síntese, acumulam ruído. Com síntese, viram conhecimento útil.

### O que implementar

- [ ] `SynthesisService` na API:
  - `synthesizeSession(project_id, session_id)` — agrupa eventos da sessão, chama LLM (gpt-4o, temp=0.3)
  - LLM extrai: `summary` (texto livre), `decisions[]` (o que foi decidido), `next_steps[]` (o que ficou pendente), `learnings[]` (o que foi aprendido)
- [ ] Tabela `session_artifacts`: `id`, `project_id`, `session_id`, `type` (`synthesis`), `content` (JSON), `created_at`
- [ ] Trigger automático: síntese roda quando hook `Stop` chega (Fase 3) ou manualmente via `POST /synthesis/session`
- [ ] Painel "Sessão" na UI: exibe o artefato gerado com decisions, next_steps, learnings

### Critério de done

> Encerro uma sessão de trabalho. O Rayzen gera automaticamente: o que foi decidido, o que ficou pendente, o que aprendi. Consigo ver isso na UI sem ter escrito nada.

---

## Fase 5 — Documentação viva

**Objetivo:** o Rayzen materializa documentos derivados do histórico — sem digitar, revisáveis manualmente.

**Por que isso é o coração do produto:** não é armazenar tudo, é transformar o acumulado em artefatos navegáveis e úteis.

### O que implementar

- [ ] `DocumentationService` na API — gera artefatos a partir de `events` + `session_artifacts` do projeto:
  - `project_state.md` — status atual, o que está acontecendo, bloqueios
  - `decisions_log.md` — histórico de decisões com data e contexto
  - `next_actions.md` — próximos passos consolidados de todas as sessões
  - `work_journal.md` — log narrativo cronológico do projeto
- [ ] Endpoint `POST /documentation/generate/:project_id` — gera ou atualiza todos os artefatos
- [ ] Tabela `project_documents`: `id`, `project_id`, `type`, `content` (markdown), `generated_at`, `reviewed_at`
- [ ] UI: aba "Documentação" no projeto, exibe cada artefato em markdown, botão "Regenerar"
- [ ] Regra: artefatos gerados pela IA nunca sobrescrevem versão revisada manualmente sem confirmação

### Critério de done

> Clico em "Gerar documentação" no projeto Rayzen AI. O sistema produz um `decisions_log.md` com pelo menos 3 decisões reais que tomei, e um `next_actions.md` com os próximos passos pendentes — tudo derivado do histórico, sem eu ter digitado nada.

---

## Fase 6 — Obsidian export

**Objetivo:** o vault do Obsidian espelha os artefatos do Rayzen — Obsidian como interface de leitura e edição humana, não como fonte primária.

**Por que por último:** o Rayzen precisa ter o modelo de projeto e a documentação viva funcionando antes de exportar para qualquer lugar. Senão o Obsidian recebe dados que ainda não fazem sentido.

### O que implementar

- [ ] Endpoint `POST /obsidian/sync/:project_id` — escreve artefatos materializados como `.md` no vault via path configurável
- [ ] Deep links `obsidian://open?vault=X&file=Y` gerados na UI para navegar direto da nota no Rayzen
- [ ] Criação automática de nota de projeto com frontmatter: `status`, `goals`, `last_updated`
- [ ] Detecção de conflito: se nota foi editada no Obsidian após a última geração, não sobrescreve — abre diff para revisão
- [ ] Configuração do vault path em `/configuration` (settings do Rayzen)

### Critério de done

> Gero documentação do projeto no Rayzen, clico em "Sincronizar Obsidian", e encontro as notas atualizadas no vault com o conteúdo correto. Se eu editar a nota no Obsidian e sincronizar de novo, o sistema detecta o conflito e pede confirmação.

---

## Fases futuras (não agora)

| Fase | O que é | Por que esperar |
|---|---|---|
| Plugin nativo Obsidian | Plugin que lê o vault e fala com a API | Só faz sentido após Fase 6 estável |
| Sync bidirecional com reconciliação | Merge de edições humanas + IA | Requer modelo de conflito bem definido |
| Multi-agent | Agentes especializados por domínio | Primeiro consolida o modelo de projeto |
| Autonomia alta | Rayzen atualiza docs sem confirmação | Só após governança bem estabelecida |

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

---

## Princípios que guiam este roadmap

- **Captura é fácil** — entrada de dados com zero fricção
- **Consolidação é assíncrona** — síntese acontece em background, não bloqueia o trabalho
- **Publicação é revisável** — nada é publicado sem possibilidade de revisão humana
- **Automação é auditável** — tudo que a IA faz sozinha aparece na timeline
- **Edição humana tem precedência** — IA sugere merge, nunca sobrescreve
