import { Injectable, Logger } from "@nestjs/common";
import { PinataAdapter } from "./adapters/pinata.adapter";

export interface SignedUrlOptions {
  fileName: string;
  ownerAddress: string;
}

export interface IStorageProvider {
  uploadJson(data: Record<string, unknown>, ownerAddress: string): Promise<string>;
  createSignedUploadUrl(opts: SignedUrlOptions): Promise<string>;
}

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);

  constructor(private readonly storage: PinataAdapter) {}

  async uploadMetadata(metadata: Record<string, unknown>, ownerAddress: string): Promise<string> {
    this.logger.debug(`Uploading metadata to IPFS for owner=${ownerAddress}`);
    return this.storage.uploadJson(metadata, ownerAddress);
  }

  async getSignedUploadUrl(fileName: string, ownerAddress: string): Promise<string> {
    this.logger.debug(`Requesting signed upload URL: file="${fileName}" owner=${ownerAddress}`);
    return this.storage.createSignedUploadUrl({ fileName, ownerAddress });
  }

  /** Fetch and parse a metadata JSON from IPFS. Returns null on any network or parse error. */
  async fetchMetadata(cid: string): Promise<Record<string, unknown> | null> {
    const gateway = process.env.PINATA_GATEWAY;
    if (!gateway || !cid) return null;
    try {
      const res = await fetch(`https://${gateway}/ipfs/${cid}`);
      if (!res.ok) return null;
      const json = await res.json() as unknown;
      if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
      return json as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
