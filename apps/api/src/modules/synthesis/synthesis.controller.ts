import { Controller, Post, Get, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { SynthesisService } from './synthesis.service'

@ApiTags('synthesis')
@Controller('synthesis')
export class SynthesisController {
  constructor(private readonly svc: SynthesisService) {}

  @Post('session')
  @ApiOperation({ summary: 'Sintetizar sessão: extrai decisions, next_steps, learnings via LLM' })
  synthesize(@Body() body: { sessionId: string; projectId?: string; workMode?: string }) {
    return this.svc.synthesizeSession(body.sessionId, body.projectId, body.workMode)
  }

  @Post('checkpoint')
  @ApiOperation({ summary: 'Checkpoint manual: sintetiza atividade desde o último checkpoint ou últimas 2h' })
  checkpoint(@Body() body: { projectId: string; note?: string; workMode?: string }) {
    return this.svc.checkpoint(body.projectId, body.note, body.workMode)
  }

  @Get('artifacts')
  @ApiOperation({ summary: 'Listar artefatos de síntese por projeto ou sessão' })
  list(@Query('project_id') projectId?: string, @Query('session_id') sessionId?: string) {
    return this.svc.getArtifacts(projectId, sessionId)
  }
}
