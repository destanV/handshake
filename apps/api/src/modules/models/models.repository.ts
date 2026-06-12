import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { ModelDocument } from "./schemas";
import { ModelRecord } from "./schemas";
import type { IModel, IBlockchainRecord } from "@handshake/types";

@Injectable()
export class ModelsRepository {
  constructor(@InjectModel(ModelRecord.name) private readonly modelModel: Model<ModelDocument>) {}

  async findAll(filter: {
    owner?: string;
    task?: string;
  }): Promise<{ models: IModel[]; total: number }> {
    const query: Record<string, string> = {};

    if (filter.owner) query.ownerAddress = filter.owner;

    if (filter.task) query.task = filter.task;

    const [models, total] = await Promise.all([
      this.modelModel.find(query).sort({ createdAt: -1 }).lean<IModel[]>().exec(),
      this.modelModel.countDocuments(query).exec(),
    ]);

    return { models, total };
  }

  async findById(id: string): Promise<IModel | null> {
    return this.modelModel.findById(id).lean<IModel>().exec();
  }

  async existsByHash(hash: string): Promise<{ exists: boolean; modelId?: string }> {
    const doc = await this.modelModel
      .findOne({ modelHash: hash }, { _id: 1 })
      .lean<{ _id: unknown }>()
      .exec();
    return doc ? { exists: true, modelId: String(doc._id) } : { exists: false };
  }

  async create(data: Omit<IModel, "_id" | "createdAt" | "updatedAt">): Promise<IModel> {
    const created = await this.modelModel.create(data);

    return created.toObject() as unknown as IModel;
  }

  async findByHash(hash: string): Promise<IModel | null> {
    return this.modelModel.findOne({ modelHash: hash }).lean<IModel>().exec();
  }

  /** Owner-verified path (PATCH): set the on-chain record by document id. */
  async setBlockchainById(id: string, record: IBlockchainRecord): Promise<IModel | null> {
    return this.modelModel
      .findByIdAndUpdate(
        id,
        { $set: { blockchain: record, onChainRegistered: true } },
        { new: true },
      )
      .lean<IModel>()
      .exec();
  }

  /** Chain-sync path (listener/cron): set the on-chain record by canonical modelHash. */
  async updateBlockchainByHash(
    hashCanonical: string,
    record: IBlockchainRecord,
  ): Promise<IModel | null> {
    return this.modelModel
      .findOneAndUpdate(
        { modelHash: hashCanonical },
        { $set: { blockchain: record, onChainRegistered: true } },
        { new: true },
      )
      .lean<IModel>()
      .exec();
  }
}
