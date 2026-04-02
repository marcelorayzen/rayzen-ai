import { Controller, Post, Get, Delete, Body, Param, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { BrainService } from './brain.service'
import { IsString, IsOptional } from 'class-validator'
import type { MultipartFile } from '@fastify/multipart'

class IndexDto {
  @IsString()
  content!: string

  @IsOptional()
  @IsString()
  sourcePath?: string

  @IsOptional()
  metadata?: Record<string, unknown>
}

class SearchDto {
  @IsString()
  query!: string

  @IsOptional()
  @IsString()
  sessionId?: string
}

class GithubDto {
  @IsString()
  username!: string

  @IsOptional()
  @IsString()
  token?: string
}

class UrlDto {
  @IsString()
  url!: string
}

@ApiTags('brain')
@Controller('brain')
export class BrainController {
  constructor(private readonly svc: BrainService) {}

  @Post('index')
  index(@Body() dto: IndexDto) {
    return this.svc.indexDocument(dto.content, dto.sourcePath, dto.metadata)
  }

  @Post('search')
  search(@Body() dto: SearchDto) {
    const sessionId = dto.sessionId ?? crypto.randomUUID()
    return this.svc.searchAndSynthesize(dto.query, sessionId)
  }

  @Get('documents')
  list() {
    return this.svc.listDocuments()
  }

  @Delete('documents/:id')
  deleteDocument(@Param('id') id: string) {
    return this.svc.deleteDocument(id)
  }

  @SkipThrottle()
  @Post('index/github')
  indexGithub(@Body() dto: GithubDto) {
    return this.svc.indexGithub(dto.username, dto.token)
  }

  @SkipThrottle()
  @Post('index/url')
  indexUrl(@Body() dto: UrlDto) {
    return this.svc.indexUrl(dto.url)
  }

  @SkipThrottle()
  @Post('index/file')
  async indexFile(@Req() req: { file: () => Promise<MultipartFile | undefined> }) {
    const data = await req.file()
    if (!data) throw new Error('Nenhum arquivo enviado')

    const buffer = await data.toBuffer()
    const filename = data.filename
    const sourcePath = (data.fields['sourcePath'] as { value: string } | undefined)?.value

    return this.svc.indexFile(buffer, filename, sourcePath)
  }
}
