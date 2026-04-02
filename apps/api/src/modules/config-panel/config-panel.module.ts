import { Module } from '@nestjs/common'
import { ConfigPanelController } from './config-panel.controller'
import { ConfigPanelService } from './config-panel.service'

@Module({
  controllers: [ConfigPanelController],
  providers: [ConfigPanelService],
  exports: [ConfigPanelService],
})
export class ConfigPanelModule {}
