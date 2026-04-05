import { Controller, Post, Get, Patch, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { DocumentationService, DocType } from './documentation.service'

@ApiTags('documentation')
@Controller('documentation')
export class DocumentationController {
  constructor(private readonly svc: DocumentationService) {}

  @Post('generate/:projectId')
  @ApiOperation({ summary: 'Gera ou atualiza todos os 4 documentos do projeto' })
  generateAll(@Param('projectId') projectId: string) {
    return this.svc.generateAll(projectId)
  }

  @Post('generate/:projectId/:type')
  @ApiOperation({ summary: 'Gera um tipo específico: project_state | decisions_log | next_actions | work_journal' })
  generateOne(@Param('projectId') projectId: string, @Param('type') type: DocType) {
    return this.svc.generate(projectId, type)
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Lista documentos gerados do projeto' })
  list(@Param('projectId') projectId: string) {
    return this.svc.list(projectId)
  }

  @Patch(':projectId/:type/reviewed')
  @ApiOperation({ summary: 'Marca documento como revisado manualmente — protege de sobrescrita' })
  markReviewed(@Param('projectId') projectId: string, @Param('type') type: DocType) {
    return this.svc.markReviewed(projectId, type as DocType)
  }
}
