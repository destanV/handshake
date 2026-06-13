import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from "@nestjs/swagger";

export const UpdateBlockchainDocs = () =>
  applyDecorators(
    ApiCookieAuth(),
    ApiOperation({
      summary: "Record an on-chain registration",
      description:
        "Owner-only. Called by the frontend after the user's registerModel tx confirms. Stores the txHash/blockNumber/contractAddress/chainId on the model and flips onChainRegistered. Idempotent — replaying the same txHash is a no-op. The backend listener/cron reconciles the same data from chain events independently.",
    }),
    ApiParam({ name: "id", description: "MongoDB ObjectId of the model" }),
    ApiBody({
      schema: {
        type: "object",
        required: ["txHash"],
        properties: {
          txHash: { type: "string", example: "0x" + "ab".repeat(32) },
          blockNumber: { type: "number", example: 12345678 },
          contractAddress: { type: "string", example: "0x" + "cd".repeat(20) },
          chainId: { type: "number", example: 43113 },
        },
      },
    }),
    ApiResponse({ status: 200, description: "Blockchain record stored" }),
    ApiResponse({ status: 401, description: "Not authenticated" }),
    ApiResponse({ status: 403, description: "Caller is not the model owner" }),
    ApiResponse({ status: 404, description: "Model not found" }),
  );

export const ListModelsDocs = () =>
  applyDecorators(
    ApiOperation({ summary: "List models", description: "Returns all models with computed provenance badge fields. Optionally filter by owner address, task, or framework." }),
    ApiQuery({ name: "owner", required: false, description: "Filter by wallet address" }),
    ApiQuery({ name: "task", required: false, description: "Filter by task type", enum: ["text-generation", "image-classification", "object-detection", "text-classification", "token-classification", "question-answering", "summarization", "translation", "text-to-image", "image-to-text", "audio-classification", "other"] }),
    ApiQuery({ name: "framework", required: false, description: "Filter by framework", enum: ["pytorch", "tensorflow", "jax", "onnx", "other"] }),
    ApiResponse({ status: 200, description: "List of models" }),
  );

export const CheckDuplicateDocs = () =>
  applyDecorators(
    ApiOperation({
      summary: "Check if a model hash already exists",
      description: "Used in Step 1 of the upload wizard. Pass the blake3 hash of the file to detect duplicates before uploading.",
    }),
    ApiParam({ name: "hash", description: "blake3 hash of the model file", example: "a1b2c3d4e5f67890..." }),
    ApiResponse({ status: 200, schema: { example: { exists: false } } }),
    ApiResponse({ status: 200, description: "Already exists", schema: { example: { exists: true, modelId: "64abc..." } } }),
  );

export const GetModelDocs = () =>
  applyDecorators(
    ApiOperation({ summary: "Get model by ID" }),
    ApiParam({ name: "id", description: "MongoDB ObjectId of the model" }),
    ApiResponse({ status: 200, description: "Model found" }),
    ApiResponse({ status: 404, description: "Model not found" }),
  );

export const CreateModelDocs = () =>
  applyDecorators(
    ApiCookieAuth(),
    ApiOperation({
      summary: "Upload a new model",
      description: "Creates a model record. File must already be uploaded to Pinata (use GET /pinata/signed-url first). ownerAddress is injected from the session — never sent by the client.",
    }),
    ApiBody({
      schema: {
        type: "object",
        required: ["name", "description", "version", "task", "framework", "license", "modelHash", "modelFileCid"],
        properties: {
          name: { type: "string", example: "llama-3-8b-finetune" },
          description: { type: "string", example: "A fine-tuned LLaMA 3 8B on legal documents" },
          version: { type: "string", example: "1.0.0" },
          task: {
            type: "string",
            enum: ["text-generation", "image-classification", "object-detection", "text-classification",
                   "token-classification", "question-answering", "summarization", "translation",
                   "text-to-image", "image-to-text", "audio-classification", "other"],
            example: "text-generation",
          },
          framework: {
            type: "string",
            enum: ["pytorch", "tensorflow", "jax", "onnx", "other"],
            example: "pytorch",
          },
          license: {
            type: "string",
            enum: ["apache-2.0", "mit", "gpl-3.0", "agpl-3.0", "cc-by-4.0", "cc-by-nc-4.0", "llama-3", "gemma", "other"],
            example: "apache-2.0",
          },
          modelHash: { type: "string", description: "blake3 hash of the model file", example: "a1b2c3d4e5f6..." },
          modelFileCid: { type: "string", description: "IPFS CID from Pinata upload", example: "QmXyz..." },
          baseModel: {
            type: "array",
            description: "Parent models (empty = from scratch)",
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: ["handshake", "huggingface", "other"] },
                name: { type: "string" },
                relationship: { type: "string", enum: ["finetune", "adapter", "quantized", "merge", "knowledge_distillation"] },
                handshakeId: { type: "string", description: "Only when source=handshake" },
                externalId: { type: "string", description: "HuggingFace repo ID or URL" },
              },
            },
          },
          tags: { type: "array", items: { type: "string" }, example: ["legal", "llm"] },
          languages: { type: "array", items: { type: "string" }, example: ["en", "tr"] },
          intendedUse: { type: "string", description: "EU AI Act Annex IV field", example: "Legal document summarization" },
          size: { type: "number", description: "File size in bytes", example: 16000000000 },
          quantization: { type: "string", enum: ["none", "int8", "int4", "gptq", "awq"] },
          parameters: { type: "string", example: "8B" },
          contextLength: { type: "number", example: 8192 },
        },
      },
    }),
    ApiResponse({ status: 201, description: "Model created" }),
    ApiResponse({ status: 400, description: "Validation error" }),
    ApiResponse({ status: 401, description: "Not authenticated" }),
    ApiResponse({ status: 409, description: "Duplicate model hash" }),
  );
