import { z } from "zod";
import { Framework, License, Quantization, Relationship, ParentSource, Task } from "../enums";

const ParentRefSchema = z.object({
  source: z.nativeEnum(ParentSource),
  name: z.string().min(1),
  relationship: z.nativeEnum(Relationship),
  handshakeId: z.string().optional(),
  externalId: z.string().optional(),
  modelHash: z.string().optional(),
});

const DatasetSchema = z.object({
  name: z.string().min(1),
  sourceId: z.string().optional(),
  license: z.string().optional(),
});

const TrainingDataSchema = z.object({
  summary: z.string().optional(),
  datasets: z.array(DatasetSchema).optional(),
  privacyMeasures: z.string().optional(),
});

const BenchmarkSchema = z.object({
  name: z.string().min(1),
  score: z.number(),
  metric: z.string().optional(),
  date: z.string().optional(),
});

const EvaluationSchema = z.object({
  benchmarks: z.array(BenchmarkSchema).optional(),
  limitations: z.string().optional(),
});

export const CreateModelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  version: z.string().default("1.0.0"),
  task: z.nativeEnum(Task),
  framework: z.nativeEnum(Framework),
  license: z.nativeEnum(License),
  modelHash: z.string().min(1, "Model hash is required"),
  modelFileCid: z.string().min(1, "File CID is required"),
  baseModel: z.array(ParentRefSchema).optional(),
  trainingData: TrainingDataSchema.optional(),
  tags: z.array(z.string()).optional(),
  evaluation: EvaluationSchema.optional(),
  languages: z.array(z.string()).optional(),
  intendedUse: z.string().optional(),
  size: z.number().positive().optional(),
  modelType: z.string().optional(),
  parameters: z.string().optional(),
  contextLength: z.number().positive().optional(),
  quantization: z.nativeEnum(Quantization).optional(),
});

export const CompleteExternalRegistrationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  version: z.string().default("1.0.0"),
  task: z.nativeEnum(Task),
  framework: z.nativeEnum(Framework),
  license: z.nativeEnum(License),
  baseModel: z.array(ParentRefSchema).optional(),
  trainingData: TrainingDataSchema.optional(),
  tags: z.array(z.string()).optional(),
  evaluation: EvaluationSchema.optional(),
  languages: z.array(z.string()).optional(),
  intendedUse: z.string().optional(),
  size: z.number().positive().optional(),
  modelType: z.string().optional(),
  parameters: z.string().optional(),
  contextLength: z.number().positive().optional(),
  quantization: z.nativeEnum(Quantization).optional(),
});

export const QueryModelParamsSchema = z.object({
  task: z.nativeEnum(Task).optional(),
  framework: z.nativeEnum(Framework).optional(),
  owner: z.string().optional(),
  page: z.coerce.number().positive().optional(),
  limit: z.coerce.number().positive().max(100).optional(),
});
