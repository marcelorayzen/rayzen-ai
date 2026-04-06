import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { OrchestratorService } from '../orchestrator.service'
import { MemoryService } from '../../memory/memory.service'
import { DocumentProcessingService } from '../../document-processing/document-processing.service'
import { ExecutionService } from '../../execution/execution.service'
import { ContentEngineService } from '../../content-engine/content-engine.service'
import { RayzenConfigService } from '../../configuration/configuration.service'
import { ValidationService } from '../../validation/validation.service'
import { PrismaService } from '../../../prisma/prisma.service'
import { EventService } from '../../event/event.service'

const mockLLM = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
}

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockLLM),
}))

const mockPrisma = {
  conversationMessage: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
  },
}

describe('OrchestratorService', () => {
  let service: OrchestratorService
  let memoryService: jest.Mocked<MemoryService>
  let executionService: jest.Mocked<ExecutionService>
  let contentEngineService: jest.Mocked<ContentEngineService>
  let validationService: jest.Mocked<ValidationService>

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock-key') },
        },
        {
          provide: MemoryService,
          useValue: {
            searchAndSynthesize: jest.fn(),
            indexDocument: jest.fn(),
          },
        },
        {
          provide: DocumentProcessingService,
          useValue: { generatePDF: jest.fn() },
        },
        {
          provide: ExecutionService,
          useValue: { dispatch: jest.fn() },
        },
        {
          provide: ContentEngineService,
          useValue: {
            generate: jest.fn(),
            generateCalendar: jest.fn(),
          },
        },
        {
          provide: RayzenConfigService,
          useValue: { getConfig: jest.fn().mockReturnValue(null) },
        },
        {
          provide: ValidationService,
          useValue: {
            assertValidPrompt: jest.fn(),
            validateClassification: jest.fn().mockReturnValue({ valid: true, issues: [], score: 1 }),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventService, useValue: { emit: jest.fn() } },
      ],
    }).compile()

    service = module.get<OrchestratorService>(OrchestratorService)
    memoryService = module.get(MemoryService)
    executionService = module.get(ExecutionService)
    contentEngineService = module.get(ContentEngineService)
    validationService = module.get(ValidationService)
  })

  describe('classify', () => {
    it('retorna classificação do LLM corretamente', async () => {
      mockLLM.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '{"module":"brain","action":"search","confidence":0.9}' } }],
        usage: { total_tokens: 50 },
      })

      const result = await service.classify('O que você sabe sobre mim?')

      expect(result.module).toBe('brain')
      expect(result.action).toBe('search')
      expect(result.confidence).toBe(0.9)
    })

    it('usa response_format json_object e temperature 0', async () => {
      mockLLM.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '{"module":"system","action":"chat","confidence":0.8}' } }],
        usage: { total_tokens: 30 },
      })

      await service.classify('olá')

      expect(mockLLM.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
      )
    })
  })

  describe('handleMessage — routing', () => {
    it('delega para MemoryService quando módulo é brain', async () => {
      mockLLM.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '{"module":"brain","action":"search","confidence":0.9}' } }],
        usage: { total_tokens: 50 },
      })

      ;(memoryService.searchAndSynthesize as jest.Mock).mockResolvedValue({
        answer: 'Você é Marcelo Rayzen, QA Engineer.',
        sources: [],
        tokensUsed: 100,
      })

      const result = await service.handleMessage('Quem sou eu?', 'sess-1')

      expect(memoryService.searchAndSynthesize).toHaveBeenCalledWith('Quem sou eu?', 'sess-1')
      expect(result.module).toBe('brain')
      expect(result.reply).toBe('Você é Marcelo Rayzen, QA Engineer.')
    })

    it('delega para ExecutionService quando módulo é jarvis', async () => {
      mockLLM.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"module":"jarvis","action":"open_app","confidence":0.95}' } }],
          usage: { total_tokens: 40 },
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Chrome aberto com sucesso.' } }],
          usage: { total_tokens: 60 },
        })

      ;(executionService.dispatch as jest.Mock).mockResolvedValue({ ok: true })

      const result = await service.handleMessage('abre o chrome', 'sess-2')

      expect(executionService.dispatch).toHaveBeenCalledWith('open_app', expect.any(Object))
      expect(result.module).toBe('jarvis')
    })

    it('valida o prompt antes de processar', async () => {
      mockLLM.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"module":"system","action":"chat","confidence":0.8}' } }],
          usage: { total_tokens: 30 },
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Olá!' } }],
          usage: { total_tokens: 20 },
        })

      mockPrisma.conversationMessage.findMany.mockResolvedValue([])

      await service.handleMessage('olá', 'sess-3')

      expect(validationService.assertValidPrompt).toHaveBeenCalledWith('olá')
    })
  })
})
