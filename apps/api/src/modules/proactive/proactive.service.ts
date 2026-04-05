import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

export interface Recommendation {
  id: string
  type: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  action: string | null
  computedAt: string
}

const CACHE_TTL_MS = 60 * 60 * 1000  // 1h

@Injectable()
export class ProactiveService {
  private prisma = new PrismaClient()
  private llm: OpenAI

  constructor(private config: ConfigService) {
    this.llm = new OpenAI({
      baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
      apiKey: this.config.get('LITELLM_MASTER_KEY'),
    })
  }

  async getRecommendations(projectId: string): Promise<Recommendation[]> {
    // Verificar se cache ainda é válido (última computação < 1h)
    const latest = await this.prisma.projectRecommendation.findFirst({
      where: { projectId, dismissedAt: null },
      orderBy: { computedAt: 'desc' },
    })

    const isStale = !latest || (Date.now() - latest.computedAt.getTime() > CACHE_TTL_MS)

    if (isStale) {
      await this.compute(projectId)
    }

    const rows = await this.prisma.projectRecommendation.findMany({
      where: { projectId, dismissedAt: null },
      orderBy: [
        { priority: 'asc' },   // high antes de medium antes de low (asc = high primeiro pelo sort abaixo)
        { computedAt: 'desc' },
      ],
    })

    // Ordenar: high → medium → low
    const order = { high: 0, medium: 1, low: 2 }
    rows.sort((a, b) => (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2))

    return rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      priority: r.priority as 'low' | 'medium' | 'high',
      action: r.action,
      computedAt: r.computedAt.toISOString(),
    }))
  }

  async dismiss(recommendationId: string) {
    return this.prisma.projectRecommendation.update({
      where: { id: recommendationId },
      data: { dismissedAt: new Date() },
    })
  }

  private async compute(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project || project.status !== 'active') return

    // Apagar recomendações não descartadas anteriores (serão substituídas)
    await this.prisma.projectRecommendation.deleteMany({
      where: { projectId, dismissedAt: null },
    })

    const [events, artifacts, docs, state] = await Promise.all([
      this.prisma.event.findMany({
        where: { projectId },
        orderBy: { ts: 'desc' },
        take: 100,
      }),
      this.prisma.sessionArtifact.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.projectDocument.findMany({
        where: { projectId },
      }),
      this.prisma.projectState.findUnique({ where: { projectId } }),
    ])

    const newRecs: Array<{
      projectId: string
      type: string
      title: string
      description: string
      priority: string
      action: string | null
    }> = []

    // ── Regra 1: Inatividade > 7 dias ───────────────────────────────────────
    const lastEvent = events[0]
    const daysSinceActivity = lastEvent
      ? Math.floor((Date.now() - lastEvent.ts.getTime()) / 86400000)
      : null

    if (daysSinceActivity !== null && daysSinceActivity > 7) {
      newRecs.push({
        projectId,
        type: 'inactivity',
        title: `Projeto parado há ${daysSinceActivity} dias`,
        description: `O último evento registrado foi em ${lastEvent!.ts.toLocaleDateString('pt-BR')}. Projetos inativos acumulam contexto não documentado.`,
        priority: daysSinceActivity > 14 ? 'high' : 'medium',
        action: 'Abra uma sessão de trabalho ou registre um checkpoint manual para atualizar o estado.',
      })
    }

    // ── Regra 2: Documentação não regenerada há > 30 dias ───────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    for (const doc of docs) {
      if (doc.generatedAt < thirtyDaysAgo) {
        const age = Math.floor((Date.now() - doc.generatedAt.getTime()) / 86400000)
        newRecs.push({
          projectId,
          type: 'doc_stale',
          title: `"${doc.type}" desatualizado há ${age} dias`,
          description: `O documento foi gerado em ${doc.generatedAt.toLocaleDateString('pt-BR')} e pode não refletir o estado atual do projeto.`,
          priority: age > 60 ? 'high' : 'medium',
          action: `Clique em "Regenerar" no painel de documentação para atualizar ${doc.type}.`,
        })
      }
    }

    // ── Regra 3: Bloqueio persistente em 3+ sessões ──────────────────────────
    if (artifacts.length >= 3) {
      const recentThree = artifacts.slice(0, 3)
      const blockerCounts: Record<string, number> = {}

      for (const a of recentThree) {
        const content = a.content as { decisions?: string[]; next_steps?: string[] }
        // Procura padrões de bloqueio nos next_steps
        const steps = content.next_steps ?? []
        for (const step of steps) {
          const key = step.toLowerCase().slice(0, 60)
          blockerCounts[key] = (blockerCounts[key] ?? 0) + 1
        }
      }

      const stuck = Object.entries(blockerCounts).filter(([, c]) => c >= 3)
      if (stuck.length > 0) {
        newRecs.push({
          projectId,
          type: 'blocker_stuck',
          title: `${stuck.length} próximo(s) passo(s) repetido(s) em 3 sessões`,
          description: `Itens como "${stuck[0][0].slice(0, 80)}…" aparecem como pendente em 3 sínteses consecutivas sem progresso.`,
          priority: 'high',
          action: 'Revise se esses itens estão realmente bloqueados ou precisam ser redefinidos.',
        })
      }
    }

    // ── Regra 4: Next steps sem evento correspondente após 7 dias ────────────
    if (artifacts.length > 0) {
      const weekAgo = new Date(Date.now() - 7 * 86400000)
      const oldArtifacts = artifacts.filter(a => a.createdAt < weekAgo)

      if (oldArtifacts.length > 0) {
        const allNextSteps = oldArtifacts.flatMap(a => {
          const c = a.content as { next_steps?: string[] }
          return c.next_steps ?? []
        })

        const recentEventContents = events
          .filter(e => e.ts > weekAgo)
          .map(e => e.content.toLowerCase())
          .join(' ')

        const unaddressed = allNextSteps.filter(step =>
          !recentEventContents.includes(step.toLowerCase().slice(0, 30))
        )

        if (unaddressed.length >= 3) {
          newRecs.push({
            projectId,
            type: 'next_step_pending',
            title: `${unaddressed.length} próximos passos sem ação há mais de 7 dias`,
            description: `Itens identificados nas sínteses: "${unaddressed.slice(0, 2).join('" e "')}"`,
            priority: 'medium',
            action: 'Faça um checkpoint para sintetizar o estado atual ou registre as ações que foram tomadas.',
          })
        }
      }
    }

    // ── Regra 5: Consistência (LLM) — só roda se há dados suficientes ────────
    if (docs.length > 0 && artifacts.length > 0 && events.length > 10) {
      const consistencyRec = await this.checkConsistency(projectId, docs, events, state)
      if (consistencyRec) newRecs.push(consistencyRec)
    }

    if (newRecs.length > 0) {
      await this.prisma.projectRecommendation.createMany({ data: newRecs })
    } else {
      // Criar um placeholder "tudo bem" para evitar recomputação imediata
      await this.prisma.projectRecommendation.create({
        data: {
          projectId,
          type: 'all_clear',
          title: 'Tudo em ordem',
          description: 'Nenhuma inconsistência ou ação urgente identificada.',
          priority: 'low',
          action: null,
        },
      })
    }
  }

  private async checkConsistency(
    projectId: string,
    docs: Array<{ type: string; content: string; generatedAt: Date }>,
    events: Array<{ source: string; type: string; content: string; ts: Date }>,
    state: { objective?: string | null; blockers?: unknown; nextSteps?: unknown } | null,
  ): Promise<{ projectId: string; type: string; title: string; description: string; priority: string; action: string | null } | null> {
    const docsText = docs
      .map(d => `### ${d.type} (gerado ${d.generatedAt.toLocaleDateString('pt-BR')})\n${d.content.slice(0, 600)}`)
      .join('\n\n')

    const recentEvents = events
      .slice(0, 20)
      .map(e => `[${e.ts.toLocaleDateString('pt-BR')}] ${e.content}`)
      .join('\n')

    const stateText = state
      ? `Objetivo: ${state.objective ?? ''}\nBlockers: ${JSON.stringify(state.blockers)}\nNext steps: ${JSON.stringify(state.nextSteps)}`
      : ''

    const prompt = `Analise se há inconsistências entre os documentos do projeto e a atividade recente.

## Documentos gerados
${docsText}

## Estado estruturado
${stateText}

## Eventos recentes
${recentEvents}

Verifique:
1. O estado estruturado reflete a atividade real?
2. Os documentos contradizem os eventos recentes?
3. Há decisões nos eventos não capturadas nos documentos?

Se encontrar inconsistência relevante, responda em JSON:
{
  "found": true,
  "title": "título curto do problema",
  "description": "descrição específica da inconsistência (max 150 chars)",
  "severity": "low|medium|high"
}

Se tudo estiver consistente, responda:
{ "found": false }`

    try {
      const res = await this.llm.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      })

      const result = JSON.parse(res.choices[0].message.content ?? '{}') as {
        found: boolean; title?: string; description?: string; severity?: string
      }

      if (!result.found) return null

      return {
        projectId,
        type: 'consistency',
        title: result.title ?? 'Inconsistência detectada',
        description: result.description ?? '',
        priority: result.severity === 'high' ? 'high' : result.severity === 'medium' ? 'medium' : 'low',
        action: 'Regenere a documentação ou atualize o estado do projeto para refletir a realidade atual.',
      }
    } catch {
      return null
    }
  }
}
