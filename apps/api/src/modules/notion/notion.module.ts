import { Module } from '@nestjs/common'
import { NotionService } from './notion.service'
import { NotionController } from './notion.controller'

@Module({
  providers: [NotionService],
  controllers: [NotionController],
  exports: [NotionService],
})
export class NotionModule {}
