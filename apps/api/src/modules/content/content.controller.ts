import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ContentService, ContentType, ContentTone } from './content.service'
import { IsString, IsOptional, IsIn, IsNumber, Min, Max } from 'class-validator'
import { randomUUID } from 'crypto'

class GenerateContentDto {
  @IsIn(['post', 'thread', 'article'])
  type!: ContentType

  @IsString()
  topic!: string

  @IsOptional()
  @IsIn(['professional', 'casual', 'educational', 'persuasive', 'creative'])
  tone?: ContentTone

  @IsOptional()
  @IsString()
  context?: string

  @IsOptional()
  @IsString()
  sessionId?: string
}

class GenerateCalendarDto {
  @IsString()
  topic!: string

  @IsOptional()
  @IsNumber()
  @Min(7)
  @Max(30)
  days?: number

  @IsOptional()
  @IsString()
  sessionId?: string
}

@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(private readonly svc: ContentService) {}

  @Post('generate')
  generate(@Body() dto: GenerateContentDto) {
    return this.svc.generate(
      dto.type,
      dto.topic,
      dto.tone ?? 'professional',
      dto.sessionId ?? randomUUID(),
      dto.context,
    )
  }

  @Post('calendar')
  calendar(@Body() dto: GenerateCalendarDto) {
    return this.svc.generateCalendar(
      dto.topic,
      dto.days ?? 7,
      dto.sessionId ?? randomUUID(),
    )
  }
}
