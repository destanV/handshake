import { z } from "zod";

// Body of PATCH /models/:id/blockchain. The client sends the confirmed receipt fields; the server
// stamps registeredAt and enforces owner-only + idempotency (T6).
export const UpdateBlockchainSchema = z.object({
  txHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "txHash must be a 0x-prefixed 32-byte hex string"),
  blockNumber: z.number().int().nonnegative().optional(),
  contractAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "contractAddress must be a 0x-prefixed address")
    .optional(),
  chainId: z.number().int().positive().optional(),
});

export type UpdateBlockchainDTO = z.infer<typeof UpdateBlockchainSchema>;
