import { CreateModelSchema, Source } from "@handshake/types";
import type { CreateModelDTO, IParentRef } from "@handshake/types";
import type { ApiSeedRecord, StagedSeedModel } from "./types.js";

function buildParentRefs(
  staged: StagedSeedModel,
  priorRecords: Map<string, ApiSeedRecord>,
): IParentRef[] {
  return (staged.fixture.parents ?? []).map((parent) => {
    if (parent.source === Source.Handshake) {
      const record = priorRecords.get(parent.repoId);
      if (!record) {
        throw new Error(`Handshake parent ${parent.repoId} must be seeded before ${staged.fixture.repoId}`);
      }
      return {
        source: Source.Handshake,
        name: parent.name ?? parent.repoId,
        relationship: parent.relationship,
        handshakeId: record.modelId,
        modelHash: record.modelHash,
      };
    }

    return {
      source: Source.HuggingFace,
      name: parent.name ?? parent.repoId,
      relationship: parent.relationship,
      externalId: parent.repoId,
    };
  });
}

export function buildCreateModelDto(
  staged: StagedSeedModel,
  modelFileCid: string,
  priorRecords: Map<string, ApiSeedRecord>,
  modelHash = staged.manifest?.manifestHash,
): CreateModelDTO {
  if (!modelHash) {
    throw new Error(`Missing manifest hash for ${staged.fixture.repoId}`);
  }
  const dto: CreateModelDTO = {
    name: staged.fixture.name,
    description: staged.fixture.description,
    version: staged.fixture.version,
    task: staged.fixture.task,
    framework: staged.fixture.framework,
    license: staged.license,
    modelHash,
    modelFileCid,
    baseModel: buildParentRefs(staged, priorRecords),
    tags: staged.fixture.tags,
    languages: staged.fixture.languages,
    intendedUse: staged.fixture.intendedUse,
    trainingData: staged.fixture.trainingData,
    evaluation: staged.fixture.evaluation,
    size: staged.selectedFiles.reduce((sum, file) => sum + file.size, 0),
    modelType: staged.fixture.modelType,
    parameters: staged.fixture.parameters,
    contextLength: staged.fixture.contextLength,
    quantization: staged.fixture.quantization,
  };

  const parsed = CreateModelSchema.safeParse(dto);
  if (!parsed.success) {
    throw new Error(
      `Invalid CreateModelDTO for ${staged.fixture.repoId}: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return dto;
}
