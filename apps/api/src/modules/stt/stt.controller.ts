import { Controller, Post, Req } from '@nestjs/common'
import { ApiTags, ApiConsumes } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { SttService } from './stt.service'

@SkipThrottle()
@ApiTags('stt')
@Controller('stt')
export class SttController {
  constructor(private readonly svc: SttService) {}

  @Post('transcribe')
  @ApiConsumes('multipart/form-data')
  async transcribe(@Req() req: any) {
    const data = await req.file()
    if (!data) throw new Error('Nenhum arquivo enviado')

    const buffer = await data.toBuffer()
    const mimeType = data.mimetype

    const text = await this.svc.transcribe(buffer, mimeType)
    return { text }
  }
}
