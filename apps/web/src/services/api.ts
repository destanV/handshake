import type {
  IModel,
  ModelListResponse,
  CheckDuplicateResponse,
  CreateModelDTO,
  CompleteExternalRegistrationDTO,
} from "@handshake/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error?.message ?? res.statusText)
  }

  return res.json() as Promise<T>
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function fetchNonce(): Promise<{ nonce: string }> {
  return request("/auth/nonce")
}

export async function verifySignature(
  message: string,
  signature: string
): Promise<{ ok: boolean }> {
  return request("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ message, signature }),
  })
}

/** Returns null (not throws) on 401 — use as "not authenticated" signal */
export async function fetchMe(): Promise<{ walletAddress: string } | null> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" })
  if (res.status === 401) return null
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.json()
}

export async function logout(): Promise<{ ok: boolean }> {
  return request("/auth/logout", { method: "POST" })
}

// ─── Models ──────────────────────────────────────────────────────────────────

export interface QueryModelParams {
  task?: string
  framework?: string
  owner?: string
  page?: number
  limit?: number
}

export async function fetchModels(
  params: QueryModelParams = {}
): Promise<ModelListResponse> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString()
  return request(`/models${qs ? `?${qs}` : ""}`)
}

export async function fetchModel(id: string): Promise<IModel> {
  return request(`/models/${id}`)
}

export async function checkModelHash(
  hash: string,
  caller?: string
): Promise<CheckDuplicateResponse> {
  const qs = caller ? `?caller=${encodeURIComponent(caller)}` : ''
  return request(`/models/check/${hash}${qs}`)
}

export async function fetchPendingExternal(): Promise<IModel[]> {
  return request('/models/pending-external')
}

export async function prefetchMetadata(
  cid: string
): Promise<Record<string, unknown> | { prefetchFailed: true }> {
  return request(`/models/prefetch-metadata?cid=${encodeURIComponent(cid)}`)
}

export async function completeExternalRegistration(
  modelId: string,
  dto: CompleteExternalRegistrationDTO
): Promise<IModel> {
  return request(`/models/${modelId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  })
}

export async function createModel(dto: CreateModelDTO): Promise<IModel> {
  return request("/models", {
    method: "POST",
    body: JSON.stringify(dto),
  })
}

export interface BlockchainRecordPayload {
  txHash: string
  blockNumber?: number
  contractAddress?: string
  chainId?: number
}

/** Records a confirmed on-chain registration on the model (owner-only, idempotent). */
export async function patchBlockchainRecord(
  modelId: string,
  payload: BlockchainRecordPayload
): Promise<IModel> {
  return request(`/models/${modelId}/blockchain`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

// ─── IPFS ────────────────────────────────────────────────────────────────────

export async function fetchSignedUrl(
  fileName: string
): Promise<{ signedUrl: string }> {
  return request(`/ipfs/signed-url?fileName=${encodeURIComponent(fileName)}`)
}

export { ApiError }
