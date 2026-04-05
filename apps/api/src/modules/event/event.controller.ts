import { Controller, Get, Post, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { EventService, CreateEventDto } from './event.service'

@ApiTags('events')
@Controller('events')
export class EventController {
  constructor(private readonly events: EventService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar evento manualmente (ex: CLI hook)' })
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto)
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
