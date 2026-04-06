import { Test, TestingModule } from '@nestjs/testing'
import { SessionService } from '../session.service'
import { PrismaService } from '../../../prisma/prisma.service'

const mockPrisma = {
  conversationMessage: {
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
}

describe('SessionService', () => {
  let service: SessionService

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<SessionService>(SessionService)
  })

  describe('getTokenStats', () => {
    it('retorna estatísticas de tokens corretamente', async () => {
      mockPrisma.conversationMessage.aggregate
        .mockResolvedValueOnce({ _sum: { tokensUsed: 1500 }, _count: { id: 10 } })
        .mockResolvedValueOnce({ _sum: { tokensUsed: 300 }, _count: { id: 2 } })

      mockPrisma.conversationMessage.groupBy.mockResolvedValue([
        { module: 'brain', _sum: { tokensUsed: 800 }, _count: { id: 5 } },
        { module: 'system', _sum: { tokensUsed: 700 }, _count: { id: 5 } },
      ])

      const result = await service.getTokenStats()

      expect(result.total.tokens).toBe(1500)
      expect(result.total.messages).toBe(10)
      expect(result.last24h.tokens).toBe(300)
      expect(result.byModule).toHaveLength(2)
      expect(result.byModule[0].module).toBe('brain')
    })

    it('usa 0 como fallback quando tokensUsed é null', async () => {
      mockPrisma.conversationMessage.aggregate
        .mockResolvedValueOnce({ _sum: { tokensUsed: null }, _count: { id: 0 } })
        .mockResolvedValueOnce({ _sum: { tokensUsed: null }, _count: { id: 0 } })

      mockPrisma.conversationMessage.groupBy.mockResolvedValue([])

      const result = await service.getTokenStats()

      expect(result.total.tokens).toBe(0)
      expect(result.last24h.tokens).toBe(0)
    })
  })

  describe('getRecentSessions', () => {
    it('retorna sessões com título da primeira mensagem', async () => {
      const mockSessions = [
        { sessionId: 'sess-1', _count: { id: 5 }, _max: { createdAt: new Date('2026-04-01') } },
        { sessionId: 'sess-2', _count: { id: 3 }, _max: { createdAt: new Date('2026-04-02') } },
      ]

      const mockFirstMessages = [
        { sessionId: 'sess-1', content: 'Como faço deploy no Docker?' },
        { sessionId: 'sess-2', content: 'Qual é a diferença entre NestJS e Express?' },
      ]

      mockPrisma.conversationMessage.groupBy.mockResolvedValue(mockSessions)
      mockPrisma.conversationMessage.findMany.mockResolvedValue(mockFirstMessages)

      const result = await service.getRecentSessions()

      expect(result).toHaveLength(2)
      expect(result[0].sessionId).toBe('sess-1')
      expect(result[0].title).toBe('Como faço deploy no Docker?')
      expect(result[0].messages).toBe(5)
    })

    it('usa "Conversa" como título quando não há mensagem do usuário', async () => {
      mockPrisma.conversationMessage.groupBy.mockResolvedValue([
        { sessionId: 'sess-orphan', _count: { id: 1 }, _max: { createdAt: new Date() } },
      ])
      mockPrisma.conversationMessage.findMany.mockResolvedValue([])

      const result = await service.getRecentSessions()

      expect(result[0].title).toBe('Conversa')
    })

    it('trunca título em 50 caracteres', async () => {
      const longTitle = 'A'.repeat(100)
      mockPrisma.conversationMessage.groupBy.mockResolvedValue([
        { sessionId: 'sess-1', _count: { id: 1 }, _max: { createdAt: new Date() } },
      ])
      mockPrisma.conversationMessage.findMany.mockResolvedValue([
        { sessionId: 'sess-1', content: longTitle },
      ])

      const result = await service.getRecentSessions()

      expect(result[0].title).toHaveLength(50)
    })
  })

  describe('deleteSession', () => {
    it('chama deleteMany com sessionId correto', async () => {
      mockPrisma.conversationMessage.deleteMany.mockResolvedValue({ count: 3 })

      const result = await service.deleteSession('sess-abc')

      expect(mockPrisma.conversationMessage.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: 'sess-abc' },
      })
      expect(result).toEqual({ deleted: true })
    })
  })
})
