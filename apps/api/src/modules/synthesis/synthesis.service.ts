import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

export interface SynthesisResult {
  summary: string
  decisions: string[]
  next_steps: string[]
  learnings: string[]
  confidence: 'low' | 'medium' | 'high'
}

@Injectable()
export class SynthesisService {
  private prisma = new PrismaClient()
  private llm: OpenAI

  constructor(private config: ConfigService) {
    this.llm = new OpenAI({
      baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
      apiKey: this.config.get('LITELLM_MASTER_KEY'),
    })
  }

  async synthesizeSession(sessionId: string, projectId?: string): Promise<SessionArtifactResponse> {
    const [messages, events] = await Promise.all([
      this.prisma.conversationMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.event.findMany({
        where: { metadata: { path: ['sessionId'], equals: sessionId } },
        orderBy: { ts: 'asc' },
      }),
    ])

    if (messages.length === 0 && events.length === 0) {
      throw new BadRequestException('Sessão sem conteúdo para sintetizar')
    }

    const synthesis = await this.runSynthesis({ messages, events, label: 'sessão' })

    const artifact = await this.prisma.sessionArtifact.create({
      data: {
        sessionId,
        projectId: projectId ?? null,
        type: 'synthesis',
        content: synthesis as object,
      },
    })

    return { id: artifact.id, sessionId, projectId, synthesis, createdAt: artifact.createdAt.toISOString() }
  }

  async checkpoint(projectId: string, note?: string): Promise<SessionArtifactResponse> {
    // Buscar eventos das últimas 2h ou desde o último checkpoint
    const lastCheckpoint = await this.prisma.sessionArtifact.findFirst({
      where: { projectId, type: 'checkpoint' },
      orderBy: { createdAt: 'desc' },
    })

    const since = lastCheckpoint
      ? lastCheckpoint.createdAt
      : new Date(Date.now() - 2 * 60 * 60 * 1000)

    const [events, messages] = await Promise.all([
      this.prisma.event.findMany({
        where: { projectId, ts: { gte: since } },
        orderBy: { ts: 'asc' },
      }),
      this.prisma.conversationMessage.findMany({
        where: { projectId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    if (events.length === 0 && messages.length === 0) {
      throw new BadRequestException('Nenhuma atividade desde o último checkpoint')
    }

    const synthesis = await this.runSynthesis({ messages, events, label: 'checkpoint', note })

    const checkpointId = `checkpoint-${Date.now()}`
    const artifact = await this.prisma.sessionArtifact.create({
      data: {
        sessionId: checkpointId,
        projectId,
        type: 'checkpoint',
        content: synthesis as object,
      },
    })

    return {
      id: artifact.id,
      sessionId: checkpointId,
      projectId,
      synthesis,
      createdAt: artifact.createdAt.toISOString(),
    }
  }

  private async runSynthesis(opts: {
    messages: Array<{ role: string; content: string }>
    events: Array<{ source: string; type: string; intent?: string | null; content: string }>
    label: string
    note?: string
  }): Promise<SynthesisResult> {
    const chatLines = opts.messages
      .map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 300)}`)
      .join('\n')

    const cliLines = opts.events
      .filter(e => e.source === 'cli')
      .map(e => `[${e.intent ?? e.type}] ${e.content}`)
      .join('\n')

    const manualLines = opts.events
      .filter(e => e.source === 'manual' || e.intent)
      .map(e => `[${e.intent ?? e.type}] ${e.content}`)
      .join('\n')

    const context = [
      opts.note && `## Nota do usuário\n${opts.note}`,
      chatLines && `## Conversa\n${chatLines}`,
      cliLines && `## Ações no terminal\n${cliLines}`,
      manualLines && `## Registros manuais\n${manualLines}`,
    ].filter(Boolean).join('\n\n')

    const totalItems = opts.messages.length + opts.events.length

    const prompt = `Analise esta ${opts.label} de trabalho e extraia em JSON:

${context}

Retorne APENAS JSON válido neste formato:
{
  "summary": "resumo em 2-3 frases do que foi feito",
  "decisions": ["decisão 1", "decisão 2"],
  "next_steps": ["próximo passo 1", "próximo passo 2"],
  "learnings": ["aprendizado 1"],
  "confidence": "low|medium|high"
}

Regras:
- decisions: o que foi decidido ou definido (não óbvio, não trivial)
- next_steps: o que ficou pendente ou foi identificado para fazer
- learnings: insights, problemas resolvidos, padrões descobertos
- confidence: "high" se há >10 itens de contexto e decisões claras, "medium" se contexto parcial, "low" se poucos dados
- Se não houver itens numa categoria, retorne array vazio`

    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })

    try {
      const parsed = JSON.parse(res.choices[0].message.content ?? '{}') as SynthesisResult
      // Garantir confidence com fallback baseado em volume
      if (!parsed.confidence) {
        parsed.confidence = totalItems > 10 ? 'high' : totalItems > 4 ? 'medium' : 'low'
      }
      return parsed
    } catch {
      return {
        summary: 'Síntese não disponível',
        decisions: [],
        next_steps: [],
        learnings: [],
        confidence: 'low',
      }
    }
  }

  async getArtifacts(projectId?: string, sessionId?: string) {
    return this.prisma.sessionArtifact.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  }
}

export interface SessionArtifactResponse {
  id: string
  sessionId: string
  projectId?: string
  synthesis: SynthesisResult
  createdAt: string
}
