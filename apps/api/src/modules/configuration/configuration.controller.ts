import { Controller, Get, Patch, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { RayzenConfigService, RayzenConfig } from './configuration.service'

@ApiTags('configuration')
@SkipThrottle()
@Controller('configuration')
export class ConfigurationController {
  constructor(private readonly svc: RayzenConfigService) {}

  @Get()
  getConfig() {
    return this.svc.getConfig()
  }

  @Patch()
  updateConfig(@Body() patch: Partial<RayzenConfig>) {
    return this.svc.updateConfig(patch)
  }
}
