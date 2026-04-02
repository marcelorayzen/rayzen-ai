import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bull'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { AuthModule } from './modules/auth/auth.module'
import { ConfigPanelModule } from './modules/config-panel/config-panel.module'
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module'
import { AgentBridgeModule } from './modules/agent-bridge/agent-bridge.module'
import { BrainModule } from './modules/brain/brain.module'
import { DocModule } from './modules/doc/doc.module'
import { JarvisModule } from './modules/jarvis/jarvis.module'
import { ContentModule } from './modules/content/content.module'
import { StatsModule } from './modules/stats/stats.module'
import { TtsModule } from './modules/tts/tts.module'
import { SttModule } from './modules/stt/stt.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({ redis: process.env.REDIS_URL }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    ConfigPanelModule,
    OrchestratorModule,
    AgentBridgeModule,
    BrainModule,
    DocModule,
    JarvisModule,
    ContentModule,
    StatsModule,
    TtsModule,
    SttModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
