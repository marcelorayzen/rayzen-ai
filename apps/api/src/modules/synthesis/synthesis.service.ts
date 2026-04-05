import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

export interface SynthesisResult {
  summary: string
  decisions: string[]
  next_steps: string[]
  learnings: string[]
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
    // Buscar eventos + mensagens da sessão
    const [messages, events] = await Promise.all([
      this.prisma.conversationMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.event.findMany({
        where: {
          metadata: { path: ['sessionId'], equals: sessionId },
        },
        orderBy: { ts: 'asc' },
      }),
    ])

    if (messages.length === 0 && events.length === 0) {
      throw new BadRequestException('Sessão sem conteúdo para sintetizar')
    }

    // Montar contexto para o LLM
    const chatLines = messages
      .map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 300)}`)
      .join('\n')

    const cliLines = events
      .filter(e => e.source === 'cli')
      .map(e => `[${e.type}] ${e.content}`)
      .join('\n')

    const context = [
      chatLines && `## Conversa\n${chatLines}`,
      cliLines && `## Ações no terminal\n${cliLines}`,
    ].filter(Boolean).join('\n\n')

    const prompt = `Analise esta sessão de trabalho e extraia em JSON:

${context}

Retorne APENAS JSON válido neste formato:
{
  "summary": "resumo em 2-3 frases do que foi feito",
  "decisions": ["decisão 1", "decisão 2"],
  "next_steps": ["próximo passo 1", "próximo passo 2"],
  "learnings": ["aprendizado 1"]
}

Regras:
- decisions: o que foi decidido ou definido (não óbvio)
- next_steps: o que ficou pendente ou foi identificado para fazer
- learnings: insights, problemas resolvidos, padrões descobertos
- Se não houver itens numa categoria, retorne array vazio`

    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })

    let synthesis: SynthesisResult
    try {
      synthesis = JSON.parse(res.choices[0].message.content ?? '{}') as SynthesisResult
    } catch {
      synthesis = { summary: 'Síntese não disponível', decisions: [], next_steps: [], learnings: [] }
    }

    // Salvar artefato
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
