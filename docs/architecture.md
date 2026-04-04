# Architecture — Rayzen AI

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                  │
│   Browser (Next.js 15 App Router)   ·   PC Agent (Node.js local)       │
└────────────────────┬────────────────────────────────┬───────────────────┘
                     │ HTTP / SSE                      │ BullMQ poll (3 s)
┌────────────────────▼────────────────────────────────▼───────────────────┐
│                        API LAYER  (NestJS 10 + Fastify)                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │               OrchestratorModule  (intent router)               │   │
│  │   classify() → JSON {module, action, confidence}                │   │
│  │   handleMessage() → validates → routes → streams reply          │   │
│  └────┬──────────┬──────────┬──────────┬─────────────┬────────────┘   │
│       │          │          │          │             │                  │
│  ┌────▼──┐ ┌────▼────┐ ┌───▼──────┐ ┌▼───────────┐ │                  │
│  │Memory │ │Execution│ │Document  │ │Content     │ │                  │
│  │Module │ │Module   │ │Processing│ │Engine      │ │                  │
│  │       │ │         │ │Module    │ │Module      │ │                  │
│  └───┬───┘ └────┬────┘ └────┬─────┘ └────────────┘ │                  │
│      │         │            │                       │                  │
│  ┌───▼──────────────────────▼──────────────────┐   │                  │
│  │  ValidationModule  (cross-cutting)          │   │                  │
│  │  prompt injection · output schema · routing │   │                  │
│  └─────────────────────────────────────────────┘   │                  │
│                                                     │                  │
│  ┌───────────────────────────────────────────────┐  │                  │
│  │  VoiceModule  (POST /voice/synthesize+transcr)│  │                  │
│  │  Groq TTS (PlayAI Astra) · Groq Whisper STT   │  │                  │
│  └───────────────────────────────────────────────┘  │                  │
│                                                     │                  │
│  ┌──────────────────────────────────────────────────▼──┐               │
│  │  SessionModule  (GET /sessions, DELETE /sessions/:id)│               │
│  └─────────────────────────────────────────────────────┘               │
└──────────────┬───────────────────────────────────────────────────────┘
               │
   ┌───────────▼────────────────────────────────────────┐
   │               INFRASTRUCTURE LAYER                  │
   │                                                     │
   │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
   │  │ PostgreSQL 16│  │  Redis 7     │  │LiteLLM   │  │
   │  │ + pgvector   │  │  + BullMQ 5  │  │proxy     │  │
   │  │  vector(1024)│  │  agent-tasks │  │:4000     │  │
   │  └──────────────┘  └──────────────┘  └──────────┘  │
   └─────────────────────────────────────────────────────┘
```

## Module Catalogue

| Module | Controller prefix | Responsibility | Key dependencies |
|---|---|---|---|
| `OrchestratorModule` | `/chat` | LLM-based intent classification + routing + SSE streaming | All modules |
| `MemoryModule` | `/memory` | Semantic document indexing + pgvector similarity search | Jina AI embeddings, Prisma |
| `ExecutionModule` | `/execution` | Dispatch tasks to PC Agent via BullMQ, poll for result | Redis/BullMQ |
| `DocumentProcessingModule` | `/documents` | PDF generation (Puppeteer) + DOCX generation (docxtemplater) | Puppeteer, LiteLLM |
| `ContentEngineModule` | `/content-engine` | Long-form content + editorial calendar generation | LiteLLM |
| `SessionModule` | `/sessions` | Conversation history, token usage stats, session management | Prisma |
| `VoiceModule` | `/voice` | TTS synthesis (Groq PlayAI Astra) + STT transcription (Whisper) | Groq API |
| `ValidationModule` | `/validation` | Prompt injection detection, output schema validation | — |
| `ConfigurationModule` | `/configuration` | System personality / behaviour configuration | Prisma |
| `AgentBridgeModule` | `/agent` | Authentication + task queue for PC Agent | BullMQ, JWT |
| `AuthModule` | `/auth` | JWT authentication | @nestjs/jwt |

## Data Stores

### PostgreSQL 16 + pgvector 0.7

| Table | Purpose |
|---|---|
| `documents` | Indexed knowledge chunks with `embedding vector(1024)` |
| `conversation_messages` | Full message history with `tokens_used` per call |
| `configurations` | System persona + behaviour settings |

### Redis 7 + BullMQ 5

| Queue | Purpose |
|---|---|
| `agent-tasks` | PC Agent task lifecycle (pending → active → done/failed) |

## LiteLLM Proxy (port 4000)

All LLM calls route through LiteLLM for:
- **Provider abstraction** — swap OpenAI ↔ Anthropic ↔ Groq without code changes
- **Budget enforcement** — `default_budget: 10.0 USD/month` per virtual key
- **Observability** — token usage logged per call centrally

### Model assignments per module

| Module | Model | Temperature |
|---|---|---|
| Orchestrator (classify) | gpt-4o-mini | 0 (deterministic) |
| Orchestrator (chat) | gpt-4o | 0.7 |
| MemoryService (synthesis) | gpt-4o-mini | 0.3 |
| ExecutionService (task narration) | gpt-4o | 0.3 |
| ContentEngineService | gpt-4o | 0.8 |
| DocumentProcessingService | gpt-4o-mini | 0.2 |
| Embeddings | text-embedding-3-small via Jina AI | — |

## PC Agent Security Model

The PC Agent runs locally on the user's Windows machine and polls the BullMQ queue every 3 seconds.

```
API → Redis queue → Agent polls → whitelist.ts check → executor.ts → action
                                        ↓ reject silently if not in whitelist
```

Key invariants:
- `whitelist.ts` is the single source of truth for allowed actions — never bypassed
- Path traversal (`../`) always blocked at the action level
- Sandbox: `/etc`, `/var`, `/root`, `/sys` always forbidden
- Medium/high-risk actions implement `dryRun: true` before real execution
- No free `exec()` or `spawn()` — only typed action functions
