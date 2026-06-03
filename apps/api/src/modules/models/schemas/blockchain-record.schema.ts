import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

// Mirrors IBlockchainRecord (packages/types). Populated by the user-driven PATCH and reconciled
// by the on-chain listener/cron (on-chain is the source of truth, Decision I/3).
@Schema({ _id: false })
class BlockchainRecordSub {
  @Prop()
  txHash?: string;

  @Prop()
  blockNumber?: number;

  @Prop()
  contractAddress?: string;

  @Prop()
  chainId?: number;

  @Prop()
  registeredAt?: Date;
}

export const BlockchainRecordSubSchema = SchemaFactory.createForClass(BlockchainRecordSub);
