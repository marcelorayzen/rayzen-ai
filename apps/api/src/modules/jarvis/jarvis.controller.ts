import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JarvisService } from './jarvis.service'
import { IsString, IsOptional } from 'class-validator'

class JarvisDispatchDto {
  @IsString()
  action!: string

  @IsOptional()
  payload?: Record<string, unknown>
}

@ApiTags('jarvis')
@Controller('jarvis')
export class JarvisController {
  constructor(private readonly svc: JarvisService) {}

  @Post('dispatch')
  dispatch(@Body() dto: JarvisDispatchDto) {
    return this.svc.dispatch(dto.action, dto.payload ?? {})
  }
}
