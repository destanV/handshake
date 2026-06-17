import { ModelsService } from "./models.service";
import { ModelsRepository } from "./models.repository";
import { IpfsService } from "../ipfs/ipfs.service";
import { DomainException, DomainErrorCodes } from "../../common/exceptions/domain.exception";
import type { IModel, IBlockchainRecord } from "@handshake/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<IModel> = {}): IModel {
  return {
    _id: "model-id-1",
    name: "test-model",
    description: "A test model description that is long enough",
    version: "1.0.0",
    task: "text-generation" as never,
    framework: "pytorch" as never,
    license: "mit" as never,
    ownerAddress: "0xOwner",
    modelFileCid: "Qm...",
    metadataCid: "Qm...",
    modelHash: "abc123",
    baseModel: [],
    tags: [],
    languages: [],
    onChainRegistered: false,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeBlockchainRecord(overrides: Partial<IBlockchainRecord> = {}): IBlockchainRecord {
  return {
    txHash: "0x" + "ab".repeat(32),
    blockNumber: 1000,
    contractAddress: "0x" + "cd".repeat(20),
    chainId: 43113,
    registeredAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<ModelsRepository> = {}): jest.Mocked<ModelsRepository> {
  return {
    findAll: jest.fn(),
    findById: jest.fn(),
    existsByHash: jest.fn(),
    create: jest.fn(),
    findByHash: jest.fn(),
    setBlockchainById: jest.fn(),
    updateBlockchainByHash: jest.fn(),
    createExternalStub: jest.fn(),
    findExternalPendingByOwner: jest.fn(),
    completeStub: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ModelsRepository>;
}

function makeIpfs(overrides: Partial<IpfsService> = {}): jest.Mocked<IpfsService> {
  return {
    uploadMetadata: jest.fn().mockResolvedValue("Qm-new-cid"),
    getSignedUploadUrl: jest.fn(),
    fetchMetadata: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as jest.Mocked<IpfsService>;
}

// ── syncFromChain ─────────────────────────────────────────────────────────────

describe("ModelsService.syncFromChain", () => {
  const OWNER = "0xDeadBeef";
  const META_CID = "QmMeta";
  const HASH = "deadbeef00000000000000000000000000000000000000000000000000000000";
  const record = makeBlockchainRecord();

  it("creates an external stub when the hash is not in MongoDB", async () => {
    const repo = makeRepo({ findByHash: jest.fn().mockResolvedValue(null) });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.syncFromChain(HASH, record, OWNER, META_CID);

    expect(result).toEqual({ found: false, updated: false });
    expect(repo.createExternalStub).toHaveBeenCalledWith({
      modelHash: HASH,
      ownerAddress: OWNER,
      metadataCid: META_CID,
      blockchain: record,
      onChainRegistered: true,
      status: "external_pending",
    });
  });

  it("is idempotent — skips update when same txHash already stored", async () => {
    const model = makeModel({ onChainRegistered: true, blockchain: { txHash: record.txHash } });
    const repo = makeRepo({ findByHash: jest.fn().mockResolvedValue(model) });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.syncFromChain(HASH, record, OWNER, META_CID);

    expect(result).toEqual({ found: true, updated: false });
    expect(repo.updateBlockchainByHash).not.toHaveBeenCalled();
  });

  it("updates the blockchain record when hash is known but not yet synced", async () => {
    const model = makeModel({ onChainRegistered: false });
    const repo = makeRepo({ findByHash: jest.fn().mockResolvedValue(model) });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.syncFromChain(HASH, record, OWNER, META_CID);

    expect(result).toEqual({ found: true, updated: true });
    expect(repo.updateBlockchainByHash).toHaveBeenCalledWith(HASH, record);
  });

  it("updates when a different txHash is on record (re-registration edge case)", async () => {
    const model = makeModel({
      onChainRegistered: true,
      blockchain: { txHash: "0x" + "ff".repeat(32) },
    });
    const repo = makeRepo({ findByHash: jest.fn().mockResolvedValue(model) });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.syncFromChain(HASH, record, OWNER, META_CID);

    expect(result).toEqual({ found: true, updated: true });
    expect(repo.updateBlockchainByHash).toHaveBeenCalledWith(HASH, record);
  });
});

// ── existsByHash (three-way result) ──────────────────────────────────────────

describe("ModelsService.checkDuplicate", () => {
  const CALLER = "0xCallerAddress";
  const OTHER = "0xSomeoneElse";

  it("returns exists:false when hash not found", async () => {
    const repo = makeRepo({ existsByHash: jest.fn().mockResolvedValue({ exists: false }) });
    const service = new ModelsService(repo, makeIpfs());

    expect(await service.checkDuplicate("hash1", CALLER)).toEqual({ exists: false });
  });

  it("returns exists:true with status:active for normal records", async () => {
    const repo = makeRepo({
      existsByHash: jest.fn().mockResolvedValue({ exists: true, modelId: "id1", status: "active" }),
    });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.checkDuplicate("hash1", CALLER);
    expect(result.exists).toBe(true);
    expect(result.status).toBe("active");
  });

  it("returns exists:true with isOwner:true when caller owns the stub", async () => {
    const repo = makeRepo({
      existsByHash: jest.fn().mockResolvedValue({
        exists: true,
        modelId: "id1",
        status: "external_pending",
        isOwner: true,
      }),
    });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.checkDuplicate("hash1", CALLER);
    expect(result.exists).toBe(true);
    expect(result.status).toBe("external_pending");
    expect(result.isOwner).toBe(true);
  });

  it("returns exists:false when stub belongs to a different owner", async () => {
    const repo = makeRepo({
      existsByHash: jest.fn().mockResolvedValue({ exists: false }),
    });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.checkDuplicate("hash1", OTHER);
    expect(result.exists).toBe(false);
  });
});

// ── completeExternalRegistration ──────────────────────────────────────────────

describe("ModelsService.completeExternalRegistration", () => {
  const CALLER = "0xOwner";
  const dto = {
    name: "completed-model",
    description: "A thorough description that meets the minimum",
    version: "1.0.0",
    task: "text-generation" as never,
    framework: "pytorch" as never,
    license: "mit" as never,
  };

  it("completes a stub — sets status to active and uploads new metadata", async () => {
    const stub = makeModel({ status: "external_pending", ownerAddress: CALLER });
    const completed = { ...stub, ...dto, status: "active" as const, metadataCid: "Qm-new-cid" };
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(stub),
      completeStub: jest.fn().mockResolvedValue(completed),
    });
    const ipfs = makeIpfs();
    const service = new ModelsService(repo, ipfs);

    const result = await service.completeExternalRegistration("model-id-1", dto, CALLER);

    expect(ipfs.uploadMetadata).toHaveBeenCalled();
    expect(repo.completeStub).toHaveBeenCalledWith("model-id-1", expect.objectContaining({ metadataCid: "Qm-new-cid" }));
    expect(result.status).toBe("active");
  });

  it("throws NOT_FOUND when model id does not exist", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new ModelsService(repo, makeIpfs());

    await expect(
      service.completeExternalRegistration("bad-id", dto, CALLER)
    ).rejects.toMatchObject({ code: DomainErrorCodes.MODEL_NOT_FOUND });
  });

  it("throws FORBIDDEN when caller is not the owner", async () => {
    const stub = makeModel({ status: "external_pending", ownerAddress: "0xNotCaller" });
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(stub) });
    const service = new ModelsService(repo, makeIpfs());

    await expect(
      service.completeExternalRegistration("model-id-1", dto, CALLER)
    ).rejects.toMatchObject({ code: DomainErrorCodes.FORBIDDEN });
  });

  it("throws INVALID_STATUS when model is already active", async () => {
    const model = makeModel({ status: "active", ownerAddress: CALLER });
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(model) });
    const service = new ModelsService(repo, makeIpfs());

    await expect(
      service.completeExternalRegistration("model-id-1", dto, CALLER)
    ).rejects.toMatchObject({ code: DomainErrorCodes.INVALID_STATUS });
  });
});

// ── getPendingExternal ────────────────────────────────────────────────────────

describe("ModelsService.getPendingExternal", () => {
  it("returns stubs for the given owner", async () => {
    const stubs = [makeModel({ status: "external_pending" })];
    const repo = makeRepo({ findExternalPendingByOwner: jest.fn().mockResolvedValue(stubs) });
    const service = new ModelsService(repo, makeIpfs());

    const result = await service.getPendingExternal("0xOwner");

    expect(repo.findExternalPendingByOwner).toHaveBeenCalledWith("0xOwner");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no stubs exist", async () => {
    const repo = makeRepo({ findExternalPendingByOwner: jest.fn().mockResolvedValue([]) });
    const service = new ModelsService(repo, makeIpfs());

    expect(await service.getPendingExternal("0xOwner")).toEqual([]);
  });
});
