import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { ModelsModule } from "../models/models.module";
import { ProviderService } from "./provider.service";
import { RegistryListenerService } from "./registry-listener.service";
import { ReconciliationCron } from "./reconciliation.cron";
import { LineageService } from "./lineage.service";
import { HealthController } from "./health.controller";
import { BlockchainCursor, BlockchainCursorSchema } from "./schemas/blockchain-cursor.schema";

// Wires the on-chain sync: provider (WS+HTTP) -> live listener + 60s reconciliation cron -> Mongo,
// plus off-chain lineage reconstruction and a health endpoint. Imports ModelsModule for
// ModelsService.syncFromChain. The plain registry (T1-T8) and commit-reveal (T9) both emit
// ModelRegistered, so no listener change is needed for the hardened path.
@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: BlockchainCursor.name, schema: BlockchainCursorSchema },
    ]),
    ModelsModule,
  ],
  controllers: [HealthController],
  providers: [ProviderService, RegistryListenerService, ReconciliationCron, LineageService],
  exports: [ProviderService, LineageService, ReconciliationCron],
})
export class BlockchainModule {}
