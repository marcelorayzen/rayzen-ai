<div align="center">

<img src="https://img.shields.io/badge/Rayzen_AI-v0.1.0-6366f1?style=for-the-badge&logoColor=white" />
<img src="https://img.shields.io/badge/TypeScript-100%25-3178c6?style=for-the-badge&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/NestJS-10-e0234e?style=for-the-badge&logo=nestjs&logoColor=white" />
<img src="https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js&logoColor=white" />
<img src="https://img.shields.io/github/actions/workflow/status/marcelorayzen/rayzen-ai/ci.yml?branch=main&style=for-the-badge&label=CI" />

<br /><br />

<h1>Rayzen AI</h1>

<p><strong>Personal AI platform combining semantic memory, PC automation,<br />document generation, and voice — built as a production-grade NestJS monorepo.</strong></p>

</div>

---

## What does it solve?

| Scenario | Module | How |
|---|---|---|
| "What did I read about Docker last week?" | Memory | pgvector similarity search over indexed documents |
| "Open VS Code and run git status" | Execution | BullMQ task dispatched to local PC Agent |
| "Generate a PDF report from this data" | Document Processing | Puppeteer renders HTML → PDF |
| "Write a LinkedIn post about this article" | Content Engine | LLM with high-creativity prompt, returns formatted text |
| "Read that message back to me" | Voice | Groq PlayAI TTS, markdown-stripped, 800-char limit |
| "How healthy is this project?" | Health Score | 6-dimension weighted score (0–100) with 30-day history chart |
| "Where did I stop? What changed?" | Resume Brief | `POST /projects/:id/resume` — structured catch-up in seconds |

---

## Architecture

```
Browser (Next.js 15)  ·  PC Agent (Node.js local)
        │                         │ BullMQ poll (3s)
        │ HTTP / SSE               │
┌───────▼─────────────────────────▼───────────────────────────┐
│              OrchestratorModule  (intent router)             │
│  classify() → { module, action, confidence }  temp=0        │
│  handleMessage() → validate → route → stream reply          │
└────┬──────────┬──────────┬──────────┬────────────┬──────────┘
     │          │          │          │            │
  Memory    Execution  Document   Content      Voice
  Module    Module     Processing  Engine      Module
  pgvector  BullMQ     Puppeteer  LiteLLM     Groq API
     │                   DOCX
     └──────── ValidationModule (cross-cutting) ──────────────┘
                prompt injection · output schema · routing
```

See [docs/architecture.md](docs/architecture.md) for the full diagram and module catalogue.

---

## Technical differentials

- **LiteLLM proxy** — provider-agnostic LLM layer; swap OpenAI ↔ Groq ↔ Anthropic in config, no code changes
- **Whitelist-enforced PC Agent** — every local action is explicitly allow-listed; path traversal blocked; medium/high-risk actions run dry-run first
- **Validation layer** — dedicated `ValidationModule` detects prompt injection and system-prompt leakage before any LLM call
- **pgvector semantic memory** — 1024-dimension Jina embeddings stored in PostgreSQL; conversation itself is indexed for continuous learning
- **Streaming SSE** — chat responses stream token-by-token with typewriter effect; session history persisted with per-call `tokens_used`
- **Health score** — 6-dimension weighted score (0–100): activity, documentation freshness, consistency, next steps, blockers, focus; 30-day history persisted and charted in UI
- **Work modes** — 5 modes (implementation, debugging, architecture, study, review) inject mode-specific system prompt suffix and steer synthesis focus; mode tagged on every message and artifact
- **Hierarchical memory** — events auto-classified at write time (inbox → working → consolidated → archive); archived events excluded from LLM context in synthesis and documentation generation

---

## Reliability

**48 tests across 6 modules**, enforced in CI:

| Module | What is tested |
|---|---|
| `ValidationService` | Prompt injection patterns, output schema, classification guard |
| `SessionService` | Token aggregate stats, session groupBy, title truncation |
| `VoiceService` | Markdown stripping before TTS, 800-char limit, error handling |
| `MemoryService` | Checksum deduplication, embedding API call, search mapping |
| `ExecutionService` | BullMQ job parameters, module field, timeout and failure paths |
| `OrchestratorService` | Classification routing, module delegation, validation integration |

```bash
pnpm test:cov    # jest --coverage with enforced thresholds
```

See [docs/validation.md](docs/validation.md) for validation philosophy and coverage targets.

---

## Module structure

```
apps/api/src/modules/
├── orchestrator/        # intent classification + routing + SSE + work modes
├── memory/              # pgvector semantic search + document indexing
├── execution/           # BullMQ task dispatch to PC Agent
├── document-processing/ # Puppeteer PDF + docxtemplater DOCX
├── content-engine/      # long-form content + editorial calendar
├── voice/               # Groq TTS synthesis + Whisper STT
├── session/             # conversation history + token stats
├── validation/          # prompt injection + output validation
├── configuration/       # system personality config
├── agent-bridge/        # PC Agent authentication + queue
├── auth/                # JWT authentication
├── project-state/       # structured state: milestones, backlog, activeFocus, resume brief
├── health/              # 6-dimension health score + 30-day history
├── proactive/           # 6 rules: inactivity, doc_stale, blocker, next_step, consistency, drift
└── event/               # event log with memory_class hierarchy (inbox→archive)
```

---

## Quick start

**Prerequisites:** Node.js 20 LTS, pnpm 9.x, Docker Desktop

```bash
git clone https://github.com/marcelorayzen/rayzen-ai.git
cd rayzen-ai
pnpm install
cp .env.example .env
# Fill in API keys (see below)
```

**Required environment variables:**

```bash
GROQ_API_KEY=gsk_...           # groq.com — free tier available
JINA_API_KEY=jina_...          # jina.ai — free tier available
LITELLM_MASTER_KEY=sk-rayzen-anything
DATABASE_URL=postgresql://rayzen:password@localhost:5432/rayzen_ai
REDIS_URL=redis://localhost:6379
JWT_SECRET=<openssl rand -hex 32>
ADMIN_PASSWORD=yourpassword
```

**Start:**

```bash
docker compose up -d   # PostgreSQL + Redis + LiteLLM

pnpm db:migrate        # Apply schema (pgvector extension required)

# Three terminals:
pnpm dev:api           # API  → http://localhost:3001
pnpm dev:web           # Web  → http://localhost:3000
pnpm dev:agent         # PC Agent (required for Execution module)
```

Open **http://localhost:3000** and log in with `ADMIN_PASSWORD`.

---

## Development commands

```bash
pnpm typecheck      # TypeScript — zero errors target
pnpm lint           # ESLint across all apps
pnpm test           # Jest
pnpm test:cov       # Jest with coverage report
pnpm db:studio      # Prisma Studio at http://localhost:5555
pnpm build          # Build all apps
```

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js App Router | 15.x |
| Backend | NestJS + Fastify | 10.x |
| LLM proxy | LiteLLM | latest |
| Embeddings | Jina AI (jina-embeddings-v3) | 1024-dim |
| Database | PostgreSQL + pgvector | 16 + 0.7 |
| Cache / Queue | Redis + BullMQ | 7.x + 5.x |
| ORM | Prisma | 5.x |
| PDF | Puppeteer | 22.x |
| DOCX | docxtemplater | 3.x |
| Voice | Groq (PlayAI Astra TTS + Whisper) | — |
| Agent | Node.js TypeScript | 20 LTS |
| Container | Docker Compose | v2 |
| VPS | Oracle Ampere A1 free tier | Ubuntu 24.04 |

---

## Documentation

| File | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System diagram, module catalogue, data stores, LiteLLM model assignments |
| [docs/workflows.md](docs/workflows.md) | 5 end-to-end flows: memory indexing, routing, PC agent, voice, doc gen |
| [docs/validation.md](docs/validation.md) | Validation philosophy, what is detected, coverage targets |
| [docs/agent-runtime.md](docs/agent-runtime.md) | Security model, action catalogue, dry-run protocol, adding new actions |
| [docs/getting-started.md](docs/getting-started.md) | Detailed setup guide |
| [docs/personalization.md](docs/personalization.md) | System persona and behaviour configuration |

---

## Local dev URLs

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API / Swagger | http://localhost:3001/docs |
| LiteLLM UI | http://localhost:4000/ui |
| Prisma Studio | http://localhost:5555 |

---

<div align="center">

<sub>Built by <a href="https://github.com/marcelorayzen">Marcelo Rayzen</a> · 100% TypeScript · NestJS + Next.js monorepo</sub>

</div>
