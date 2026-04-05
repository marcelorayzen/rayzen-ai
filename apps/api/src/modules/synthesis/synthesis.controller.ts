import { Controller, Post, Get, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { SynthesisService } from './synthesis.service'

@ApiTags('synthesis')
@Controller('synthesis')
export class SynthesisController {
  constructor(private readonly svc: SynthesisService) {}

  @Post('session')
  @ApiOperation({ summary: 'Sintetizar sessão: extrai decisions, next_steps, learnings via LLM' })
  synthesize(@Body() body: { sessionId: string; projectId?: string }) {
    return this.svc.synthesizeSession(body.sessionId, body.projectId)
  }

  @Get('artifacts')
  @ApiOperation({ summary: 'Listar artefatos de síntese por projeto ou sessão' })
  list(@Query('project_id') projectId?: string, @Query('session_id') sessionId?: string) {
    return this.svc.getArtifacts(projectId, sessionId)
  }
}
