import { Framework, License, Quantization, Task } from "../enums";
import { IEvaluation, IModel, IParentRef, ITrainingData } from "./model.types";

export interface QueryModelParamsDTO {
  task: Task;
  framework: Framework;
  //
}

export interface CreateModelDTO {
  name: string;
  description: string;
  version: string;
  task: Task;
  framework: Framework;
  license: License;
  modelHash: string;
  modelFileCid: string;
  baseModel?: IParentRef[];
  trainingData?: ITrainingData;
  tags?: string[];
  evaluation?: IEvaluation;
  languages?: string[];
  intendedUse?: string;
  size?: number;
  modelType?: string;
  parameters?: string;
  contextLength?: number;
  quantization?: Quantization;
}

export interface CheckDuplicateResponse {
  exists: boolean;
  modelId?: string;
  status?: 'active' | 'external_pending';
  isOwner?: boolean;
}

export interface CompleteExternalRegistrationDTO {
  name: string;
  description: string;
  version: string;
  task: Task;
  framework: Framework;
  license: License;
  baseModel?: IParentRef[];
  trainingData?: ITrainingData;
  tags?: string[];
  evaluation?: IEvaluation;
  languages?: string[];
  intendedUse?: string;
  size?: number;
  modelType?: string;
  parameters?: string;
  contextLength?: number;
  quantization?: Quantization;
}

export interface ModelListResponse {
  models: IModel[];
  total: number;
}
