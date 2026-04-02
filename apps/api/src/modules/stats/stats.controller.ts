import { Controller, Get, Delete, Param } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { StatsService } from './stats.service'

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get('tokens')
  getTokenStats() {
    return this.svc.getTokenStats()
  }

  @Get('sessions')
  getSessions() {
    return this.svc.getRecentSessions()
  }

  @Get('sessions/:sessionId/messages')
  getSessionMessages(@Param('sessionId') sessionId: string) {
    return this.svc.getSessionMessages(sessionId)
  }

  @Delete('sessions/:sessionId')
  deleteSession(@Param('sessionId') sessionId: string) {
    return this.svc.deleteSession(sessionId)
  }
}
