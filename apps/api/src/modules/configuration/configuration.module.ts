import { Module } from '@nestjs/common'
import { ConfigurationController } from './configuration.controller'
import { RayzenConfigService } from './configuration.service'

@Module({
  controllers: [ConfigurationController],
  providers: [RayzenConfigService],
  exports: [RayzenConfigService],
})
export class ConfigurationModule {}
