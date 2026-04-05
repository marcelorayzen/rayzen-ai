import { Module } from '@nestjs/common'
import { MemoryController } from './memory.controller'
import { MemoryService } from './memory.service'
import { EventModule } from '../event/event.module'

@Module({
  imports: [EventModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
