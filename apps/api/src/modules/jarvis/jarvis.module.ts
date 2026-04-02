import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { JarvisController } from './jarvis.controller'
import { JarvisService } from './jarvis.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'agent-tasks' })],
  controllers: [JarvisController],
  providers: [JarvisService],
  exports: [JarvisService],
})
export class JarvisModule {}
