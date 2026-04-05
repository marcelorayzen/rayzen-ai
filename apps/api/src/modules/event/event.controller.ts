import { Controller, Get, Post, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { EventService, CreateEventDto } from './event.service'

// Payload enviado pelo hook do Claude Code via stdin
interface CliHookPayload {
  hook_event_name?: string   // PostToolUse | Stop | Notification
  tool_name?: string         // Edit | Write | Bash | Read | ...
  tool_input?: Record<string, unknown>
  tool_response?: unknown
  session_id?: string
  transcript?: Array<{ role: string; content: string }>
  projectId?: string         // injetado pelo script do hook via RAYZEN_PROJECT_ID
}

@ApiTags('events')
@Controller('events')
export class EventController {
  constructor(private readonly events: EventService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar evento manualmente' })
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto)
  }

  @Post('cli')
  @ApiOperation({ summary: 'Recebe payload do hook do Claude Code e salva como evento' })
  async fromCli(@Body() payload: CliHookPayload) {
    const projectId = payload.projectId ?? undefined
    const hookEvent = payload.hook_event_name ?? 'PostToolUse'

    // Hook Stop — resume de sessão
    if (hookEvent === 'Stop' && payload.transcript) {
      const messageCount = payload.transcript.length
      const lastMessages = payload.transcript.slice(-6).map(m => `${m.role}: ${String(m.content).slice(0, 120)}`).join('\n')
      return this.events.create({
        projectId,
        source: 'cli',
        type: 'note',
        content: `Sessão encerrada (${messageCount} mensagens)`,
        metadata: { sessionId: payload.session_id, messageCount, lastMessages },
      })
    }

    // Hook PostToolUse — captura por ferramenta
    const tool = payload.tool_name ?? 'unknown'
    const input = payload.tool_input ?? {}

    // Ignorar ferramentas de baixo sinal
    if (['TodoWrite', 'TodoRead', 'ListMcpResourcesTool'].includes(tool)) {
      return { skipped: true }
    }

    let content = ''
    let type: CreateEventDto['type'] = 'execution'

    if (tool === 'Edit' || tool === 'Write') {
      const filePath = (input['file_path'] as string) ?? (input['path'] as string) ?? 'arquivo'
      content = `${tool}: ${filePath}`
      type = 'note'
    } else if (tool === 'Bash') {
      const cmd = String(input['command'] ?? '').slice(0, 200)
      content = `Bash: ${cmd}`
      type = 'execution'
    } else if (tool === 'Read') {
      const filePath = (input['file_path'] as string) ?? 'arquivo'
      content = `Read: ${filePath}`
      type = 'note'
    } else {
      content = `${tool}: ${JSON.stringify(input).slice(0, 150)}`
    }

    return this.events.create({
      projectId,
      source: 'cli',
      type,
      content,
      metadata: { tool, input, sessionId: payload.session_id },
    })
  }

  @Get()
  @ApiOperation({ summary: 'Listar eventos com filtros opcionais' })
  findAll(
    @Query('project_id') projectId?: string,
    @Query('source') source?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.events.findAll({ projectId, source, type, limit: limit ? parseInt(limit) : undefined })
  }
}
