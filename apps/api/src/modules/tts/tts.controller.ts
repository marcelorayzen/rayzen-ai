import { Controller, Post, Body, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { TtsService } from './tts.service'
import { IsString } from 'class-validator'
import { FastifyReply } from 'fastify'

class SynthesizeDto {
  @IsString()
  text!: string
}

@SkipThrottle()
@ApiTags('tts')
@Controller('tts')
export class TtsController {
  constructor(private readonly svc: TtsService) {}

  @Post('synthesize')
  async synthesize(@Body() dto: SynthesizeDto, @Res() reply: FastifyReply) {
    const buffer = await this.svc.synthesize(dto.text)
    reply
      .header('Content-Type', 'audio/wav')
      .header('Content-Length', buffer.length)
      .send(buffer)
  }
}
