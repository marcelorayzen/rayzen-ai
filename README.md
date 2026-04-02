# Rayzen AI — Plataforma Pessoal de IA

Plataforma pessoal de IA com automação local, memória semântica, geração de documentos, voz e execução de tarefas no PC. Totalmente configurável via painel ou arquivo `rayzen.config.json`.

**Stack:** NestJS 10 + Fastify · Next.js 16 · PostgreSQL + pgvector · Redis + BullMQ · LiteLLM · Groq

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Chat** | Streaming SSE com efeito typewriter e histórico de sessões |
| **Brain** | Memória semântica com pgvector — indexa GitHub, PDF, URL e aprende durante conversas |
| **Jarvis** | Executa tarefas no PC: Git, Docker, VS Code, emails, screenshot, clipboard e mais |
| **Doc Engine** | Gera PDF com Puppeteer e DOCX com docxtemplater |
| **Content Studio** | Cria posts, threads, artigos e calendário editorial |
| **TTS** | Síntese de voz via Groq Orpheus (ou ElevenLabs para PT-BR nativo) |
| **STT** | Transcrição de áudio via Groq Whisper com auto-envio |
| **Stats** | Contador de tokens por sessão e diário |

---

## Estrutura do monorepo

```
rayzen-ai/
├── apps/
│   ├── api/          # NestJS + Fastify — backend principal
│   │   └── src/modules/
│   │       ├── orchestrator/   # classifica intent, roteia módulos
│   │       ├── brain/          # memória semântica + pgvector
│   │       ├── jarvis/         # despacha tarefas para o PC Agent
│   │       ├── agent-bridge/   # fila BullMQ + polling
│   │       ├── doc/            # Puppeteer + docxtemplater
│   │       ├── content/        # content studio
│   │       ├── tts/            # síntese de voz
│   │       ├── stt/            # transcrição de áudio
│   │       ├── stats/          # tokens, sessões
│   │       ├── auth/           # login JWT senha única
│   │       └── config-panel/   # lê/escreve rayzen.config.json
│   ├── web/          # Next.js 16 App Router — painel
│   └── agent/        # PC Agent local (Node.js + TypeScript)
│       ├── src/security/whitelist.ts  # guardrail principal
│       └── src/actions/              # ações implementadas
├── packages/
│   └── types/        # Task, Document, ChatMessage — tipos compartilhados
├── infra/
│   ├── nginx/
│   └── litellm/config.yaml
├── docs/
│   ├── getting-started.md   # guia para novos usuários
│   ├── personalization.md   # personalização completa
│   ├── agent.md             # documentação do PC Agent
│   └── diary.md             # histórico de decisões e problemas
├── rayzen.config.json        # configuração central
├── docker-compose.yml
└── pnpm-workspace.yaml
```

---

## Setup rápido

### Pré-requisitos
- Node.js 20 LTS
- pnpm (`npm install -g pnpm`)
- Docker Desktop

### Instalação

```bash
git clone https://github.com/marcelorayzen/rayzen-ai.git
cd rayzen-ai
pnpm install
cp .env.example .env
# edite .env com suas chaves (veja docs/getting-started.md)
```

### Variáveis obrigatórias

```bash
GROQ_API_KEY=gsk_...           # groq.com — gratuito
JINA_API_KEY=jina_...          # jina.ai — gratuito
LITELLM_MASTER_KEY=sk-rayzen-qualquercoisa
DATABASE_URL=postgresql://rayzen:senha@localhost:5432/rayzen_ai
REDIS_URL=redis://localhost:6379
JWT_SECRET=<openssl rand -hex 32>
ADMIN_PASSWORD=suasenha
```

### Subir

```bash
# Infra
docker compose up -d

# Banco
pnpm db:migrate

# Dev (3 terminais)
pnpm dev:api      # API → http://localhost:3001
pnpm dev:web      # Web → http://localhost:3000
pnpm dev:agent    # PC Agent (necessário para Jarvis)
```

Acesse **http://localhost:3000** e faça login com `ADMIN_PASSWORD`.

---

## Configuração

Edite `rayzen.config.json` na raiz ou use o painel em `/settings` (ícone ⚙ no header):

```json
{
  "identity": { "name": "Kai", "language": "pt-BR", "personality": "..." },
  "modules":  { "brain": true, "jarvis": true, "doc": true, ... },
  "llm":      { "chat": { "model": "gpt-4o", "temperature": 0.7 }, ... },
  "agent":    { "actions": { "git_commit": true, "send_email": true, ... } },
  "tts":      { "provider": "groq", "voice": "daniel" }
}
```

Ver [docs/personalization.md](docs/personalization.md) para todas as opções.

---

## PC Agent — ações disponíveis

| Categoria | Ações |
|---|---|
| Apps | open_app, open_url, open_vscode |
| Arquivos | list_dir, file_search, organize_downloads, create_project_folder |
| Sistema | get_system_info, screenshot, notify, clipboard_read, clipboard_write |
| Git | git_status, git_log, git_branch, git_commit |
| Terminal | run_command |
| Docker | docker_ps, docker_start, docker_stop |
| Outlook | read_emails, send_email, get_calendar |

Todas as ações são controladas por whitelist. Ver [docs/agent.md](docs/agent.md).

---

## Comandos úteis

```bash
pnpm db:studio      # Prisma Studio — visualizar banco
pnpm db:migrate     # aplicar migrations
pnpm typecheck      # TypeScript em todo o monorepo
pnpm lint           # ESLint
pnpm build          # build de todos os apps
```

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [docs/getting-started.md](docs/getting-started.md) | Guia do zero para novos usuários |
| [docs/personalization.md](docs/personalization.md) | Todas as opções de personalização |
| [docs/agent.md](docs/agent.md) | PC Agent: guardrails, autonomia, adicionar ações |
| [docs/diary.md](docs/diary.md) | Histórico de decisões técnicas e problemas resolvidos |

---

## Links locais (desenvolvimento)

- Web: http://localhost:3000
- API / Swagger: http://localhost:3001/docs
- LiteLLM UI: http://localhost:4000/ui
- Prisma Studio: http://localhost:5555
