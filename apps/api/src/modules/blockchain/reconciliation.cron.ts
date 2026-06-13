import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Interval } from "@nestjs/schedule";
import type { Model } from "mongoose";
import { ProviderService } from "./provider.service";
import { RegistryListenerService } from "./registry-listener.service";
import { BlockchainCursor } from "./schemas/blockchain-cursor.schema";
import type { BlockchainCursorDocument } from "./schemas/blockchain-cursor.schema";

const CONFIRMATIONS = 1; // Decision K — Avalanche has fast deterministic finality
const MAX_BLOCK_RANGE = 2000; // chunk getLogs to stay within RPC range limits

// 60s backstop for the WS listener: scans getLogs(lastSeenBlock+1 .. head-1), applies the same
// idempotent handler, and advances the cursor. Catches anything missed while WS was down or while
// the API was restarting (Decision J, Acceptance #8).
@Injectable()
export class ReconciliationCron implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationCron.name);
  private running = false;

  constructor(
    private readonly provider: ProviderService,
    private readonly listener: RegistryListenerService,
    @InjectModel(BlockchainCursor.name)
    private readonly cursorModel: Model<BlockchainCursorDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.provider.hasRegistry()) return;
    await this.ensureCursor();
  }

  @Interval(60_000)
  async reconcile(): Promise<void> {
    if (!this.provider.hasRegistry() || this.running) return;
    this.running = true;
    try {
      await this.scan(false);
    } catch (e) {
      this.logger.warn(`Reconciliation failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Full re-scan from the deploy block (or 0) to head, ignoring the cursor (manual ops). */
  async fullScan(): Promise<void> {
    if (!this.provider.hasRegistry()) {
      this.logger.warn("No registry configured — nothing to scan.");
      return;
    }
    await this.scan(true);
  }

  private async scan(full: boolean): Promise<void> {
    const contract = this.provider.getReadContract();
    if (!contract) return;

    const head = await this.provider.http.getBlockNumber();
    const safeHead = head - CONFIRMATIONS;
    if (safeHead < 0) return;

    const cursor = await this.ensureCursor();
    let from = full ? this.deployBlock() : cursor.lastSeenBlock + 1;
    if (from < 0) from = 0;
    if (from > safeHead) return;

    const filter = contract.filters.ModelRegistered();
    let processed = 0;
    for (let start = from; start <= safeHead; start += MAX_BLOCK_RANGE) {
      const end = Math.min(start + MAX_BLOCK_RANGE - 1, safeHead);
      const logs = await contract.queryFilter(filter, start, end);
      for (const log of logs) {
        await this.listener.applyRegisteredEvent(log);
        processed++;
      }
    }

    await this.cursorModel.updateOne(
      { contractAddress: this.provider.registryAddress },
      { $set: { lastSeenBlock: safeHead } },
      { upsert: true },
    );
    if (processed > 0) {
      this.logger.log(`Reconciled ${processed} event(s) up to block ${safeHead}.`);
    }
  }

  private deployBlock(): number {
    const v = Number(process.env.MODEL_REGISTRY_DEPLOY_BLOCK ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  private async ensureCursor(): Promise<BlockchainCursorDocument> {
    const address = this.provider.registryAddress as string;
    let cursor = await this.cursorModel.findOne({ contractAddress: address }).exec();
    if (!cursor) {
      // First boot: start at the deploy block if known, else current head (forward-only).
      const start =
        this.deployBlock() > 0
          ? this.deployBlock() - 1
          : await this.provider.http.getBlockNumber();
      cursor = await this.cursorModel.create({ contractAddress: address, lastSeenBlock: start });
      this.logger.log(`Initialized cursor at block ${start} for ${address}`);
    }
    return cursor;
  }
}
