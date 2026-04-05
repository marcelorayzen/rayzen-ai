import { Controller, Get, Post, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ProjectStateService } from './project-state.service'

@ApiTags('project-state')
@Controller('projects')
export class ProjectStateController {
  constructor(private readonly svc: ProjectStateService) {}

  @Get(':id/state')
  @ApiOperation({ summary: 'Obter estado estruturado atual do projeto' })
  get(@Param('id') id: string) {
    return this.svc.get(id)
  }

  @Post(':id/state/refresh')
  @ApiOperation({ summary: 'Regenerar estado do projeto com base nos eventos e sínteses recentes' })
  refresh(@Param('id') id: string) {
    return this.svc.refresh(id)
  }
}
