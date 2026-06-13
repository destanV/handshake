import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { ethers } from "ethers";
import { ModelRegistryAbi, getRegistryAddress } from "@handshake/contracts";

const DEFAULT_FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const RECONNECT_DELAY_MS = 5000;

export type EventHandler = (...args: unknown[]) => void;

// Owns the JSON-RPC (always) and WebSocket (optional) providers. The WS path feeds the live
// listener; ethers v6 does NOT auto-resubscribe, so on close/error we tear the socket down and
// rebuild it, re-attaching every stored listener (Fix-3). While WS is down the cron is the only
// sync path — acceptable, not silent loss (Decision J).
@Injectable()
export class ProviderService implements OnModuleDestroy {
  private readonly logger = new Logger(ProviderService.name);

  readonly chainId: number;
  readonly registryAddress?: string;

  private readonly httpProvider: ethers.JsonRpcProvider;
  private readonly wsUrl?: string;
  private wsProvider?: ethers.WebSocketProvider;
  private wsContract?: ethers.Contract;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private readonly handlers: Array<{ event: string; handler: EventHandler }> = [];

  constructor() {
    this.chainId = Number(process.env.CHAIN_ID ?? 43113);
    const rpc = process.env.AVALANCHE_FUJI_RPC?.trim() || DEFAULT_FUJI_RPC;
    this.httpProvider = new ethers.JsonRpcProvider(rpc, this.chainId, { staticNetwork: true });
    this.registryAddress =
      process.env.MODEL_REGISTRY_ADDRESS?.trim() || getRegistryAddress(this.chainId);
    this.wsUrl = process.env.AVALANCHE_FUJI_WS?.trim() || undefined;

    if (!this.registryAddress) {
      this.logger.warn(
        "No MODEL_REGISTRY_ADDRESS (and no committed deployment) — blockchain sync is idle until configured.",
      );
    } else {
      this.logger.log(
        `ModelRegistry ${this.registryAddress} on chain ${this.chainId} (ws=${this.wsUrl ? "on" : "off"})`,
      );
    }
  }

  hasRegistry(): boolean {
    return Boolean(this.registryAddress);
  }

  get http(): ethers.JsonRpcProvider {
    return this.httpProvider;
  }

  /** Read-only contract on the HTTP provider — used by the cron + lineage reads. */
  getReadContract(): ethers.Contract | null {
    if (!this.registryAddress) return null;
    return new ethers.Contract(
      this.registryAddress,
      ModelRegistryAbi as unknown as ethers.InterfaceAbi,
      this.httpProvider,
    );
  }

  isWsConnected(): boolean {
    const ws = this.wsProvider?.websocket as { readyState?: number } | undefined;
    return ws?.readyState === 1; // WebSocket.OPEN
  }

  /** Subscribe to a contract event over WS; the handler is re-attached across reconnects. */
  subscribe(event: string, handler: EventHandler): void {
    this.handlers.push({ event, handler });
    if (!this.registryAddress) return;
    if (!this.wsUrl) {
      this.logger.warn(`WS not configured — '${event}' is served by the reconciliation cron only.`);
      return;
    }
    this.ensureWs();
  }

  /** Remove a handler so it is not re-attached on reconnect and is detached from the live WS. */
  unsubscribe(event: string, handler: EventHandler): void {
    const idx = this.handlers.findIndex((h) => h.event === event && h.handler === handler);
    if (idx !== -1) this.handlers.splice(idx, 1);
    this.wsContract?.off(event, handler);
  }

  private ensureWs(): void {
    if (this.destroyed || this.wsProvider || !this.wsUrl || !this.registryAddress) return;
    try {
      const provider = new ethers.WebSocketProvider(this.wsUrl, this.chainId);
      const contract = new ethers.Contract(
        this.registryAddress,
        ModelRegistryAbi as unknown as ethers.InterfaceAbi,
        provider,
      );
      this.wsProvider = provider;
      this.wsContract = contract;
      for (const { event, handler } of this.handlers) {
        void contract.on(event, handler);
      }

      const ws = provider.websocket as {
        addEventListener?: (type: string, cb: () => void) => void;
      };
      ws.addEventListener?.("open", () => this.logger.log(`WS connected: ${this.wsUrl}`));
      ws.addEventListener?.("close", () => {
        this.logger.warn("WS closed — scheduling reconnect");
        this.scheduleReconnect();
      });
      ws.addEventListener?.("error", () => {
        this.logger.warn("WS error — scheduling reconnect");
        this.scheduleReconnect();
      });
    } catch (e) {
      this.logger.warn(`WS setup failed (${(e as Error).message}) — relying on cron; will retry.`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.teardownWs();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.logger.log("Reconnecting WS…");
      this.ensureWs();
    }, RECONNECT_DELAY_MS);
  }

  private teardownWs(): void {
    try {
      this.wsContract?.removeAllListeners();
      void this.wsProvider?.destroy();
    } catch {
      /* ignore */
    }
    this.wsContract = undefined;
    this.wsProvider = undefined;
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.teardownWs();
    try {
      await this.httpProvider.destroy();
    } catch {
      /* ignore */
    }
  }
}
