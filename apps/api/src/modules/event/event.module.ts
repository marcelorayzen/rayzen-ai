import { Module, forwardRef } from '@nestjs/common'
import { EventController } from './event.controller'
import { EventService } from './event.service'
import { SynthesisModule } from '../synthesis/synthesis.module'

@Module({
  imports: [forwardRef(() => SynthesisModule)],
  controllers: [EventController],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}
