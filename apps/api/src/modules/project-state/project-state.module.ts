import { Module } from '@nestjs/common'
import { ProjectStateController } from './project-state.controller'
import { ProjectStateService } from './project-state.service'

@Module({
  controllers: [ProjectStateController],
  providers: [ProjectStateService],
  exports: [ProjectStateService],
})
export class ProjectStateModule {}
