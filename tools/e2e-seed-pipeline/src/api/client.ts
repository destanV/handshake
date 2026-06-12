import { readFile } from "node:fs/promises";
import path from "node:path";
import { SiweMessage } from "siwe";
import type { CheckDuplicateResponse, CreateModelDTO, IModel } from "@handshake/types";
import type { RuntimeConfig } from "../types.js";

interface SignableAccount {
  address: `0x${string}`;
  signMessage(args: { message: string }): Promise<`0x${string}`>;
}

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
}

export class SeedApiClient {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly config: RuntimeConfig,
    private readonly account?: SignableAccount,
  ) {}

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  private storeCookies(headers: Headers): void {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const values = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [headers.get("set-cookie")].filter(Boolean) as string[];
    for (const value of values) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      if (index > 0) {
        this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
    }
  }

  private async request<T>(pathName: string, init: RequestOptions = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
      headers.set("Content-Type", "application/json");
    }
    if (init.authenticated) {
      headers.set("Cookie", this.cookieHeader());
    }

    const res = await fetch(`${this.config.apiUrl}${pathName}`, {
      ...init,
      headers,
    });
    this.storeCookies(res.headers);

    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      const message = body?.error?.message ?? body?.message ?? res.statusText;
      throw new Error(`${init.method ?? "GET"} ${pathName} failed: ${res.status} ${message}`);
    }
    return (await res.json()) as T;
  }

  async login(): Promise<void> {
    if (!this.account) throw new Error("API login requires a wallet account");
    const { nonce } = await this.request<{ nonce: string }>("/auth/nonce");
    const clientUrl = new URL(this.config.clientUrl);
    const message = new SiweMessage({
      domain: clientUrl.host,
      address: this.account.address,
      statement: "Seed Handshake demo data",
      uri: clientUrl.toString(),
      version: "1",
      chainId: this.config.chainId,
      nonce,
      issuedAt: new Date().toISOString(),
    }).prepareMessage();
    const signature = await this.account.signMessage({ message });
    await this.request<{ ok: boolean }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    });
  }

  async fetchModel(id: string): Promise<IModel> {
    return this.request<IModel>(`/models/${id}`);
  }

  async checkDuplicate(modelHash: string): Promise<CheckDuplicateResponse> {
    return this.request<CheckDuplicateResponse>(`/models/check/${modelHash}`);
  }

  async createModel(dto: CreateModelDTO): Promise<IModel> {
    return this.request<IModel>("/models", {
      method: "POST",
      authenticated: true,
      body: JSON.stringify(dto),
    });
  }

  async patchBlockchainRecord(
    modelId: string,
    payload: { txHash: string; blockNumber?: number; contractAddress?: string; chainId?: number },
  ): Promise<IModel> {
    return this.request<IModel>(`/models/${modelId}/blockchain`, {
      method: "PATCH",
      authenticated: true,
      body: JSON.stringify(payload),
    });
  }

  async uploadBundle(bundlePath: string): Promise<string> {
    const fileName = path.basename(bundlePath);
    const { signedUrl } = await this.request<{ signedUrl: string }>(
      `/ipfs/signed-url?fileName=${encodeURIComponent(fileName)}`,
      { authenticated: true },
    );
    const bytes = await readFile(bundlePath);
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: "application/octet-stream" }), fileName);
    formData.append("network", "public");

    const res = await fetch(signedUrl, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Pinata signed upload failed for ${fileName}: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { data?: { cid?: string } };
    const cid = body.data?.cid;
    if (!cid) throw new Error(`Pinata upload response did not include a cid for ${fileName}`);
    return cid;
  }
}
