# Rayzen AI — Instruções para Claude Code

Este é o arquivo de contexto do projeto para o Claude Code (VSCode / terminal).
Leia este arquivo antes de qualquer tarefa neste repositório.

---

## O que é este projeto

Plataforma pessoal de IA com automação, memória semântica, geração de documentos e execução assistida entre VPS e máquina local. Monorepo TypeScript com pnpm workspaces.

**Repositório:** `github.com/marcelorayzen/rayzen-ai`
**Dono:** Marcelo Rayzen — QA Automation Engineer / Full-stack Developer
**Notion:** https://www.notion.so/334c784498d6818e83a2f0439f5da8cd

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 App Router |
| Backend | NestJS 10 + Fastify adapter |
| LLM proxy | LiteLLM (multi-provider, sidecar Docker :4000) |
| Banco | PostgreSQL 16 + pgvector 0.7 |
| Cache / Fila | Redis 7 + BullMQ 5 |
| ORM | Prisma 5 |
| PDF | Puppeteer 22 |
| DOCX | docxtemplater 3 |
| Agent local | Node.js 20 LTS (TypeScript) |
| Infra | Docker Compose v2, NGINX, Let's Encrypt |
| CI/CD | GitHub Actions — deploy SSH no push para `main` |
| VPS | Oracle Ampere A1 free tier — Ubuntu 24.04 |

---

## Estrutura do monorepo

```
rayzen-ai/
├── apps/
│   ├── api/          # NestJS + Fastify — backend principal
│   │   ├── src/modules/
│   │   │   ├── orchestrator/    # classifica intent, roteia para módulo
│   │   │   ├── agent-bridge/    # fila BullMQ, polling PC Agent
│   │   │   ├── jarvis/          # FASE 4 — tarefas locais
│   │   │   ├── brain/           # FASE 2 — second brain + pgvector
│   │   │   ├── doc/             # FASE 3 — Puppeteer + docxtemplater
│   │   │   ├── content/         # FASE 5 — content studio
│   │   │   └── auth/            # autenticação (ADR-007 em aberto)
│   │   └── prisma/schema.prisma
│   ├── web/          # Next.js App Router — painel
│   └── agent/        # PC Agent local
│       ├── src/security/whitelist.ts   # CRÍTICO — nunca bypassar
│       └── src/actions/               # ações implementadas
├── packages/
│   └── types/src/index.ts   # Task, Document, ChatMessage — tipos compartilhados
├── infra/
│   ├── nginx/
│   └── litellm/config.yaml
├── .github/workflows/ci.yml
├── docker-compose.yml
├── pnpm-workspace.yaml
└── CLAUDE.md  ← este arquivo
```

---

## Comandos essenciais

```bash
# Setup inicial
pnpm install
cp .env.example .env          # preencher chaves

# Infra local
docker compose up -d postgres redis litellm
docker compose ps             # verificar saúde

# Desenvolvimento
pnpm dev:api                  # API → http://localhost:3001
pnpm dev:web                  # Web → http://localhost:3000
pnpm dev:agent                # PC Agent (poll local)

# Banco
pnpm db:migrate               # aplicar migrations
pnpm db:studio                # Prisma Studio UI

# Qualidade
pnpm typecheck                # TypeScript em todo o monorepo
pnpm lint                     # ESLint em todos os apps
pnpm test                     # Jest

# Build e deploy
pnpm build                    # build todos os apps
git push origin main          # dispara CI → deploy SSH automático
```

---

## ADR — Decisões aprovadas (não alterar sem justificativa)

| # | Decisão | Escolha |
|---|---|---|
| 001 | Backend | NestJS 10 + Fastify adapter |
| 002 | LLM | LiteLLM proxy multi-provider (OpenAI por padrão) |
| 003 | Banco | PostgreSQL + pgvector (sem Qdrant) |
| 004 | VPS ↔ Agent | Polling 3s + BullMQ Redis (sem WebSocket permanente) |
| 005 | Documentos | Puppeteer (PDF) + docxtemplater (DOCX) |
| 006 | Estrutura | Monorepo pnpm workspaces |

### ADR em aberto — decidir na Fase 1

| # | Decisão | Opções |
|---|---|---|
| 007 | Autenticação | Auth.js (Google OAuth) vs Clerk vs JWT custom |
| 008 | Frontend state | Zustand vs TanStack Query vs ambos |
| 009 | Deploy trigger | push-to-main automático vs manual |
| 010 | Scheduler | BullMQ repeat vs node-cron (decidir Fase 3) |
| 011 | PC Agent OS | Windows DPAPI vs cross-platform (decidir Fase 4) |

---

## Roadmap — status atual

| Fase | Nome | Status |
|---|---|---|
| 0 | Infra base VPS + Docker | 🔲 Não iniciado |
| 1 | Command Center + Orquestrador | 🔲 Não iniciado |
| 2 | Second Brain (pgvector) | 🔲 Não iniciado |
| 3 | Doc Engine (Puppeteer + docxtemplater) | 🔲 Não iniciado |
| 4 | Jarvis + PC Agent completo | 🔲 Não iniciado |
| 5 | Content Studio | 🔲 Não iniciado |
| 6 | Scheduler, Integrations Hub, Observability | 🔲 Não iniciado |

---

## Regras de desenvolvimento

### Geral
- Manter TypeScript em 100% da stack — sem JavaScript puro
- Sem `any` explícito — usar tipos de `packages/types`
- Cada módulo NestJS tem seu próprio system prompt — não usar prompt genérico
- Logar `tokens_used` e `duration_ms` em toda chamada ao LiteLLM

### PC Agent — regras de segurança (inegociáveis)
- Toda nova ação deve ser adicionada manualmente a `whitelist.ts`
- Ações fora da whitelist são rejeitadas silenciosamente — nunca executar
- Path traversal (`../`) sempre bloqueado em `list-dir.ts` e similares
- Diretórios fora do sandbox proibidos: `/etc`, `/var`, `/root`, `/sys`
- Ações de risco médio/alto: sempre implementar `dryRun: true` antes da execução real
- Nenhum `exec()` ou `spawn()` de shell livre — apenas ações tipadas

### Testes obrigatórios a cada PR
- Testes de segurança do PC Agent (path traversal, sandbox, whitelist)
- Coverage mínimo: branches 70%, functions 80%, lines 80%
- Arquivos críticos: `executor.ts`, `whitelist.ts`, `brain.service.ts`, `orchestrator.service.ts`

---

## Gaps críticos — resolver na Fase 1

1. **Contexto de sessão** — `OrchestratorService.classify()` precisa receber `sessionId` e carregar histórico via `ConversationMessage` do Prisma
2. **Custo de tokens** — logar `usage.total_tokens` por chamada, endpoint `/stats/tokens`
3. **Budget LiteLLM** — configurar `default_budget: 10.0 USD/mês` por `virtual_key`
4. **System prompts isolados** — cada módulo precisa de prompt próprio, não genérico
5. **Rate limiting** — throttling na API antes de expor na internet

---

## Padrões de código

### NestJS — estrutura de módulo
```typescript
// Cada módulo segue este padrão:
apps/api/src/modules/<nome>/
  <nome>.module.ts      // imports, providers, exports
  <nome>.controller.ts  // rotas HTTP, DTOs com class-validator
  <nome>.service.ts     // lógica de negócio, chama LiteLLM
  <nome>.repository.ts  // queries Prisma (se necessário)
  __tests__/
    <nome>.service.spec.ts
```

### LiteLLM — sempre via proxy
```typescript
// CORRETO — aponta para proxy
this.llm = new OpenAI({
  baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
  apiKey: this.config.get('LITELLM_MASTER_KEY'),
})

// ERRADO — nunca apontar direto para OpenAI
this.llm = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
```

### BullMQ — config padrão de jobs
```typescript
await this.queue.add('execute', task, {
  jobId: task.id,
  attempts: 3,
  backoff: 5000,
  removeOnComplete: false,  // manter para histórico/debug
  removeOnFail: false,
})
```

### PC Agent — adicionar nova ação
```typescript
// 1. Adicionar em whitelist.ts
export const ALLOWED_ACTIONS = new Set([
  // ...existentes...
  'jarvis:nova_acao',  // ← adicionar aqui
])

// 2. Criar em apps/agent/src/actions/nova-acao.ts
export async function novaAcao(payload: { ... }) {
  // validar paths, verificar sandbox
  // implementar dry-run se risco médio/alto
}

// 3. Adicionar case em executor.ts
case 'jarvis:nova_acao': return novaAcao(task.payload as { ... })

// 4. Escrever testes em __tests__/nova-acao.spec.ts
```

---

## Variáveis de ambiente necessárias

```bash
OPENAI_API_KEY=sk-...
LITELLM_MASTER_KEY=sk-rayzen-...
LITELLM_BASE_URL=http://localhost:4000/v1
DATABASE_URL=postgresql://rayzen:senha@localhost:5432/rayzen_ai
REDIS_URL=redis://localhost:6379
JWT_SECRET=<openssl rand -hex 32>
JWT_AGENT_EXPIRY=30d
AGENT_API_URL=https://api.seudominio.com
AGENT_TOKEN=<token do agente>
AGENT_POLL_INTERVAL_MS=3000
NODE_ENV=development
API_PORT=3001
WEB_PORT=3000
```

---

## Modelos LLM por módulo

| Módulo | Modelo | Temperature | Observação |
|---|---|---|---|
| Orquestrador (classificar) | gpt-4o-mini | 0 | json_object obrigatório |
| Orquestrador (chat) | gpt-4o | 0.7 | com histórico de sessão |
| Jarvis | gpt-4o | 0.3 | tarefas práticas |
| Content Studio | gpt-4o | 0.8 | criatividade maior |
| Doc Engine | gpt-4o-mini | 0.2 | estruturado |
| Brain (search synthesis) | gpt-4o-mini | 0.3 | resumir resultados |
| Embeddings | text-embedding-3-small | — | vector(1536) |

---

## Links úteis durante desenvolvimento

- Swagger local: http://localhost:3001/docs
- LiteLLM UI: http://localhost:4000/ui
- Prisma Studio: http://localhost:5555 (após `pnpm db:studio`)
- Bull Board (a implementar Fase 1): http://localhost:3001/admin/queues
- Notion do projeto: https://www.notion.so/334c784498d6818e83a2f0439f5da8cd
