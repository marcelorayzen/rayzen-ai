import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

export type ContentType = 'post' | 'thread' | 'article' | 'calendar'
export type ContentTone = 'professional' | 'casual' | 'educational' | 'persuasive' | 'creative'

export interface ContentResult {
  type: ContentType
  content: string
  tokensUsed: number
}

export interface CalendarEntry {
  day: number
  theme: string
  format: ContentType
  hook: string
}

export interface CalendarResult {
  period: string
  entries: CalendarEntry[]
  tokensUsed: number
}

const TYPE_PROMPTS: Record<ContentType, string> = {
  post: `Crie um post para LinkedIn ou Instagram.
Estrutura: gancho forte (1ª linha), desenvolvimento (3-5 parágrafos curtos), CTA no final.
Use quebras de linha estratégicas. Inclua emojis relevantes. Máximo 300 palavras.`,

  thread: `Crie uma thread para X (Twitter).
Formato: numerada de 1/ até no máximo 10 tweets.
Cada tweet máximo 280 caracteres. Gancho forte no 1/. Encerre com CTA ou reflexão.`,

  article: `Crie um artigo completo para blog ou LinkedIn Articles.
Estrutura: título SEO, introdução, 3-5 seções com subtítulos H2, conclusão com CTA.
Tom informativo e aprofundado. Entre 600-1000 palavras.`,

  calendar: `Crie um calendário editorial.`,
}

@Injectable()
export class ContentService {
  private prisma: PrismaClient
  private llm: OpenAI

  constructor(private config: ConfigService) {
    this.prisma = new PrismaClient()
    this.llm = new OpenAI({
      baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
      apiKey: this.config.get('LITELLM_MASTER_KEY'),
    })
  }

  async generate(
    type: ContentType,
    topic: string,
    tone: ContentTone,
    sessionId: string,
    context?: string,
  ): Promise<ContentResult> {
    const toneMap: Record<ContentTone, string> = {
      professional: 'profissional e autoridade',
      casual: 'casual e próximo',
      educational: 'educativo e didático',
      persuasive: 'persuasivo e motivacional',
      creative: 'criativo e diferente',
    }

    const systemPrompt = `Você é Rayzen, especialista em criação de conteúdo para redes sociais e blogs.
${TYPE_PROMPTS[type]}
Tom: ${toneMap[tone]}.
Vá direto ao conteúdo — sem frases de abertura ou explicações. Português brasileiro.`

    const userPrompt = context
      ? `Tema: ${topic}\nContexto adicional: ${context}`
      : `Tema: ${topic}`

    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
    })

    const content = res.choices[0].message.content ?? ''
    const tokensUsed = res.usage?.total_tokens ?? 0

    await this.prisma.conversationMessage.createMany({
      data: [
        { sessionId, module: 'content', role: 'user', content: `${type}: ${topic}` },
        { sessionId, module: 'content', role: 'assistant', content, tokensUsed },
      ],
    })

    return { type, content, tokensUsed }
  }

  async generateCalendar(
    topic: string,
    days: number,
    sessionId: string,
  ): Promise<CalendarResult> {
    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Você é Rayzen, especialista em calendário editorial.
Crie um calendário editorial para ${days} dias sobre o tema dado.
Responda APENAS em JSON válido neste formato:
{
  "entries": [
    { "day": 1, "theme": "...", "format": "post|thread|article", "hook": "..." }
  ]
}
Sem markdown, sem explicações. Apenas o JSON.`,
        },
        { role: 'user', content: `Tema geral: ${topic}. Crie ${days} entradas variadas.` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const parsed = JSON.parse(res.choices[0].message.content ?? '{"entries":[]}')
    const tokensUsed = res.usage?.total_tokens ?? 0

    await this.prisma.conversationMessage.createMany({
      data: [
        { sessionId, module: 'content', role: 'user', content: `calendário: ${topic} (${days} dias)` },
        { sessionId, module: 'content', role: 'assistant', content: JSON.stringify(parsed), tokensUsed },
      ],
    })

    return {
      period: `${days} dias`,
      entries: parsed.entries as CalendarEntry[],
      tokensUsed,
    }
  }
}
