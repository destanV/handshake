import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { ProviderService } from "./provider.service";
import { BlockchainCursor } from "./schemas/blockchain-cursor.schema";
import type { BlockchainCursorDocument } from "./schemas/blockchain-cursor.schema";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly provider: ProviderService,
    @InjectModel(BlockchainCursor.name)
    private readonly cursorModel: Model<BlockchainCursorDocument>,
  ) {}

  @Get("blockchain")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Blockchain sync health (cursor, WS state, contract)" })
  @ApiResponse({ status: 200, description: "Live sync status" })
  async blockchain() {
    const address = this.provider.registryAddress ?? null;
    const cursor = address
      ? await this.cursorModel
          .findOne({ contractAddress: address })
          .lean<{ lastSeenBlock: number; updatedAt: Date }>()
          .exec()
      : null;

    const ageSeconds = cursor?.updatedAt
      ? Math.round((Date.now() - new Date(cursor.updatedAt).getTime()) / 1000)
      : null;

    return {
      configured: this.provider.hasRegistry(),
      chainId: this.provider.chainId,
      contractAddress: address,
      wsConnected: this.provider.isWsConnected(),
      lastSeenBlock: cursor?.lastSeenBlock ?? null,
      lastSeenBlockAgeSeconds: ageSeconds,
    };
  }
}
