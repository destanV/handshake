import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { Document } from "mongoose";

export type BlockchainCursorDocument = BlockchainCursor & Document & { updatedAt: Date };

// Tracks how far the reconciliation cron has scanned per contract, so a restart resumes from
// lastSeenBlock + 1 (Acceptance #8) rather than rescanning history.
@Schema({ timestamps: true, collection: "blockchain_cursors" })
export class BlockchainCursor {
  @Prop({ required: true, unique: true, index: true })
  contractAddress: string;

  @Prop({ required: true, default: 0 })
  lastSeenBlock: number;
}

export const BlockchainCursorSchema = SchemaFactory.createForClass(BlockchainCursor);
