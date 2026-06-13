import { Injectable, Logger } from "@nestjs/common";
import { ModelsRepository } from "./models.repository";
import { IpfsService } from "../ipfs/ipfs.service";
import { DomainException, DomainErrorCodes } from "@api/common/exceptions/domain.exception";
import { BadgeLevel, Source } from "@handshake/types";
import type { IModel, CreateModelDTO, IBlockchainRecord, IProvenanceCheck } from "@handshake/types";
import type { ListModelsQueryDto } from "./requests/list-models-query-dto";

@Injectable()
export class ModelsService {
  private readonly logger = new Logger(ModelsService.name);

  constructor(
    private readonly repo: ModelsRepository,
    private readonly ipfsService: IpfsService,
  ) {}

  async checkDuplicate(hash: string) {
    const result = await this.repo.existsByHash(hash);
    if (result.exists) {
      this.logger.debug(`Duplicate check hit: hash=${hash.slice(0, 16)}...`);
    }
    return result;
  }

  async listModels(filter: ListModelsQueryDto) {
    const result = await this.repo.findAll(filter);
    const models = await Promise.all(result.models.map((model) => this.withProvenanceSummary(model)));
    this.logger.debug(`Listed models: count=${models.length} filter=${JSON.stringify(filter)}`);
    return { ...result, models };
  }

  async getModel(id: string): Promise<IModel> {
    const model = await this.repo.findById(id);

    if (!model) {
      this.logger.warn(`Model not found: id=${id}`);
      throw new DomainException(DomainErrorCodes.MODEL_NOT_FOUND);
    }

    return this.withProvenanceSummary(model);
  }

  async createModel(dto: CreateModelDTO, ownerAddress: string): Promise<IModel> {
    const { exists } = await this.repo.existsByHash(dto.modelHash);

    if (exists) {
      this.logger.warn(`Duplicate model upload rejected: hash=${dto.modelHash.slice(0, 16)}... owner=${ownerAddress}`);
      throw new DomainException(DomainErrorCodes.MODEL_DUPLICATE);
    }

    const metadataCid = await this.ipfsService.uploadMetadata(
      { ...dto, ownerAddress, createdAt: new Date().toISOString() },
      ownerAddress,
    );

    const model = await this.repo.create({
      ...dto,
      ownerAddress,
      metadataCid,
      baseModel: dto.baseModel ?? [],
      tags: dto.tags ?? [],
      languages: dto.languages ?? [],
      onChainRegistered: false,
    });

    this.logger.log(`Model created: name="${dto.name}" owner=${ownerAddress} hash=${dto.modelHash.slice(0, 16)}...`);
    return this.withProvenanceSummary(model);
  }

  // PATCH /models/:id/blockchain — owner-only, idempotent. Records the user's confirmed tx.
  async updateBlockchainRecord(
    id: string,
    record: IBlockchainRecord,
    callerAddress: string,
  ): Promise<IModel> {
    const model = await this.repo.findById(id);
    if (!model) {
      this.logger.warn(`Blockchain PATCH for missing model: id=${id}`);
      throw new DomainException(DomainErrorCodes.MODEL_NOT_FOUND);
    }

    if (model.ownerAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      this.logger.warn(`Blockchain PATCH denied: caller=${callerAddress} owner=${model.ownerAddress} id=${id}`);
      throw new DomainException(DomainErrorCodes.FORBIDDEN);
    }

    // Idempotent: the same tx already recorded -> no-op.
    if (model.onChainRegistered && model.blockchain?.txHash === record.txHash) {
      return this.withProvenanceSummary(model);
    }

    const updated = await this.repo.setBlockchainById(id, {
      ...record,
      registeredAt: record.registeredAt ?? new Date(),
    });
    if (!updated) throw new DomainException(DomainErrorCodes.MODEL_NOT_FOUND);

    this.logger.log(`Blockchain record set: id=${id} tx=${record.txHash} owner=${callerAddress}`);
    return this.withProvenanceSummary(updated);
  }

  // Called by the on-chain listener/cron. On-chain is truth (Decision 3): no owner check, idempotent.
  async syncFromChain(
    modelHashCanonical: string,
    record: IBlockchainRecord,
  ): Promise<{ found: boolean; updated: boolean }> {
    const model = await this.repo.findByHash(modelHashCanonical);
    if (!model) {
      this.logger.debug(`On-chain event for unknown model: hash=${modelHashCanonical.slice(0, 16)}… — skipped`);
      return { found: false, updated: false };
    }
    if (model.onChainRegistered && model.blockchain?.txHash === record.txHash) {
      return { found: true, updated: false }; // idempotent replay
    }
    await this.repo.updateBlockchainByHash(modelHashCanonical, record);
    this.logger.log(`Synced on-chain registration: hash=${modelHashCanonical.slice(0, 16)}… tx=${record.txHash}`);
    return { found: true, updated: true };
  }

  private hasText(value: unknown): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  private hasArrayItems(value: unknown[] | undefined): boolean {
    return Array.isArray(value) && value.length > 0;
  }

  private async hasOnChainHandshakeParent(model: IModel): Promise<boolean> {
    const parents = model.baseModel ?? [];
    for (const parent of parents) {
      if (parent.source !== Source.Handshake || !parent.handshakeId) continue;
      try {
        const parentModel = await this.repo.findById(parent.handshakeId);
        if (parentModel?.onChainRegistered) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async withProvenanceSummary(model: IModel): Promise<IModel> {
    const hasLineage = this.hasArrayItems(model.baseModel);
    const hasDataset = this.hasArrayItems(model.trainingData?.datasets);
    const hasDescription = (model.description?.trim().length ?? 0) > 50;
    const hasBenchmarks = this.hasArrayItems(model.evaluation?.benchmarks);
    const hasIntendedUse = this.hasText(model.intendedUse);
    const hasLanguages = this.hasArrayItems(model.languages);
    const hasTrainingData =
      this.hasText(model.trainingData?.summary) ||
      this.hasArrayItems(model.trainingData?.datasets) ||
      this.hasText(model.trainingData?.privacyMeasures);
    const hasEvaluation =
      this.hasArrayItems(model.evaluation?.benchmarks) || this.hasText(model.evaluation?.limitations);
    const hasCompleteMetadata =
      this.hasText(model.modelType) &&
      this.hasText(model.parameters) &&
      typeof model.contextLength === "number" &&
      model.contextLength > 0 &&
      this.hasText(model.quantization) &&
      this.hasArrayItems(model.tags) &&
      hasTrainingData &&
      hasEvaluation &&
      hasLanguages &&
      hasIntendedUse;
    const hasOnChainParent = await this.hasOnChainHandshakeParent(model);

    const bronzeChecks: IProvenanceCheck[] = [
      { id: "on-chain", label: "On-chain registration", tier: BadgeLevel.Bronze, met: model.onChainRegistered },
      { id: "model-hash", label: "Model hash", tier: BadgeLevel.Bronze, met: this.hasText(model.modelHash) },
      { id: "license", label: "License", tier: BadgeLevel.Bronze, met: this.hasText(model.license) },
    ];
    const silverChecks: IProvenanceCheck[] = [
      { id: "lineage", label: "Lineage declared", tier: BadgeLevel.Silver, met: hasLineage },
      { id: "dataset", label: "Dataset declared", tier: BadgeLevel.Silver, met: hasDataset },
      { id: "description", label: "Detailed description", tier: BadgeLevel.Silver, met: hasDescription },
    ];
    const goldChecks: IProvenanceCheck[] = [
      { id: "benchmarks", label: "Benchmark results", tier: BadgeLevel.Gold, met: hasBenchmarks },
      { id: "intended-use", label: "Intended use", tier: BadgeLevel.Gold, met: hasIntendedUse },
      { id: "languages", label: "Languages declared", tier: BadgeLevel.Gold, met: hasLanguages },
    ];
    const platinumChecks: IProvenanceCheck[] = [
      { id: "on-chain-parent", label: "On-chain Handshake parent", tier: BadgeLevel.Platinum, met: hasOnChainParent },
      { id: "complete-metadata", label: "Complete metadata", tier: BadgeLevel.Platinum, met: hasCompleteMetadata },
    ];

    const bronzeMet = bronzeChecks.every((check) => check.met);
    const silverMet = bronzeMet && silverChecks.every((check) => check.met);
    const goldMet = silverMet && goldChecks.every((check) => check.met);
    const platinumMet = goldMet && platinumChecks.every((check) => check.met);

    let score = 0;
    let badgeLevel: BadgeLevel | null = null;

    if (bronzeMet) {
      score += 40;
      badgeLevel = BadgeLevel.Bronze;
    }
    if (silverMet) {
      score += 20;
      badgeLevel = BadgeLevel.Silver;
    }
    if (goldMet) {
      score += 20;
      badgeLevel = BadgeLevel.Gold;
    }
    if (platinumMet) {
      score += 20;
      badgeLevel = BadgeLevel.Platinum;
    }

    return {
      ...model,
      provenanceScore: score,
      badgeLevel,
      provenanceChecks: [...bronzeChecks, ...silverChecks, ...goldChecks, ...platinumChecks],
    };
  }
}
