import { Module } from '@nestjs/common'
import { OrchestratorController } from './orchestrator.controller'
import { OrchestratorService } from './orchestrator.service'
import { BrainModule } from '../brain/brain.module'
import { DocModule } from '../doc/doc.module'
import { JarvisModule } from '../jarvis/jarvis.module'
import { ContentModule } from '../content/content.module'
import { ConfigPanelModule } from '../config-panel/config-panel.module'

@Module({
  imports: [BrainModule, DocModule, JarvisModule, ContentModule, ConfigPanelModule],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
