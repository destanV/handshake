import { HttpException } from "@nestjs/common";

export const DomainErrorCodes = {
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  MODEL_DUPLICATE: "MODEL_DUPLICATE",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  IPFS_UPLOAD_FAILED: "IPFS_UPLOAD_FAILED",
  IPFS_SIGNED_URL_FAILED: "IPFS_SIGNED_URL_FAILED",
  HASH_MISMATCH: "HASH_MISMATCH",
  INVALID_STATUS: "INVALID_STATUS",
} as const;

export type DomainErrorCode = (typeof DomainErrorCodes)[keyof typeof DomainErrorCodes];

const ERRORS: Record<DomainErrorCode, { message: string; status: number }> = {
  MODEL_NOT_FOUND: { message: "Model not found", status: 404 },
  MODEL_DUPLICATE: { message: "A model with this hash already exists", status: 409 },
  UNAUTHORIZED: { message: "Authentication required", status: 401 },
  FORBIDDEN: { message: "You do not own this resource", status: 403 },
  IPFS_UPLOAD_FAILED: { message: "Failed to upload metadata to IPFS", status: 502 },
  IPFS_SIGNED_URL_FAILED: { message: "Failed to generate upload URL", status: 502 },
  HASH_MISMATCH: { message: "The file hash does not match the on-chain registration", status: 422 },
  INVALID_STATUS: { message: "This operation is not valid for the model's current status", status: 409 },
};

export class DomainException extends HttpException {
  constructor(public readonly code: DomainErrorCode) {
    super({ code, message: ERRORS[code].message }, ERRORS[code].status);
  }
}
