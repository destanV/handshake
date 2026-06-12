import type { HfRepoFile, HfRepoMetadata, SelectedHfFile } from "../types.js";

interface HfSibling {
  rfilename?: string;
  size?: number;
  blobSize?: number;
}

interface HfApiModel {
  id?: string;
  sha?: string;
  tags?: string[];
  cardData?: {
    license?: string | string[];
  };
  siblings?: HfSibling[];
}

export class HfClient {
  constructor(private readonly token?: string) {}

  private headers(extra: HeadersInit = {}): HeadersInit {
    return this.token ? { ...extra, Authorization: `Bearer ${this.token}` } : extra;
  }

  async fetchModelMetadata(repoId: string): Promise<HfRepoMetadata> {
    const encodedRepo = repoId.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`https://huggingface.co/api/models/${encodedRepo}?blobs=true`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`Hugging Face metadata request failed for ${repoId}: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as HfApiModel;
    const license = Array.isArray(body.cardData?.license)
      ? body.cardData?.license[0]
      : body.cardData?.license;
    const files: HfRepoFile[] = (body.siblings ?? [])
      .filter((file): file is HfSibling & { rfilename: string } => Boolean(file.rfilename))
      .map((file) => ({
        path: file.rfilename,
        size: file.size ?? file.blobSize,
      }));

    return {
      repoId: body.id ?? repoId,
      sha: body.sha,
      tags: body.tags ?? [],
      license,
      files,
    };
  }

  async resolveFileSize(repoId: string, revision: string, file: HfRepoFile): Promise<HfRepoFile> {
    if (typeof file.size === "number") return file;
    const encodedRepo = repoId.split("/").map(encodeURIComponent).join("/");
    const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
    const url = `https://huggingface.co/${encodedRepo}/resolve/${encodeURIComponent(revision)}/${encodedPath}`;
    const res = await fetch(url, { method: "HEAD", headers: this.headers() });
    if (!res.ok) {
      throw new Error(`HEAD failed for ${repoId}/${file.path}: ${res.status} ${res.statusText}`);
    }
    const length = res.headers.get("content-length");
    if (!length) {
      throw new Error(`Cannot determine content length for ${repoId}/${file.path}`);
    }
    return { ...file, size: Number.parseInt(length, 10) };
  }

  async downloadFile(file: SelectedHfFile): Promise<Uint8Array> {
    const res = await fetch(file.url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Download failed for ${file.repoId}/${file.path}: ${res.status} ${res.statusText}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength !== file.size) {
      throw new Error(
        `Downloaded size mismatch for ${file.repoId}/${file.path}: expected ${file.size}, got ${bytes.byteLength}`,
      );
    }
    return bytes;
  }
}
