import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class StatsService {
  private prisma = new PrismaClient()

  async getTokenStats() {
    const total = await this.prisma.conversationMessage.aggregate({
      _sum: { tokensUsed: true },
      _count: { id: true },
    })

    const byModule = await this.prisma.conversationMessage.groupBy({
      by: ['module'],
      _sum: { tokensUsed: true },
      _count: { id: true },
      orderBy: { _sum: { tokensUsed: 'desc' } },
    }) as Array<{ module: string | null; _sum: { tokensUsed: number | null }; _count: { id: number } }>

    const last24h = await this.prisma.conversationMessage.aggregate({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      _sum: { tokensUsed: true },
      _count: { id: true },
    })

    return {
      total: {
        tokens: total._sum.tokensUsed ?? 0,
        messages: total._count.id,
      },
      last24h: {
        tokens: last24h._sum.tokensUsed ?? 0,
        messages: last24h._count.id,
      },
      byModule: byModule.map((m) => ({
        module: m.module,
        tokens: m._sum.tokensUsed ?? 0,
        messages: m._count.id,
      })),
    }
  }

  async getRecentSessions(limit = 20) {
    const sessions = await this.prisma.conversationMessage.groupBy({
      by: ['sessionId'],
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: limit,
    }) as Array<{ sessionId: string; _count: { id: number }; _max: { createdAt: Date | null } }>

    // Pega a primeira mensagem do usuário de cada sessão como título
    const sessionIds = sessions.map((s) => s.sessionId)
    const firstMessages = await this.prisma.conversationMessage.findMany({
      where: { sessionId: { in: sessionIds }, role: 'user' },
      orderBy: { createdAt: 'asc' },
      distinct: ['sessionId'],
    })

    const titleMap = new Map<string, string>(firstMessages.map((m: { sessionId: string; content: string }) => [m.sessionId, m.content]))

    return sessions.map((s) => ({
      sessionId: s.sessionId,
      messages: s._count.id,
      lastActivity: s._max.createdAt,
      title: (titleMap.get(s.sessionId) ?? 'Conversa').slice(0, 50),
    }))
  }

  async getSessionMessages(sessionId: string) {
    return this.prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, module: true, createdAt: true },
    })
  }

  async deleteSession(sessionId: string) {
    await this.prisma.conversationMessage.deleteMany({ where: { sessionId } })
    return { deleted: true }
  }
}
