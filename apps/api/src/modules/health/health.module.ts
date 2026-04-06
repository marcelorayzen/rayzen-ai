import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthScoreService } from './health.service'

@Module({
  controllers: [HealthController],
  providers: [HealthScoreService],
  exports: [HealthScoreService],
})
export class HealthModule {}
