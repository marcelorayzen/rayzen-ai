<div align="center">

<img src="https://img.shields.io/badge/Rayzen_AI-v0.1.0-6366f1?style=for-the-badge&logoColor=white" />
<img src="https://img.shields.io/badge/TypeScript-100%25-3178c6?style=for-the-badge&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/NestJS-10-e0234e?style=for-the-badge&logo=nestjs&logoColor=white" />
<img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" />
<img src="https://img.shields.io/badge/Groq-Llama_4-f97316?style=for-the-badge&logoColor=white" />

<br /><br />

<h1>⚡ Rayzen AI</h1>

<p><strong>Plataforma pessoal de IA com automação local, memória semântica,<br />geração de documentos, voz e execução de tarefas no PC.</strong></p>

<p>Totalmente configurável via painel ou <code>rayzen.config.json</code> — sem tocar no código.</p>

</div>

---

## ✨ Módulos

<table>
<tr>
<td width="50%">

**💬 Chat**
Streaming SSE com efeito typewriter e histórico de sessões persistido.

</td>
<td width="50%">

**🧠 Brain**
Memória semântica com pgvector — indexa GitHub, PDF, URL e aprende durante conversas.

</td>
</tr>
<tr>
<td>

**🤖 Jarvis**
Executa tarefas no PC: Git, Docker, VS Code, emails, screenshot, clipboard e mais.

</td>
<td>

**📄 Doc Engine**
Gera PDF com Puppeteer e DOCX com docxtemplater a partir de prompts.

</td>
</tr>
<tr>
<td>

**✍️ Content Studio**
Cria posts, threads, artigos e calendário editorial com IA.

</td>
<td>

**🎙️ TTS / STT**
Síntese de voz via Groq Orpheus. Transcrição com Whisper e auto-envio.

</td>
</tr>
</table>

---

## 🗂️ Estrutura do monorepo

```
rayzen-ai/
├── apps/
│   ├── api/              # NestJS + Fastify — backend principal
│   │   └── src/modules/
│   │       ├── orchestrator/    # classifica intent, roteia módulos
│   │       ├── brain/           # memória semântica + pgvector
│   │       ├── jarvis/          # despacha tarefas para o PC Agent
│   │       ├── agent-bridge/    # fila BullMQ + polling
│   │       ├── doc/             # Puppeteer + docxtemplater
│   │       ├── content/         # content studio
│   │       ├── tts/ stt/        # voz e transcrição
│   │       ├── stats/           # tokens e sessões
│   │       ├── auth/            # login JWT senha única
│   │       └── config-panel/    # lê/escreve rayzen.config.json
│   ├── web/              # Next.js 16 App Router — painel
│   └── agent/            # PC Agent local (Node.js + TypeScript)
│       ├── src/security/whitelist.ts   # guardrail principal
│       └── src/actions/               # 23 ações implementadas
├── packages/
│   └── types/            # Task, Document, ChatMessage — tipos compartilhados
├── infra/
│   ├── nginx/
│   └── litellm/config.yaml
├── rayzen.config.json    # configuração central
└── docker-compose.yml
```

---

## 🚀 Setup rápido

### Pré-requisitos

![Node](https://img.shields.io/badge/Node.js-20_LTS-339933?style=flat-square&logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9.x-f69220?style=flat-square&logo=pnpm&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Desktop-latest-2496ed?style=flat-square&logo=docker&logoColor=white)

### Instalação

```bash
git clone https://github.com/marcelorayzen/rayzen-ai.git
cd rayzen-ai
pnpm install
cp .env.example .env
# edite .env com suas chaves
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
pnpm dev:api      # API  → http://localhost:3001
pnpm dev:web      # Web  → http://localhost:3000
pnpm dev:agent    # PC Agent (necessário para Jarvis)
```

Acesse **http://localhost:3000** e faça login com `ADMIN_PASSWORD`.

---

## ⚙️ Configuração

Edite `rayzen.config.json` na raiz ou use o painel em `/settings`:

```json
{
  "identity": { "name": "Kai", "language": "pt-BR", "personality": "..." },
  "modules":  { "brain": true, "jarvis": true, "doc": true },
  "llm":      { "chat": { "model": "gpt-4o", "temperature": 0.7 } },
  "agent":    { "actions": { "git_commit": true, "send_email": true } },
  "tts":      { "provider": "groq", "voice": "daniel" }
}
```

Ver [docs/personalization.md](docs/personalization.md) para todas as opções.

---

## 🤖 PC Agent — ações disponíveis

| Categoria | Ações |
|---|---|
| 🖥️ Apps | `open_app` `open_url` `open_vscode` |
| 📁 Arquivos | `list_dir` `file_search` `organize_downloads` `create_project_folder` |
| ⚙️ Sistema | `get_system_info` `screenshot` `notify` `clipboard_read` `clipboard_write` |
| 🌿 Git | `git_status` `git_log` `git_branch` `git_commit` |
| 💻 Terminal | `run_command` |
| 🐳 Docker | `docker_ps` `docker_start` `docker_stop` |
| 📧 Outlook | `read_emails` `send_email` `get_calendar` |

Todas as ações são controladas por whitelist. Ver [docs/agent.md](docs/agent.md).

---

## 🛠️ Comandos úteis

```bash
pnpm db:studio      # Prisma Studio — visualizar banco
pnpm db:migrate     # aplicar migrations
pnpm typecheck      # TypeScript em todo o monorepo
pnpm lint           # ESLint
pnpm build          # build de todos os apps
```

---

## 🏗️ Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Frontend | Next.js App Router | 16.x |
| Backend | NestJS + Fastify | 10.x |
| LLM proxy | LiteLLM | latest |
| LLM provider | Groq (Llama 4) | — |
| Embeddings | Jina AI (jina-embeddings-v3) | 1024 dim |
| Banco | PostgreSQL + pgvector | 16 + 0.7 |
| Cache / Fila | Redis + BullMQ | 7.x + 5.x |
| ORM | Prisma | 5.x |
| PDF | Puppeteer | 22.x |
| DOCX | docxtemplater | 3.x |
| Agent | Node.js TypeScript | 20 LTS |
| Container | Docker Compose | v2 |
| VPS | Oracle Ampere A1 (free tier) | Ubuntu 24.04 |

---

## 📚 Documentação

| Arquivo | Conteúdo |
|---|---|
| [docs/getting-started.md](docs/getting-started.md) | Guia do zero para novos usuários |
| [docs/personalization.md](docs/personalization.md) | Todas as opções de personalização |
| [docs/agent.md](docs/agent.md) | PC Agent: guardrails, autonomia, adicionar ações |
| [docs/diary.md](docs/diary.md) | Histórico de decisões técnicas e problemas resolvidos |
| [ADR.md](ADR.md) | Registro de decisões de arquitetura |

---

## 🔗 Links locais (desenvolvimento)

| Serviço | URL |
|---|---|
| Web | http://localhost:3000 |
| API / Swagger | http://localhost:3001/docs |
| LiteLLM UI | http://localhost:4000/ui |
| Prisma Studio | http://localhost:5555 |

---

<div align="center">

<sub>Feito por <a href="https://github.com/marcelorayzen">Marcelo Rayzen</a> · Stack 100% TypeScript · Powered by Groq + LiteLLM</sub>

</div>
