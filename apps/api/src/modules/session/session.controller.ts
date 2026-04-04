import { Controller, Get, Delete, Param } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SessionService } from './session.service'

@ApiTags('session')
@Controller('sessions')
export class SessionController {
  constructor(private readonly svc: SessionService) {}

  @Get('tokens')
  getTokenStats() {
    return this.svc.getTokenStats()
  }

  @Get()
  getSessions() {
    return this.svc.getRecentSessions()
  }

  @Get(':sessionId/messages')
  getSessionMessages(@Param('sessionId') sessionId: string) {
    return this.svc.getSessionMessages(sessionId)
  }

  @Delete(':sessionId')
  deleteSession(@Param('sessionId') sessionId: string) {
    return this.svc.deleteSession(sessionId)
  }
}
