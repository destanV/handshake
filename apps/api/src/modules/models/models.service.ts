import { Injectable, Logger } from "@nestjs/common";
import { ModelsRepository } from "./models.repository";
import { IpfsService } from "../ipfs/ipfs.service";
import { DomainException, DomainErrorCodes } from "@api/common/exceptions/domain.exception";
import type { IModel, CreateModelDTO, IBlockchainRecord } from "@handshake/types";
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
      return model;
    }

    const updated = await this.repo.setBlockchainById(id, {
      ...record,
      registeredAt: record.registeredAt ?? new Date(),
    });
    if (!updated) throw new DomainException(DomainErrorCodes.MODEL_NOT_FOUND);

    this.logger.log(`Blockchain record set: id=${id} tx=${record.txHash} owner=${callerAddress}`);
    return updated;
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

  // prototype
  calculateProvenanceScore(model: IModel): number {
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
