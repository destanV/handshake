import { CreateModelSchema } from "@handshake/types";
import type { ApiSeedRecord, OnChainSeedRecord, RuntimeConfig, SeedState } from "./types.js";
import { stageHfModels } from "./hf/stage.js";
import { buildCreateModelDto } from "./dto.js";
import { deriveSeedWallets, fundSeedWallets, persistWalletMetadata } from "./wallets.js";
import { requireMnemonic } from "./config.js";
import { SeedApiClient } from "./api/client.js";
import { appendReport, readSeedState, writeSeedState } from "./report.js";
import { registerApiRecordsOnChain } from "./onchain.js";
import { verifySeed } from "./verify.js";

const DRY_RUN_HASH = "0".repeat(64);
const DRY_RUN_CID = "bafybeihandshakeseeddryrunmetadataonly0000000000000000000000";

export async function runHfFetch(config: RuntimeConfig, dryRun: boolean): Promise<void> {
  const staged = await stageHfModels(config, dryRun);
  const totalBytes = staged.reduce(
    (sum, model) => sum + model.selectedFiles.reduce((fileSum, file) => fileSum + file.size, 0),
    0,
  );
  for (const model of staged) {
    console.log(
      `${dryRun ? "would fetch" : "staged"} ${model.fixture.repoId}: ${model.selectedFiles.length} files`,
    );
  }
  console.log(`${dryRun ? "planned" : "staged"} ${staged.length} models, ${totalBytes} bytes`);
}

export async function runFund(config: RuntimeConfig, dryRun: boolean): Promise<void> {
  await fundSeedWallets(config, dryRun);
}

export async function runApi(config: RuntimeConfig, dryRun: boolean): Promise<ApiSeedRecord[]> {
  const mnemonic = requireMnemonic(config);
  const wallets = deriveSeedWallets(mnemonic, config.modelCount);
  await persistWalletMetadata(config, wallets);
  const stagedModels = await stageHfModels(config, dryRun);
  const records = new Map<string, ApiSeedRecord>();
  const output: ApiSeedRecord[] = [];

  for (const [index, staged] of stagedModels.entries()) {
    const wallet = wallets[index];
    if (!wallet) throw new Error(`Missing derived wallet at index ${index}`);

    if (dryRun) {
      const dto = buildCreateModelDto(staged, DRY_RUN_CID, records, DRY_RUN_HASH);
      const parsed = CreateModelSchema.safeParse(dto);
      if (!parsed.success) throw new Error(`Dry-run DTO failed validation for ${staged.fixture.repoId}`);
      console.log(
        `would create API model ${staged.fixture.repoId} as wallet[${index}] ${wallet.account.address}`,
      );
      continue;
    }

    if (!staged.bundlePath || !staged.manifest) {
      throw new Error(`HF staging did not produce a bundle and manifest for ${staged.fixture.repoId}`);
    }

    const api = new SeedApiClient(config, wallet.account);
    await api.login();
    const duplicate = await api.checkDuplicate(staged.manifest.manifestHash);
    let model;
    let modelFileCid: string;
    if (duplicate.exists && duplicate.modelId) {
      model = await api.fetchModel(duplicate.modelId);
      modelFileCid = model.modelFileCid;
      await appendReport(config, "api.duplicate", {
        repoId: staged.fixture.repoId,
        modelId: model._id,
        modelHash: staged.manifest.manifestHash,
      });
      console.log(`reused API model ${staged.fixture.repoId}: ${model._id}`);
    } else {
      modelFileCid = await api.uploadBundle(staged.bundlePath);
      const dto = buildCreateModelDto(staged, modelFileCid, records);
      model = await api.createModel(dto);
      await appendReport(config, "api.create", {
        repoId: staged.fixture.repoId,
        modelId: model._id,
        modelHash: model.modelHash,
        modelFileCid,
        metadataCid: model.metadataCid,
      });
      console.log(`created API model ${staged.fixture.repoId}: ${model._id}`);
    }

    const record: ApiSeedRecord = {
      repoId: staged.fixture.repoId,
      walletIndex: index,
      walletAddress: wallet.account.address,
      modelId: model._id,
      modelHash: model.modelHash,
      modelFileCid,
      metadataCid: model.metadataCid,
      apiModel: model,
    };
    records.set(staged.fixture.repoId, record);
    output.push(record);
  }

  if (!dryRun) {
    await writeSeedState(config, {
      generatedAt: new Date().toISOString(),
      api: output,
    });
  }
  return output;
}

export async function runOnChain(config: RuntimeConfig, dryRun: boolean): Promise<OnChainSeedRecord[]> {
  const mnemonic = requireMnemonic(config);
  const wallets = deriveSeedWallets(mnemonic, config.modelCount);
  const state = await readSeedState(config);
  if (!state.api?.length) {
    throw new Error("seed:onchain requires API records in seed-state.json; run seed:api first");
  }
  const onchain = await registerApiRecordsOnChain(
    config,
    wallets.map((wallet) => wallet.account),
    state.api,
    dryRun,
  );
  if (!dryRun) {
    const nextState: SeedState = {
      generatedAt: new Date().toISOString(),
      api: state.api,
      onchain,
    };
    await writeSeedState(config, nextState);
  }
  return onchain;
}

export async function runVerify(config: RuntimeConfig): Promise<void> {
  const state = await readSeedState(config);
  const records = state.onchain;
  if (!records?.length) {
    throw new Error("seed:verify requires on-chain records in seed-state.json; run seed:onchain first");
  }
  await verifySeed(config, records);
}

export async function runAll(config: RuntimeConfig, dryRun: boolean): Promise<void> {
  if (dryRun) {
    requireMnemonic(config);
    await runApi(config, true);
    console.log(`would fund ${config.modelCount} wallets`);
    console.log(`would send ${config.modelCount} registerModel transactions`);
    await appendReport(config, "all.dry_run", {
      modelCount: config.modelCount,
      plannedRegisterTxs: config.modelCount,
    });
    return;
  }

  await runFund(config, false);
  await runApi(config, false);
  await runOnChain(config, false);
  await runVerify(config);
}
