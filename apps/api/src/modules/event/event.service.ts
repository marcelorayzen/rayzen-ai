import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

export type EventSource = 'chat' | 'memory' | 'cli' | 'voice' | 'execution' | 'manual'
export type EventType = 'message' | 'index' | 'execution' | 'decision' | 'note' | 'error'
export type EventIntent = 'decision' | 'idea' | 'problem' | 'reference' | 'checkpoint'

export interface CreateEventDto {
  projectId?: string
  source: EventSource
  type: EventType
  intent?: EventIntent
  content: string
  metadata?: Record<string, unknown>
}

@Injectable()
export class EventService {
  private prisma = new PrismaClient()

  async create(dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        projectId: dto.projectId ?? null,
        source: dto.source,
        type: dto.type,
        intent: dto.intent ?? null,
        content: dto.content,
        metadata: (dto.metadata ?? {}) as object,
      },
    })
  }

  async findAll(filters: { projectId?: string; source?: string; type?: string; limit?: number }) {
    return this.prisma.event.findMany({
      where: {
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.type ? { type: filters.type } : {}),
      },
      orderBy: { ts: 'desc' },
      take: filters.limit ?? 50,
    })
  }
}
