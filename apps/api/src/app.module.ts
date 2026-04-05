import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bull'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { AuthModule } from './modules/auth/auth.module'
import { ConfigurationModule } from './modules/configuration/configuration.module'
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module'
import { AgentBridgeModule } from './modules/agent-bridge/agent-bridge.module'
import { MemoryModule } from './modules/memory/memory.module'
import { DocumentProcessingModule } from './modules/document-processing/document-processing.module'
import { ExecutionModule } from './modules/execution/execution.module'
import { ContentEngineModule } from './modules/content-engine/content-engine.module'
import { SessionModule } from './modules/session/session.module'
import { VoiceModule } from './modules/voice/voice.module'
import { ValidationModule } from './modules/validation/validation.module'
import { ProjectModule } from './modules/project/project.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({ redis: process.env.REDIS_URL }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    ConfigurationModule,
    OrchestratorModule,
    AgentBridgeModule,
    MemoryModule,
    DocumentProcessingModule,
    ExecutionModule,
    ContentEngineModule,
    SessionModule,
    VoiceModule,
    ValidationModule,
    ProjectModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
