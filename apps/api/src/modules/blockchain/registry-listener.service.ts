import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import type { ContractEventPayload, Log, EventLog } from "ethers";
import { toCanonicalHash } from "@handshake/contracts";
import { ModelsService } from "../models/models.service";
import { ProviderService } from "./provider.service";

// Subscribes to ModelRegistered over WS and applies each event to Mongo. The same handler is
// reused by the reconciliation cron, so the WS and cron paths converge on identical, idempotent
// writes (Decision I). modelHash is normalized to the canonical (no-0x, lowercase) form before
// matching Mongo (Invariant 2).
@Injectable()
export class RegistryListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegistryListenerService.name);

  constructor(
    private readonly provider: ProviderService,
    private readonly models: ModelsService,
  ) {}

  onModuleInit(): void {
    if (!this.provider.hasRegistry()) return;
    this.provider.subscribe("ModelRegistered", this.onModelRegistered);
    this.logger.log("Listening for ModelRegistered (WS live; cron backstop active).");
  }

  // ethers v6 invokes listeners with the decoded args followed by a ContractEventPayload.
  private onModelRegistered = (...args: unknown[]): void => {
    const payload = args[args.length - 1] as ContractEventPayload;
    void this.applyRegisteredEvent(payload.log).catch((e) =>
      this.logger.error(`ModelRegistered handler failed: ${(e as Error).message}`),
    );
  };

  /** Apply one ModelRegistered log to Mongo. Shared by the WS listener and the cron. Idempotent. */
  async applyRegisteredEvent(log: Log | EventLog): Promise<void> {
    const contract = this.provider.getReadContract();
    if (!contract) return;

    const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) return;

    const canonical = toCanonicalHash(parsed.args.modelHash as string);
    const ownerAddress = parsed.args.owner as string;
    const metadataCid = parsed.args.metadataCID as string;
    const block = await this.provider.http.getBlock(log.blockNumber);
    const registeredAt = block ? new Date(block.timestamp * 1000) : new Date();

    await this.models.syncFromChain(
      canonical,
      {
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        contractAddress: this.provider.registryAddress,
        chainId: this.provider.chainId,
        registeredAt,
      },
      ownerAddress,
      metadataCid,
    );
  }

  onModuleDestroy(): void {
    if (!this.provider.hasRegistry()) return;
    this.provider.unsubscribe("ModelRegistered", this.onModelRegistered);
    this.logger.log("Stopped listening for ModelRegistered.");
  }
}
