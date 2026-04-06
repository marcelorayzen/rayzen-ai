import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

export type DocType = 'project_state' | 'decisions_log' | 'next_actions' | 'work_journal'

const DOC_PROMPTS: Record<DocType, (ctx: string) => string> = {
  project_state: (ctx) => `Com base no histórico abaixo, escreva um documento markdown "Estado do Projeto" com:
- Status atual (o que está acontecendo agora)
- O que foi concluído recentemente
- Bloqueios ou riscos identificados
- Próximos marcos

${ctx}

Seja objetivo, use marcadores. Máximo 400 palavras.`,

  decisions_log: (ctx) => `Com base no histórico abaixo, escreva um documento markdown "Log de Decisões" listando todas as decisões técnicas e de produto identificadas, no formato:

## [Data] Título da decisão
**Contexto:** ...
**Decisão:** ...
**Motivo:** ...

${ctx}

Liste apenas decisões reais identificadas no histórico. Se não houver data precisa, use "Recente".`,

  next_actions: (ctx) => `Com base no histórico abaixo, escreva um documento markdown "Próximas Ações" consolidando todos os próximos passos pendentes identificados, agrupados por área:

${ctx}

Formato:
## Área
- [ ] Ação pendente

Remove duplicatas. Priorize por impacto.`,

  work_journal: (ctx) => `Com base no histórico abaixo, escreva um documento markdown "Diário de Trabalho" — um log narrativo cronológico do que foi feito, decidido e aprendido.

${ctx}

Formato: entradas cronológicas com cabeçalho de data/sessão. Tom técnico e direto. Máximo 600 palavras.`,
}

// Diff simples linha a linha: retorna linhas adicionadas (+) e removidas (-)
function computeDiff(oldText: string, newText: string): string {
  const oldLines = new Set(oldText.split('\n').map(l => l.trim()).filter(Boolean))
  const newLines = new Set(newText.split('\n').map(l => l.trim()).filter(Boolean))

  const removed = [...oldLines].filter(l => !newLines.has(l)).map(l => `- ${l}`)
  const added   = [...newLines].filter(l => !oldLines.has(l)).map(l => `+ ${l}`)

  if (removed.length === 0 && added.length === 0) return '(sem alterações significativas)'
  return [...removed, ...added].slice(0, 60).join('\n')
}

@Injectable()
export class DocumentationService {
  private prisma = new PrismaClient()
  private llm: OpenAI

  constructor(private config: ConfigService) {
    this.llm = new OpenAI({
      baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
      apiKey: this.config.get('LITELLM_MASTER_KEY'),
    })
  }

  async generate(
    projectId: string,
    type: DocType,
    opts: { force?: boolean } = {},
  ): Promise<{ id: string; type: string; content: string; generatedAt: string }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new NotFoundException('Projeto não encontrado')

    // Verificar proteção de revisão manual
    const existing = await this.prisma.projectDocument.findUnique({
      where: { projectId_type: { projectId, type } },
    })

    if (existing?.reviewedAt && !opts.force) {
      throw new BadRequestException(
        'Este documento foi revisado manualmente. Use force=true para regenerar.',
      )
    }

    // Coletar contexto com IDs rastreáveis
    const [artifacts, events] = await Promise.all([
      this.prisma.sessionArtifact.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.event.findMany({
        where: {
          projectId,
          // Fase 13: priorizar consolidated + working; ignorar archive
          memoryClass: { in: ['consolidated', 'working', 'inbox'] },
        },
        orderBy: [
          // consolidated first, then working, then inbox
          { memoryClass: 'asc' },
          { ts: 'desc' },
        ],
        take: 40,
      }),
    ])

    const sourceIds = [
      ...artifacts.map(a => a.id),
      ...events.map(e => e.id),
    ]

    // Montar contexto
    const synthLines = artifacts.map(a => {
      const c = a.content as { summary?: string; decisions?: string[]; next_steps?: string[]; learnings?: string[] }
      return [
        `### Sessão ${new Date(a.createdAt).toLocaleDateString('pt-BR')}`,
        c.summary && `**Resumo:** ${c.summary}`,
        c.decisions?.length && `**Decisões:** ${c.decisions.join('; ')}`,
        c.next_steps?.length && `**Próximos passos:** ${c.next_steps.join('; ')}`,
        c.learnings?.length && `**Aprendizados:** ${c.learnings.join('; ')}`,
      ].filter(Boolean).join('\n')
    }).join('\n\n')

    const eventLines = events
      .filter(e => e.type !== 'message')
      .map(e => `- [${new Date(e.ts).toLocaleDateString('pt-BR')}] [${e.intent ?? e.source}/${e.type}] ${e.content}`)
      .join('\n')

    const context = [
      `# Projeto: ${project.name}`,
      project.goals && `**Objetivos:** ${project.goals}`,
      synthLines && `## Sínteses de sessão\n${synthLines}`,
      eventLines && `## Eventos recentes\n${eventLines}`,
    ].filter(Boolean).join('\n\n')

    const promptFn = DOC_PROMPTS[type]
    if (!promptFn) throw new BadRequestException(`Tipo inválido: ${type}`)

    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      messages: [{ role: 'user', content: promptFn(context) }],
    })

    const newContent = res.choices[0].message.content ?? ''

    // Salvar versão anterior antes de sobrescrever
    if (existing) {
      const diff = computeDiff(existing.content, newContent)
      await this.prisma.projectDocumentVersion.create({
        data: {
          documentId: existing.id,
          content: existing.content,
          previousContent: null, // esta versão era a "anterior"
          diff,
          reason: opts.force ? 'force_regenerated' : 'regenerated',
          sourceIds: sourceIds as object,
        },
      })
    }

    const doc = await this.prisma.projectDocument.upsert({
      where: { projectId_type: { projectId, type } },
      create: { projectId, type, content: newContent },
      update: { content: newContent, generatedAt: new Date(), reviewedAt: null },
    })

    return { id: doc.id, type: doc.type, content: doc.content, generatedAt: doc.generatedAt.toISOString() }
  }

  async generateAll(projectId: string, opts: { force?: boolean } = {}) {
    const types: DocType[] = ['project_state', 'decisions_log', 'next_actions', 'work_journal']
    const results = await Promise.allSettled(types.map(t => this.generate(projectId, t, opts)))
    return types.map((type, i) => {
      const r = results[i]
      return r.status === 'fulfilled'
        ? { type, ok: true, generatedAt: r.value.generatedAt }
        : { type, ok: false, error: (r.reason as Error).message }
    })
  }

  async list(projectId: string) {
    return this.prisma.projectDocument.findMany({
      where: { projectId },
      orderBy: { generatedAt: 'desc' },
      select: { id: true, type: true, content: true, generatedAt: true, reviewedAt: true },
    })
  }

  async getVersions(projectId: string, type: DocType) {
    const doc = await this.prisma.projectDocument.findUnique({
      where: { projectId_type: { projectId, type } },
    })
    if (!doc) return []

    return this.prisma.projectDocumentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        content: true,
        diff: true,
        reason: true,
        sourceIds: true,
        createdAt: true,
      },
    })
  }

  async markReviewed(projectId: string, type: DocType) {
    return this.prisma.projectDocument.update({
      where: { projectId_type: { projectId, type } },
      data: { reviewedAt: new Date() },
    })
  }
}
