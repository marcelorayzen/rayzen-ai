import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

export interface ProjectStateData {
  objective: string
  stage: string
  blockers: string[]
  recentDecisions: string[]
  nextSteps: string[]
  risks: string[]
  docGaps: string[]
  riskLevel: 'low' | 'medium' | 'high'
}

@Injectable()
export class ProjectStateService {
  private prisma = new PrismaClient()
  private llm: OpenAI

  constructor(private config: ConfigService) {
    this.llm = new OpenAI({
      baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
      apiKey: this.config.get('LITELLM_MASTER_KEY'),
    })
  }

  async get(projectId: string) {
    const state = await this.prisma.projectState.findUnique({ where: { projectId } })
    if (!state) return null
    return this.serialize(state)
  }

  async refresh(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new NotFoundException('Projeto não encontrado')

    // Coletar contexto: eventos recentes + artefatos de síntese + documentos gerados
    const [events, artifacts, docs] = await Promise.all([
      this.prisma.event.findMany({
        where: { projectId },
        orderBy: { ts: 'desc' },
        take: 80,
      }),
      this.prisma.sessionArtifact.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.projectDocument.findMany({
        where: { projectId },
      }),
    ])

    const eventsText = events
      .map(e => `[${e.ts.toISOString().slice(0, 16)}] [${e.intent ?? e.type}] ${e.content}`)
      .join('\n')

    const artifactsText = artifacts
      .map(a => {
        const c = a.content as Record<string, unknown>
        const decisions = (c['decisions'] as string[] ?? []).slice(0, 3).join('; ')
        const steps = (c['next_steps'] as string[] ?? []).slice(0, 3).join('; ')
        return `Síntese ${a.createdAt.toISOString().slice(0, 10)}: decisões=[${decisions}] próximos=[${steps}]`
      })
      .join('\n')

    const docTypes = docs.map(d => d.type).join(', ')

    const prompt = `Analise o estado atual deste projeto de software e retorne JSON estruturado.

Projeto: ${project.name}
Descrição: ${project.description ?? 'não informada'}
Goals: ${project.goals ?? 'não informados'}

Eventos recentes (mais novo primeiro):
${eventsText || 'nenhum evento registrado'}

Sínteses de sessões anteriores:
${artifactsText || 'nenhuma síntese disponível'}

Documentos gerados: ${docTypes || 'nenhum'}

Retorne APENAS JSON válido neste formato:
{
  "objective": "objetivo atual em uma frase clara e específica",
  "stage": "discovery|building|stabilizing|maintaining|paused",
  "blockers": ["bloqueio 1", "bloqueio 2"],
  "recentDecisions": ["decisão recente 1", "decisão recente 2"],
  "nextSteps": ["próximo passo 1", "próximo passo 2", "próximo passo 3"],
  "risks": ["risco 1", "risco 2"],
  "docGaps": ["documentação faltando 1", "documentação faltando 2"],
  "riskLevel": "low|medium|high"
}

Regras:
- objective: o que o projeto está tentando alcançar AGORA (não o objetivo final geral)
- stage: fase atual real com base na atividade observada
- blockers: impedimentos concretos identificados nos eventos/sínteses
- riskLevel: "high" se há blockers críticos ou projeto parado há muito tempo, "medium" se há riscos mas progresso, "low" se tudo flui
- Máximo 5 itens por array
- Se não há dados suficientes para uma categoria, retorne array vazio ou string vazia`

    const res = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })

    let derived: ProjectStateData
    try {
      derived = JSON.parse(res.choices[0].message.content ?? '{}') as ProjectStateData
    } catch {
      derived = {
        objective: '',
        stage: 'building',
        blockers: [],
        recentDecisions: [],
        nextSteps: [],
        risks: [],
        docGaps: [],
        riskLevel: 'low',
      }
    }

    const state = await this.prisma.projectState.upsert({
      where: { projectId },
      create: {
        projectId,
        objective: derived.objective,
        stage: derived.stage,
        blockers: derived.blockers as object,
        recentDecisions: derived.recentDecisions as object,
        nextSteps: derived.nextSteps as object,
        risks: derived.risks as object,
        docGaps: derived.docGaps as object,
        riskLevel: derived.riskLevel,
      },
      update: {
        objective: derived.objective,
        stage: derived.stage,
        blockers: derived.blockers as object,
        recentDecisions: derived.recentDecisions as object,
        nextSteps: derived.nextSteps as object,
        risks: derived.risks as object,
        docGaps: derived.docGaps as object,
        riskLevel: derived.riskLevel,
      },
    })

    return this.serialize(state)
  }

  private serialize(state: {
    id: string
    projectId: string
    objective: string | null
    stage: string | null
    blockers: unknown
    recentDecisions: unknown
    nextSteps: unknown
    risks: unknown
    docGaps: unknown
    riskLevel: string
    updatedAt: Date
  }) {
    return {
      id: state.id,
      projectId: state.projectId,
      objective: state.objective ?? '',
      stage: state.stage ?? 'building',
      blockers: (state.blockers as string[]) ?? [],
      recentDecisions: (state.recentDecisions as string[]) ?? [],
      nextSteps: (state.nextSteps as string[]) ?? [],
      risks: (state.risks as string[]) ?? [],
      docGaps: (state.docGaps as string[]) ?? [],
      riskLevel: state.riskLevel as 'low' | 'medium' | 'high',
      updatedAt: state.updatedAt.toISOString(),
    }
  }
}
