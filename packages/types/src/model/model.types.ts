import { BadgeLevel, Framework, License, Quantization, Relationship, Source, Task } from "../enums";

export interface IBlockchainRecord {
  txHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  chainId?: number;
  registeredAt?: Date;
}

export interface IBenchmark {
  name: string;
  score?: number;
  metric?: string;
  date?: string;
}

export interface IEvaluation {
  benchmarks?: IBenchmark[];
  limitations?: string;
}

export interface IDataset {
  name: string;
  sourceId?: string;
  license?: string;
}

export interface ITrainingData {
  summary?: string;
  datasets?: IDataset[];
  privacyMeasures?: string;
}

export interface IParentRef {
  name: string;
  source: Source;
  relationship: Relationship;
  handshakeId?: string;
  modelHash?: string;
  externalId?: string; // HF repo ID or URL
}

export interface IProvenanceCheck {
  id: string;
  label: string;
  tier: BadgeLevel;
  met: boolean;
}

export interface IModel {
  _id: string;

  // Identity
  name: string;
  description?: string;
  version: string; // '1.0.0', '1.0.1', etc.
  task: Task; // 'text-generation', 'image-classification', etc.
  framework: Framework; // 'tensorflow', 'pytorch', 'jax', etc.
  license: License; // 'apache-2.0', 'mit', 'custom'
  size?: number;

  modelType?: string; // 'Llama-3', 'Mistral', 'ViT-L'
  parameters?: string; // '7B', '13B', '70B'
  contextLength?: number; // 4096, 8192, 128000
  quantization?: Quantization; //'int8', 'float32', ?'int4', 'gptq', 'awq'

  // Provenance
  ownerAddress: string;
  modelFileCid: string;
  metadataCid: string;
  modelHash: string;

  // Lineage (user, must)
  baseModel?: IParentRef[]; // if null then base model
  trainingData?: ITrainingData; // optional but recommended

  // Optional
  tags?: string[];
  evaluation?: IEvaluation;
  languages?: string[]; // ['tr', 'en']
  intendedUse?: string; // EU AI Act Annex IV

  // On-chain record (system, auto-filled)
  blockchain?: IBlockchainRecord;
  onChainRegistered: boolean;

  // Computed provenance summary (API-filled, not persisted)
  provenanceScore?: number;
  badgeLevel?: BadgeLevel | null;
  provenanceChecks?: IProvenanceCheck[];

  // stats (system, auto-filled), (e.g likes, downloads, etc)

  //timestamps
  createdAt: Date;
  updatedAt: Date;
}
