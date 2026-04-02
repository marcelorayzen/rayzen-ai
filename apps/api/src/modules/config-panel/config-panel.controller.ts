import { Controller, Get, Patch, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { ConfigPanelService, RayzenConfig } from './config-panel.service'

@ApiTags('config')
@SkipThrottle()
@Controller('config')
export class ConfigPanelController {
  constructor(private readonly svc: ConfigPanelService) {}

  @Get()
  getConfig() {
    return this.svc.getConfig()
  }

  @Patch()
  updateConfig(@Body() patch: Partial<RayzenConfig>) {
    return this.svc.updateConfig(patch)
  }
}
