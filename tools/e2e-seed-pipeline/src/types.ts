import type { CreateModelDTO, IModel } from "@handshake/types";
import type { Framework, License, Relationship, Source, Task } from "@handshake/types";

export interface SeedParentFixture {
  repoId: string;
  name?: string;
  source: Source;
  relationship: Relationship;
}

export interface HfModelFixture {
  repoId: string;
  revision?: string;
  name: string;
  description: string;
  version: string;
  task: Task;
  framework: Framework;
  expectedLicense: License;
  modelType?: string;
  parameters?: string;
  contextLength?: number;
  quantization?: CreateModelDTO["quantization"];
  tags?: string[];
  languages?: string[];
  intendedUse?: string;
  trainingData?: CreateModelDTO["trainingData"];
  evaluation?: CreateModelDTO["evaluation"];
  parents?: SeedParentFixture[];
  allowedPatterns?: string[];
  ignorePatterns?: string[];
}

export interface HfRepoFile {
  path: string;
  size?: number;
}

export interface HfRepoMetadata {
  repoId: string;
  sha?: string;
  tags: string[];
  license?: string;
  files: HfRepoFile[];
}

export interface SelectedHfFile {
  repoId: string;
  revision: string;
  path: string;
  size: number;
  url: string;
}

export interface ManifestEntry {
  name: string;
  size: number;
  hash: string;
}

export interface ManifestResult {
  manifestHash: string;
  entries: ManifestEntry[];
}

export interface StagedSeedModel {
  fixture: HfModelFixture;
  metadata: HfRepoMetadata;
  license: License;
  selectedFiles: SelectedHfFile[];
  manifest?: ManifestResult;
  stageDir?: string;
  bundlePath?: string;
  bundleSize?: number;
}

export interface ApiSeedRecord {
  repoId: string;
  walletIndex: number;
  walletAddress: string;
  modelId: string;
  modelHash: string;
  modelFileCid: string;
  metadataCid: string;
  apiModel: IModel;
}

export interface OnChainSeedRecord extends ApiSeedRecord {
  txHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  chainId?: number;
  onChainRegistered: boolean;
}

export interface SeedState {
  generatedAt: string;
  api?: ApiSeedRecord[];
  onchain?: OnChainSeedRecord[];
}

export interface RuntimeConfig {
  modelCount: number;
  apiUrl: string;
  clientUrl: string;
  registryAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  hfToken?: string;
  hfMaxBytesPerModel: number;
  concurrency: number;
  outputDir: string;
  mnemonic?: string;
  treasuryPrivateKey?: `0x${string}`;
  minWalletBalanceAvax: string;
  topUpAmountAvax: string;
}
