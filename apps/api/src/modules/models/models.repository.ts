import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { ModelDocument } from "./schemas";
import { ModelRecord } from "./schemas";
import type { IModel } from "@handshake/types";

@Injectable()
export class ModelsRepository {
  constructor(@InjectModel(ModelRecord.name) private readonly modelModel: Model<ModelDocument>) {}

  async findAll(filter: {
    owner?: string;
    task?: string;
    framework?: string;
  }): Promise<{ models: IModel[]; total: number }> {
    const query: Record<string, string> = {};

    if (filter.owner) query.ownerAddress = filter.owner;

    if (filter.task) query.task = filter.task;

    if (filter.framework) query.framework = filter.framework;

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
}
