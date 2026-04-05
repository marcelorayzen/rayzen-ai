import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { ExecutionController } from './execution.controller'
import { ExecutionService } from './execution.service'
import { EventModule } from '../event/event.module'

@Module({
  imports: [BullModule.registerQueue({ name: 'agent-tasks' }), EventModule],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
