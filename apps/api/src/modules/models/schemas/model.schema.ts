import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { Document } from "mongoose";
import type { IParentRef, ITrainingData, IEvaluation, IBlockchainRecord } from "@handshake/types";
import { Task, Framework, License, Quantization } from "@handshake/types";
import { ParentRefSubSchema } from "./parent-ref.schema";
import { TrainingDataSubSchema } from "./training-data.schema";
import { EvaluationSubSchema } from "./evaluation.schema";
import { BlockchainRecordSubSchema } from "./blockchain-record.schema";

export type ModelDocument = ModelRecord & Document;

@Schema({ timestamps: true })
export class ModelRecord {
  // Identity
  @Prop({ required: true, index: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: "1.0.0" })
  version: string;

  @Prop({ required: true, enum: Object.values(Task), index: true })
  task: string;

  @Prop({ required: true, enum: Object.values(Framework) })
  framework: string;

  @Prop({ required: true, enum: Object.values(License) })
  license: string;

  @Prop()
  size?: number;

  @Prop()
  modelType?: string;

  @Prop()
  parameters?: string;

  @Prop()
  contextLength?: number;

  @Prop({ enum: Object.values(Quantization) })
  quantization?: string;

  // Provenance (system-filled)
  @Prop({ required: true, index: true })
  ownerAddress: string;

  @Prop({ required: true, unique: true, index: true })
  modelHash: string;

  @Prop({ required: true })
  modelFileCid: string;

  @Prop({ default: "" })
  metadataCid: string;

  // Lineage
  @Prop({ type: [ParentRefSubSchema], default: [] })
  baseModel: IParentRef[];

  @Prop({ type: TrainingDataSubSchema })
  trainingData?: ITrainingData;

  // Optional
  @Prop({ type: [String], default: [], index: true })
  tags: string[];

  @Prop({ type: EvaluationSubSchema })
  evaluation?: IEvaluation;

  @Prop({ type: [String], default: [] })
  languages: string[];

  @Prop()
  intendedUse?: string;

  // On-chain (Phase 3)
  @Prop({ default: false })
  onChainRegistered: boolean;

  @Prop({ type: BlockchainRecordSubSchema })
  blockchain?: IBlockchainRecord;
}

export const ModelSchema = SchemaFactory.createForClass(ModelRecord);

// Unique only among documents that actually carry an on-chain txHash (partial index). Enforces
// idempotency at the DB layer: the same registration tx can never populate two model docs (T6).
ModelSchema.index(
  { "blockchain.txHash": 1 },
  {
    unique: true,
    partialFilterExpression: { "blockchain.txHash": { $type: "string" } },
  },
);
