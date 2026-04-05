import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { TaskModule, ChatMessage } from '@rayzen/types'
import { MemoryService } from '../memory/memory.service'
import { DocumentProcessingService } from '../document-processing/document-processing.service'
import { ExecutionService } from '../execution/execution.service'
import { ContentEngineService } from '../content-engine/content-engine.service'
import { RayzenConfigService } from '../configuration/configuration.service'
import { ValidationService } from '../validation/validation.service'
import * as os from 'os'

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir()

const PATH_KEYWORDS: Record<string, string> = {
  downloads: HOME + '\\Downloads',
  documentos: HOME + '\\Documents',
  documents: HOME + '\\Documents',
  desktop: HOME + '\\Desktop',
  'área de trabalho': HOME + '\\Desktop',
  projetos: HOME + '\\Projects',
  projects: HOME + '\\Projects',
}

function buildJarvisPayload(action: string, prompt: string): Record<string, unknown> {
  if (action === 'list_dir' || action === 'organize_downloads') {
    const lower = prompt.toLowerCase()
    for (const [keyword, path] of Object.entries(PATH_KEYWORDS)) {
      if (lower.includes(keyword)) {
        return { path, dryRun: action === 'organize_downloads' ? true : undefined }
      }
    }
    return { path: HOME + '\\Downloads' }
  }

  if (action === 'open_app') {
    const apps = ['chrome', 'code', 'firefox', 'notion', 'slack']
    const lower = prompt.toLowerCase()
    const app = apps.find((a) => lower.includes(a)) ?? 'chrome'
    return { app }
  }

  if (action === 'get_system_info') {
    return {}
  }

  if (action === 'open_url') {
    // Extrai URL do prompt
    const urlMatch = prompt.match(/https?:\/\/[^\s]+/) ?? prompt.match(/(?:youtube\.com|youtu\.be|github\.com|spotify\.com|notion\.so)[^\s]*/i)
    if (urlMatch) return { url: urlMatch[0] }
    // Monta URL de busca YouTube se mencionar música
    const lower = prompt.toLowerCase()
    if (lower.includes('youtube') || lower.includes('música') || lower.includes('musica') || lower.includes('video')) {
      const query = prompt.replace(/abr[ea]|coloc[ae]|toc[ae]|play|youtube|música|musica|video/gi, '').trim()
      return { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` }
    }
    return { url: 'https://www.youtube.com' }
  }

  if (action === 'open_vscode') {
    const lower = prompt.toLowerCase()
    for (const [keyword, path] of Object.entries(PATH_KEYWORDS)) {
      if (lower.includes(keyword)) return { path }
    }
    // Tenta extrair nome de projeto do prompt
    const match = prompt.match(/(?:abr[ae]|open)\s+(?:o projeto\s+)?(.+?)(?:\s+no vscode|$)/i)
    if (match) return { path: 'C:\\Projects\\' + match[1].trim() }
    return {}
  }

  if (action === 'create_project_folder') {
    const lower = prompt.toLowerCase()
    const template = lower.includes('next') ? 'nextjs'
      : lower.includes('node') || lower.includes('api') ? 'node'
      : lower.includes('python') ? 'python'
      : 'blank'
    // Extrai nome: "crie um projeto chamado X" ou "novo projeto X"
    const nameMatch = prompt.match(/(?:chamado|projeto|project|criar|crie|novo)\s+([a-zA-Z0-9_\- ]+?)(?:\s+com|\s+usando|\s+em|$)/i)
    const name = nameMatch ? nameMatch[1].trim() : 'novo-projeto'
    return { name, template, openVscode: true, dryRun: false }
  }

  if (action === 'read_emails') {
    const limitMatch = prompt.match(/(\d+)\s*(?:email|e-mail|mensagem)/i)
    return { limit: limitMatch ? parseInt(limitMatch[1]) : 5 }
  }

  if (action === 'send_email') {
    return { prompt, dryRun: false }
  }

  if (action === 'get_calendar') {
    const daysMatch = prompt.match(/(\d+)\s*dia/i)
    return { days: daysMatch ? parseInt(daysMatch[1]) : 1 }
  }

  if (action === 'git_status' || action === 'git_log' || action === 'git_branch' || action === 'git_commit') {
    const lower = prompt.toLowerCase()
    // Tenta extrair nome do projeto do prompt
    const projectMatch = prompt.match(/(?:projeto|repo|reposit[oó]rio|project)\s+([a-zA-Z0-9_\-]+)/i)
    const path = projectMatch ? `C:\\Projects\\${projectMatch[1]}` : 'C:\\Projects\\rayzen-ai'
    if (action === 'git_commit') {
      const msgMatch = prompt.match(/(?:commit|mensagem|message)\s+[""']?(.+?)[""']?$/i)
      return { path, message: msgMatch ? msgMatch[1] : prompt, dryRun: false }
    }
    if (action === 'git_branch') {
      const branchMatch = prompt.match(/(?:branch|rama|cria[r]?|criar)\s+([a-zA-Z0-9_\-/]+)/i)
      return { path, name: branchMatch ? branchMatch[1] : undefined }
    }
    return { path, limit: 10 }
  }

  if (action === 'run_command') {
    const lower = prompt.toLowerCase()
    const projectMatch = prompt.match(/(?:no projeto|in|projeto)\s+([a-zA-Z0-9_\-]+)/i)
    const path = projectMatch ? `C:\\Projects\\${projectMatch[1]}` : undefined
    return { command: lower, path }
  }

  if (action === 'docker_ps') return {}

  if (action === 'docker_start' || action === 'docker_stop') {
    const nameMatch = prompt.match(/(?:container|servi[çc]o|start|stop|inicia[r]?|para[r]?)\s+([a-zA-Z0-9_\-]+)/i)
    return { name: nameMatch ? nameMatch[1] : '', dryRun: false }
  }

  if (action === 'screenshot') return {}

  if (action === 'notify') {
    const titleMatch = prompt.match(/(?:título|title|assunto)\s+[""']?(.+?)[""']?(?:\s+mensagem|\s+com|$)/i)
    const msgMatch = prompt.match(/(?:mensagem|message|diz[er]?|fala[r]?)\s+[""']?(.+?)[""']?$/i)
    return {
      title: titleMatch ? titleMatch[1] : 'Rayzen AI',
      message: msgMatch ? msgMatch[1] : prompt,
    }
  }

  if (action === 'clipboard_read') return {}

  if (action === 'clipboard_write') {
    const textMatch = prompt.match(/(?:copiar?|escrever?|colar?|clipboard)\s+[""']?(.+?)[""']?$/i)
    return { text: textMatch ? textMatch[1] : prompt }
  }

  if (action === 'file_search') {
    const queryMatch = prompt.match(/(?:procura[r]?|busca[r]?|encontra[r]?|acha[r]?|find|search)\s+(?:arquivo\s+)?[""']?(.+?)[""']?(?:\s+em|$)/i)
    const pathMatch = prompt.match(/(?:\s+em\s+)(.+?)$/i)
    return {
      query: queryMatch ? queryMatch[1] : prompt,
      path: pathMatch ? pathMatch[1].trim() : undefined,
    }
  }

  return { prompt }
}


export interface ClassifyResult {
  module: TaskModule
  action: string
  confidence: number
}

export interface OrchestrateResult {
  reply: string
  module: TaskModule
  action: string
  confidence: number
  tokensUsed: number
  sessionId: string
}

const MODULE_SYSTEM_PROMPTS: Record<string, string> = {
  jarvis: `Você é Kai, assistente pessoal de IA de Marcelo Rayzen — QA Automation Engineer e desenvolvedor full-stack sênior.
Execute tarefas locais no PC com precisão. Confirme o que foi feito de forma objetiva e técnica.
Sem frases de abertura. Português brasileiro. Use inglês apenas para termos técnicos consagrados.`,

  brain: `Você é Kai, assistente pessoal de IA de Marcelo Rayzen — QA Automation Engineer e desenvolvedor full-stack sênior especializado em TypeScript, NestJS, Next.js, automação de testes e IA.
Responda SEMPRE com base nos documentos e informações encontrados na memória.
Se os documentos contiverem a resposta, apresente-a diretamente e com confiança — sem ressalvas desnecessárias.
Para perguntas técnicas, seja preciso e direto como um colega sênior. Sugira melhorias quando relevante.
Sem frases de abertura. Português brasileiro.`,

  doc: `Você é Kai, assistente pessoal de IA de Marcelo Rayzen — desenvolvedor full-stack sênior.
Gere documentos técnicos, relatórios e contratos com precisão e estrutura clara.
Use markdown, listas e seções bem definidas. Confirme o documento gerado com os detalhes principais.
Português brasileiro.`,

  content: `Você é Kai, assistente pessoal de IA de Marcelo Rayzen — desenvolvedor e criador de conteúdo técnico.
Crie conteúdo direto, autêntico e com tom profissional mas acessível. Foque em desenvolvimento, IA, automação e carreira em tech.
Entregue o conteúdo pedido imediatamente sem introduções. Português brasileiro.`,

  system: `Você é Kai, assistente pessoal de IA de Marcelo Rayzen — QA Automation Engineer e desenvolvedor full-stack sênior.
Responda de forma objetiva e técnica. Não explique o óbvio para quem já conhece a stack.
Sem frases de abertura. Português brasileiro.`,
}

const DEFAULT_SYSTEM_PROMPT = `Você é Kai, assistente pessoal de IA de Marcelo Rayzen — QA Automation Engineer e desenvolvedor full-stack sênior com expertise em TypeScript, NestJS, Next.js, Docker, CI/CD, automação de testes e IA.
Seja direto, técnico e objetivo. Não explique conceitos básicos desnecessariamente.
Para código: mostre a solução sem rodeios. Para decisões técnicas: apresente trade-offs concretos.
Sem frases de abertura como "Olá", "Claro" ou "Estou aqui para ajudar".
Português brasileiro. Use inglês apenas para termos técnicos consagrados.`

@Injectable()
export class OrchestratorService {
  private llm: OpenAI
  private prisma: PrismaClient

  constructor(
    private config: ConfigService,
    private memory: MemoryService,
    private documentProcessing: DocumentProcessingService,
    private execution: ExecutionService,
    private contentEngine: ContentEngineService,
    private rayzenConfig: RayzenConfigService,
    private validation: ValidationService,
  ) {
    this.llm = new OpenAI({
      baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
      apiKey: this.config.get('LITELLM_MASTER_KEY'),
    })
    this.prisma = new PrismaClient()
  }

  private getRayzenConfig() {
    try { return this.rayzenConfig.getConfig() } catch { return null }
  }

  private getSystemPrompt(module: string): string {
    const cfg = this.getRayzenConfig()
    const name = cfg?.identity.name ?? 'Rayzen'
    const personality = cfg?.identity.personality ?? 'Seja direto e objetivo.'
    const lang = cfg?.identity.language ?? 'pt-BR'
    const langLabel = lang === 'pt-BR' ? 'Português brasileiro' : lang

    const roles: Record<string, string> = {
      jarvis:  'Execute tarefas locais no PC do usuário. Confirme o que foi feito de forma objetiva.',
      brain:   'Você tem memória semântica. Responda com base nos documentos encontrados.',
      doc:     'Especializado em documentos. Confirme o documento gerado com os detalhes principais.',
      content: 'Para criação de conteúdo. Entregue o conteúdo pedido imediatamente.',
      system:  'Responda de forma objetiva e útil.',
    }

    return `Você é ${name}. ${personality}\n${roles[module] ?? ''}\nIdioma: ${langLabel}.`
  }

  async handleMessage(prompt: string, sessionId: string): Promise<OrchestrateResult> {
    // 0. Validar prompt antes de qualquer processamento
    this.validation.assertValidPrompt(prompt)

    // 1. Classificar intent
    const classify = await this.classify(prompt)

    // 2. Rotear para Brain se necessário
    if (classify.module === 'brain') {
      try {
        const result = await this.memory.searchAndSynthesize(prompt, sessionId)
        this.extractAndIndex(prompt, result.answer)
        return {
          reply: result.answer,
          module: classify.module,
          action: classify.action,
          confidence: classify.confidence,
          tokensUsed: result.tokensUsed,
          sessionId,
        }
      } catch {
        // Fallback para chat normal se embeddings não estiverem disponíveis
      }
    }

    // 3. Rotear para Jarvis se necessário
    if (classify.module === 'jarvis') {
      try {
        const jarvisPayload = buildJarvisPayload(classify.action, prompt)
        const result = await this.execution.dispatch(classify.action, jarvisPayload)
        // Sintetiza resposta natural a partir do resultado
        const synthesis = await this.llm.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Você é Rayzen, assistente pessoal. O PC Agent executou uma tarefa e retornou dados.
Vá direto ao ponto — apresente os dados imediatamente, sem frases introdutórias como "Olá", "Claro", "Com prazer" ou "Estou aqui para ajudar".
Seja direto, claro e amigável. Português brasileiro. Sem JSON bruto.`,
            },
            {
              role: 'user',
              content: `Pedido original: "${prompt}"\nDados retornados: ${JSON.stringify(result, null, 2)}`,
            },
          ],
          temperature: 0.4,
        })
        return {
          reply: synthesis.choices[0].message.content ?? JSON.stringify(result),
          module: classify.module,
          action: classify.action,
          confidence: classify.confidence,
          tokensUsed: synthesis.usage?.total_tokens ?? 0,
          sessionId,
        }
      } catch (err) {
        return {
          reply: `Não consegui executar a tarefa: ${(err as Error).message}`,
          module: classify.module,
          action: classify.action,
          confidence: classify.confidence,
          tokensUsed: 0,
          sessionId,
        }
      }
    }

    // 4. Rotear para Content se necessário
    if (classify.module === 'content') {
      try {
        const isCalendar = classify.action === 'calendar' || prompt.toLowerCase().includes('calendário')
        if (isCalendar) {
          const result = await this.contentEngine.generateCalendar(prompt, 7, sessionId)
          const formatted = result.entries
            .map((e) => `Dia ${e.day} — ${e.format.toUpperCase()}: ${e.theme}\n↳ ${e.hook}`)
            .join('\n\n')
          return {
            reply: `Calendário editorial (${result.period}):\n\n${formatted}`,
            module: classify.module,
            action: classify.action,
            confidence: classify.confidence,
            tokensUsed: result.tokensUsed,
            sessionId,
          }
        }

        const type = (['post', 'thread', 'article'].includes(classify.action) ? classify.action : 'post') as 'post' | 'thread' | 'article'
        const result = await this.contentEngine.generate(type, prompt, 'professional', sessionId)
        return {
          reply: result.content,
          module: classify.module,
          action: classify.action,
          confidence: classify.confidence,
          tokensUsed: result.tokensUsed,
          sessionId,
        }
      } catch {
        // Fallback para chat normal
      }
    }

    // 5. Rotear para Doc se necessário
    if (classify.module === 'doc') {
      try {
        const result = await this.documentProcessing.generatePDF(prompt, sessionId)
        return {
          reply: `Documento gerado com sucesso: **${result.fileName}** (${Math.round(result.sizeBytes / 1024)}KB). Acesse via POST /documents/pdf para baixar.`,
          module: classify.module,
          action: classify.action,
          confidence: classify.confidence,
          tokensUsed: 0,
          sessionId,
        }
      } catch {
        // Fallback para chat normal
      }
    }

    // 4. Carregar histórico da sessão
    const history = await this.prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    const historyMessages: ChatMessage[] = history.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // 3. Gerar resposta com contexto do módulo
    const systemPrompt = MODULE_SYSTEM_PROMPTS[classify.module] ?? DEFAULT_SYSTEM_PROMPT
    const messages: ChatMessage[] = [...historyMessages, { role: 'user', content: prompt }]

    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
    })

    const reply = res.choices[0].message.content ?? ''
    const tokensUsed = res.usage?.total_tokens ?? 0

    // 4. Salvar mensagens no banco
    await this.prisma.conversationMessage.createMany({
      data: [
        { sessionId, module: classify.module, role: 'user', content: prompt },
        { sessionId, module: classify.module, role: 'assistant', content: reply, tokensUsed },
      ],
    })

    // 5. Extrair e indexar memória em background (sem bloquear resposta)
    this.extractAndIndex(prompt, reply)

    return {
      reply,
      module: classify.module,
      action: classify.action,
      confidence: classify.confidence,
      tokensUsed,
      sessionId,
    }
  }

  async classify(prompt: string): Promise<ClassifyResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Você é um classificador de intenções. Responda APENAS em JSON.
Módulos disponíveis:
- jarvis: executar tarefas no PC local — abrir apps, listar arquivos, organizar downloads, obter info do sistema (CPU, RAM, disco, SO), capturar screenshot
- content: criar conteúdo — posts, threads, artigos, calendário editorial
- doc: gerar documentos — PDFs, DOCXs, contratos, propostas, relatórios
- brain: memória e busca — indexar, pesquisar, resumir notas e documentos
- system: perguntas sobre o assistente, saudações, o que você pode fazer

Ações do jarvis disponíveis: open_app, open_url, open_vscode, create_project_folder, list_dir, file_search, organize_downloads, get_system_info, screenshot, notify, clipboard_read, clipboard_write, git_status, git_log, git_branch, git_commit, run_command, docker_ps, docker_start, docker_stop, read_emails, send_email, get_calendar
Ações do content disponíveis: post, thread, article, calendar
Exemplos jarvis: "qual o status do PC", "abra o chrome", "liste os downloads", "coloca música no youtube", "leia meus emails", "manda email para X", "abre o vscode", "crie projeto meu-app nextjs", "tira um screenshot", "me notifica daqui 10 min", "lê minha área de transferência", "git status do projeto X", "quais commits recentes", "cria branch feature/Y", "roda os testes do projeto X", "lista containers docker", "para o container redis", "minha agenda de hoje", "procura arquivo relatorio.pdf"
Exemplos content: "crie um post sobre X", "escreva uma thread sobre Y", "faça um artigo sobre Z", "crie um calendário editorial"
Exemplos brain: "qual minha profissão?", "o que você sabe sobre mim?", "qual meu nome?", "o que eu te disse sobre X?", "me fale sobre meus projetos"
Exemplos system: "quem é você", "o que você pode fazer", "olá", "como você funciona", "meu nome é X", "trabalho como Y", "sou Z", "me chamo X", afirmações e apresentações pessoais do usuário

Formato da resposta: { "module": "...", "action": "...", "confidence": 0.0-1.0 }`,
      },
      { role: 'user', content: prompt },
    ]
    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
    })
    return JSON.parse(res.choices[0].message.content ?? '{}') as ClassifyResult
  }

  private async extractAndIndex(prompt: string, reply: string): Promise<void> {
    try {
      const res = await this.llm.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um extrator de memória. Analise a mensagem do usuário e responda em JSON.
Se o usuário revelou informações pessoais relevantes (nome, profissão, cidade, projeto, preferência, habilidade, objetivo), retorne:
{ "hasMemory": true, "content": "frase curta descrevendo o fato em 3ª pessoa", "sourcePath": "memoria/auto" }
Se não há informação relevante para memorizar, retorne:
{ "hasMemory": false }
Seja criterioso — não memorize perguntas, comandos ou respostas genéricas.`,
          },
          { role: 'user', content: `Mensagem do usuário: "${prompt}"` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      })

      const extracted = JSON.parse(res.choices[0].message.content ?? '{"hasMemory":false}')
      if (extracted.hasMemory && extracted.content) {
        console.log('[extractAndIndex] indexando:', extracted.content)
        await this.memory.indexDocument(extracted.content, extracted.sourcePath ?? 'memoria/auto', {
          auto: true,
          originalPrompt: prompt.slice(0, 100),
        })
      }
    } catch (err) {
      console.error('[extractAndIndex] falhou:', (err as Error).message)
    }
  }

  async streamChat(prompt: string, sessionId: string, module: string, onToken: (token: string) => void): Promise<void> {
    const history = await this.prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    const historyMessages: ChatMessage[] = history.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const systemPrompt = this.getSystemPrompt(module)
    const messages: ChatMessage[] = [...historyMessages, { role: 'user', content: prompt }]

    const stream = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
      stream: true,
    })

    let fullReply = ''
    let tokensUsed = 0

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ''
      if (token) {
        fullReply += token
        onToken(token)
      }
      if (chunk.usage) tokensUsed = chunk.usage.total_tokens
    }

    await this.prisma.conversationMessage.createMany({
      data: [
        { sessionId, module, role: 'user', content: prompt },
        { sessionId, module, role: 'assistant', content: fullReply, tokensUsed },
      ],
    })

    // Extrair e indexar memória em background
    this.extractAndIndex(prompt, fullReply)
  }

  async chat(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
    })
    return res.choices[0].message.content ?? ''
  }
}
