import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { AgentBridgeController } from './agent-bridge.controller'
import { AgentBridgeService } from './agent-bridge.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'agent-tasks' })],
  controllers: [AgentBridgeController],
  providers: [AgentBridgeService],
  exports: [AgentBridgeService],
})
export class AgentBridgeModule {}
