import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { MemoryService } from '../memory.service'

const mockPrisma = {
  document: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  conversationMessage: {
    createMany: jest.fn(),
  },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

const mockConfigGet = jest.fn().mockReturnValue('mock-key')

describe('MemoryService', () => {
  let service: MemoryService

  beforeEach(async () => {
    jest.clearAllMocks()

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [{ embedding: new Array(1024).fill(0.1) }],
      }),
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: ConfigService, useValue: { get: mockConfigGet } },
      ],
    }).compile()

    service = module.get<MemoryService>(MemoryService)
  })

  describe('indexDocument', () => {
    it('retorna status "created" para documento novo', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null)
      mockPrisma.$executeRaw.mockResolvedValue(1)

      const result = await service.indexDocument('Conteúdo do documento', 'file/test.txt')

      expect(result.status).toBe('created')
      expect(result.id).toBeDefined()
    })

    it('retorna status "updated" para documento com mesmo checksum', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'existing-id', checksum: 'abc' })
      mockPrisma.$executeRaw.mockResolvedValue(1)

      const result = await service.indexDocument('Conteúdo duplicado')

      expect(result.status).toBe('updated')
      expect(result.id).toBe('existing-id')
    })

    it('chama a API Jina para gerar embedding', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null)
      mockPrisma.$executeRaw.mockResolvedValue(1)

      await service.indexDocument('texto')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/embeddings',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('search', () => {
    it('retorna array vazio quando não há documentos', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([])

      const result = await service.search('query')

      expect(result).toEqual([])
    })

    it('mapeia score para number corretamente', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'doc-1',
          content: 'Conteúdo relevante',
          source_path: 'file/test.txt',
          metadata: { type: 'file' },
          score: '0.95',
        },
      ])

      const result = await service.search('query')

      expect(typeof result[0].score).toBe('number')
      expect(result[0].score).toBe(0.95)
    })

    it('mapeia source_path para sourcePath', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'doc-1',
          content: 'texto',
          source_path: 'github/user/repo',
          metadata: {},
          score: 0.8,
        },
      ])

      const result = await service.search('query')

      expect(result[0].sourcePath).toBe('github/user/repo')
    })
  })

  describe('chunkText', () => {
    it('retorna um chunk para texto pequeno', () => {
      const text = 'Este é um parágrafo simples com mais de 50 caracteres para não ser filtrado.'
      const chunks = service.chunkText(text)
      expect(chunks).toHaveLength(1)
    })

    it('retorna array vazio para texto muito curto (< 50 chars)', () => {
      const chunks = service.chunkText('curto')
      expect(chunks).toHaveLength(0)
    })

    it('divide texto longo em múltiplos chunks', () => {
      const paragraph = 'Este é um parágrafo com conteúdo suficiente para ser um chunk. '.repeat(5)
      const text = Array(5).fill(paragraph).join('\n\n')
      const chunks = service.chunkText(text, 200)
      expect(chunks.length).toBeGreaterThan(1)
    })
  })

  describe('indexUrl', () => {
    it('lança erro quando URL retorna status não-ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })

      await expect(service.indexUrl('https://example.com/404')).rejects.toThrow(
        'Falha ao buscar URL: HTTP 404',
      )
    })

    it('lança erro quando página não tem conteúdo legível', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<script>alert(1)</script><style>body{}</style>'),
      })

      await expect(service.indexUrl('https://example.com')).rejects.toThrow(
        'Página sem conteúdo legível',
      )
    })
  })
})
