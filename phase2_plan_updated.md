# Phase 2 — On-chain Model Registry (executable spec)

> Agent task spec. Decisions are locked; do not re-derive or ask. Execute tasks in
> order. Each task has a `DONE WHEN` gate — do not proceed until it passes.

## OBJECTIVE
Anchor the canonical model record (`modelHash`, owner, metadata pointer,
in-registry lineage) in an immutable contract on Avalanche Fuji (chainId 43113).
On-chain is the source of truth; Mongo becomes a cache. UI exposes the on-chain proof.

## SCOPE GUARDS
IN SCOPE: `ModelRegistry` contract, its tests + Fuji deploy, a `@handshake/contracts`
package, backend event sync, frontend register-on-chain flow, registry detail proof UI.

OUT OF SCOPE — do NOT touch or implement:
- opML / inference verification / fraud proofs / bisection / MIPS / challenge logic
  (separate branch, separate phase).
- Any rewrite of existing `auth`, `ipfs`, or core `models` upload/registration logic.
- Custodial signing keys in the backend. Registration is USER-signed only.
- Upgradeable proxies, pausing, meta-tx / EIP-2771.

## DO NOT CHANGE (reuse as-is)
- `model.schema.ts` fields `onChainRegistered: boolean` and `blockchain` sub-doc — already correct.
- `IBlockchainRecord` (`packages/types/src/model/model.types.ts`) — use unchanged.
- wagmi config (`apps/web/src/lib/wagmi.ts`) — already has `avalancheFuji`; only add `useWriteContract` usage.
- `auth.guard.ts` — reuse for the new PATCH endpoint.
- The blake3 hashing in `apps/web/src/utils/blake3.ts` — do not modify.

## INVARIANTS (honor at every boundary)
1. `modelHash` is blake3 of the manifest JSON = exactly 32 bytes ⇒ Solidity type is `bytes32`.
2. `bytesToHex` (noble) returns hex WITHOUT `0x`. Mongo stores the non-prefixed form.
   The contract and viem require `0x`-prefixed. Define ONE normalization helper and use it
   everywhere: canonical = lowercase, no `0x` for Mongo storage/compare; add `0x` only at
   the contract call site and when matching event args. Never compare prefixed vs non-prefixed.
3. On-chain is truth. On conflict, on-chain wins; Mongo is reconciled to it.
4. On-chain `parents` contains ONLY in-registry models (parents that themselves have an
   on-chain record). External base models (HuggingFace, etc.) are NOT put on-chain — they
   stay in off-chain metadata. See Decision L.

## LOCKED DECISIONS
- A. `modelHash` → `bytes32`. `metadataCID` → `string`. License is NOT stored on-chain — it stays
  in off-chain metadata (Mongo / metadataCID), like version and tags. Consequence: Table 1's
  license column stays ○; do not claim on-chain license provenance.
- B. Version/timestamp NOT stored on-chain. Read timestamp from event `block.timestamp`.
- C. `isActive` is OFF-chain (Mongo/UI lifecycle flag), NOT anchored — same rationale as license.
  Deprecation is a DB/UI state, not a chain write. Re-add to the struct only if owner-deprecation
  must be verifiable from the chain alone. The Mongo schema has no `isActive` field today; add one
  off-chain only if a deprecate feature is actually wanted.
- D. Registration: anyone; `msg.sender` becomes owner. First-come.
- E. `updateMetadata`: owner-only. `modelHash` immutable; only `metadataCID` is mutable on-chain.
- F. Ownership transfer: 2-step (initiate + accept), OZ `Ownable2Step` semantics.
- G. No reentrancy surface (no external calls in any state-changing function).
- H. Signing: user-signed via wagmi `useWriteContract`. Gas paid by user.
- I. Storage + event hybrid: struct is truth, event feeds the indexer.
- J. Sync: ethers v6 `WebSocketProvider` `.on('ModelRegistered')` + 60s `getLogs`
  reconciliation cron as backstop. WS MUST auto-resubscribe on disconnect (see Fix-3 below).
- K. Reorg tolerance: 1 confirmation (Avalanche has fast deterministic finality).
- L. **Lineage encoding (Fix-2).** On-chain `parents: bytes32[]`, max 8. `registerModel`
  REVERTS if any listed parent is not already registered (`ParentNotRegistered`). The frontend
  passes only parents whose `onChainRegistered === true`. External / not-yet-anchored parents
  are recorded only in off-chain metadata; document this as a stated scope limitation.
- M. **Lineage reads (Fix-1).** NO recursive `getLineage` on-chain (depth 10 × 8 parents is
  exponential and will exceed `eth_call` gas). Contract exposes immediate parents only via
  `getModel(...).parents`. The full DAG is reconstructed OFF-CHAIN by walking hop-by-hop
  against the cache, verifying each edge with an on-chain `getModel` read.
- N. **Front-running (Fix-3) — mitigated via commit-reveal (see T9).** Naive first-come
  registration IS front-runnable: `modelHash` is public in the mempool, so a bot can claim it
  from another wallet before the original tx mines. This phase MITIGATES it on-chain with a
  two-step commit-reveal: a sealed `commit(keccak256(modelHash, salt, msg.sender))` first, then a
  `reveal` that re-registers. Because the commitment binds `msg.sender`, the bot cannot pre-commit
  a matching commitment for someone else's reveal. Build order: get the plain `mapping` registry
  green FIRST (T1–T8), THEN layer T9 on top. Do NOT start with commit-reveal. NatSpec and docs
  state the mitigation and its residual UX cost (two signatures, two txs).

---

## CONTRACT INTERFACE (implement exactly)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Provenance registry for AI models on Avalanche Fuji.
/// @dev Ownership front-running (modelHash is public in the mempool) is mitigated by a two-step
///      commit-reveal: commit(keccak256(modelHash, salt, msg.sender)) then reveal. The commitment
///      binds msg.sender, so an observer cannot pre-commit a matching commitment for another
///      account's reveal. Direct registerModel remains available but is documented as front-runnable.
contract ModelRegistry {
    struct Model {
        bytes32   modelHash;     // blake3 of manifest JSON; primary key
        string    metadataCID;   // IPFS CIDv1
        address   owner;
        address   pendingOwner;  // 2-step transfer
        bytes32[] parents;       // in-registry parents only; external lineage stays off-chain
        bool      exists;
    }

    uint8 public constant MAX_PARENTS = 8;
    uint256 public constant REVEAL_WINDOW = 240; // blocks; commit expires after this (~minutes on Fuji)
    mapping(bytes32 => Model) private models;
    mapping(bytes32 => uint256) public commitments; // commitment => commit block number (0 = none)

    event ModelCommitted(bytes32 indexed commitment, address indexed committer);
    event ModelRegistered(bytes32 indexed modelHash, address indexed owner, string metadataCID, bytes32[] parents);
    event MetadataUpdated(bytes32 indexed modelHash, string metadataCID);
    event OwnershipTransferInitiated(bytes32 indexed modelHash, address indexed from, address indexed to);
    event OwnershipTransferred(bytes32 indexed modelHash, address indexed from, address indexed to);

    error AlreadyRegistered();
    error NotRegistered();
    error NotOwner();
    error TooManyParents();
    error ParentNotRegistered();
    error NotPendingOwner();
    error ZeroAddress();
    error CommitmentExists();
    error NoCommitment();
    error CommitTooRecent();   // reveal in same block as commit
    error CommitExpired();     // past REVEAL_WINDOW

    // --- Commit-reveal (preferred path; defeats ownership front-running) ---

    // commitment = keccak256(abi.encode(modelHash, salt, msg.sender)); salt is a client-side random bytes32.
    // require commitments[commitment] == 0; store block.number; emit ModelCommitted.
    function commit(bytes32 commitment) external;

    // recompute commitment from args + msg.sender; require it exists; require block.number > committedAt
    // (CommitTooRecent) and block.number <= committedAt + REVEAL_WINDOW (CommitExpired); delete commitment;
    // run the same registration logic as registerModel; emit ModelRegistered.
    function reveal(bytes32 modelHash, string calldata metadataCID, bytes32[] calldata parents, bytes32 salt) external;

    // --- Direct registration (kept for completeness; front-runnable, see @dev) ---
    // store struct (owner=msg.sender, exists=true); emit ModelRegistered.
    function registerModel(bytes32 modelHash, string calldata metadataCID, bytes32[] calldata parents) external;

    // require exists; require msg.sender == owner; modelHash stays immutable; emit MetadataUpdated.
    function updateMetadata(bytes32 modelHash, string calldata metadataCID) external;

    // require exists; require msg.sender == owner; require newOwner != 0; set pendingOwner; emit Initiated.
    function transferOwnership(bytes32 modelHash, address newOwner) external;

    // require msg.sender == pendingOwner; set owner; clear pendingOwner; emit Transferred.
    function acceptOwnership(bytes32 modelHash) external;

    function getModel(bytes32 modelHash) external view returns (Model memory);
    // NO getLineage. Reconstruct the DAG off-chain (Decision M).
}
```

---

## TASKS (ordered; do not skip a DONE WHEN)

### T1 — `packages/contracts` workspace
Create the package, isolated from any opML package.
- Add `packages/contracts` to `pnpm-workspace.yaml`.
- `packages/contracts/package.json`: hardhat, ethers v6, `@nomicfoundation/hardhat-toolbox`,
  `hardhat-gas-reporter`, `@nomicfoundation/hardhat-verify`.
- `hardhat.config.ts`: networks `hardhat` + `avalancheFuji` (RPC from `AVALANCHE_FUJI_RPC`,
  accounts from `DEPLOYER_PRIVATE_KEY`); gas reporter on; snowtrace verify with `SNOWTRACE_API_KEY`.
- `contracts/ModelRegistry.sol`: implement the interface above verbatim, including the NatSpec
  front-running note (Decision N).
- `.env.example`: `AVALANCHE_FUJI_RPC`, `DEPLOYER_PRIVATE_KEY`, `SNOWTRACE_API_KEY`.
- `.gitignore`: `artifacts/`, `cache/`, `typechain-types/`.
DONE WHEN: `pnpm --filter @handshake/contracts compile` succeeds with zero warnings on the contract.

### T2 — Contract test suite
`packages/contracts/test/ModelRegistry.test.ts`, ≥8 cases:
1. register happy path + `ModelRegistered` emitted with correct args.
2. duplicate hash → reverts `AlreadyRegistered`.
3. register with 0 / 3 / 8 parents (record gas for each).
4. register with a parent that is not registered → reverts `ParentNotRegistered`.
5. register with 9 parents → reverts `TooManyParents`.
6. `updateMetadata` by non-owner → reverts `NotOwner`; by owner → emits `MetadataUpdated`.
7. transfer: initiate → wrong acceptor reverts `NotPendingOwner` → correct acceptor succeeds, owner updated.
8. `getModel` returns stored struct including `parents` in order.
- Wire `hardhat-gas-reporter` to emit a table for register@0p, register@3p, register@8p,
  updateMetadata, transferOwnership.
DONE WHEN: `pnpm --filter @handshake/contracts test` → all pass; gas table printed.

### T3 — Deploy + verify on Fuji
- `scripts/deploy.ts` → deploy to Fuji.
- Verify on Snowtrace via `hardhat-verify`.
- Write address to `packages/contracts/deployments/avalancheFuji.json` (`{ chainId: 43113, address }`).
DONE WHEN: contract verified on Snowtrace; deployments file written.

### T4 — Shared ABI/address package export
- Copy ABI from artifact to `packages/contracts/abi/ModelRegistry.json` (keep this path out of `.gitignore`).
- `packages/contracts/index.ts`: export ABI + `{ [chainId]: address }` map.
- API and Web add `@handshake/contracts` as a workspace dep.
DONE WHEN: `import { ModelRegistryAbi, getRegistryAddress } from "@handshake/contracts"` resolves in both apps.

### T5 — Frontend register-on-chain flow
- `apps/web/src/lib/contracts.ts`: chainId → address mapping + ABI re-export from `@handshake/contracts`.
- `apps/web/src/hooks/useRegisterModel.ts`:
  - wagmi `useWriteContract` + `useWaitForTransactionReceipt`.
  - State machine: `idle | signing | pending | confirmed | error`.
  - Pass `modelHash` as `0x`-prefixed bytes32 (Invariant 2). Pass only parents with
    `onChainRegistered === true`, mapped to their `0x`-prefixed hashes (Decision L).
  - Persist tx hash to localStorage key `handshake:pending_tx:${modelHash}`.
- `apps/web/src/services/api.ts`: `patchBlockchainRecord(modelId, payload)` → `PATCH /models/:id/blockchain`.
- `apps/web/src/components/upload/wizardTypes.ts`: extend `UploadStatus` with
  `awaiting_signature | tx_pending | onchain_confirmed | onchain_skipped`.
- `apps/web/src/components/upload/Step5Summary.tsx`: existing success state becomes "uploaded";
  two buttons — "Register on-chain" / "Skip for now". Register runs `useRegisterModel`; on confirmed
  → `patchBlockchainRecord` → toast + redirect to detail. If wallet not connected, disable Register and
  show RainbowKit ConnectButton. Parse revert reasons: `AlreadyRegistered`, insufficient AVAX, `ParentNotRegistered`.
- `apps/web/src/app/(app)/registry/[id]/page.tsx`: if `model.blockchain` present → render
  txHash (Snowtrace link), blockNumber, contractAddress, chainId. If a pending tx exists in
  localStorage → "Confirming…" badge, resume via `useWaitForTransactionReceipt({ hash })`.
DONE WHEN: golden path (upload → Register → sign → pending → confirmed → Snowtrace link on detail)
and skip path (Skip → detail shows unverified + Register CTA) both work against the deployed contract.

### T6 — Backend blockchain sync module
- `apps/api/package.json`: add `ethers@^6`.
- `apps/api/src/modules/blockchain/`:
  - `provider.service.ts`: `ethers.WebSocketProvider` from `AVALANCHE_FUJI_WS`, HTTP fallback from
    `AVALANCHE_FUJI_RPC`. **WS reconnection (Fix-3 robustness):** on `error`/`close`, tear down and
    re-create the socket and RE-SUBSCRIBE the listener (ethers v6 does not auto-resubscribe). Until
    reconnected, the cron is the only path — that is acceptable, not silent total loss.
  - `registry-listener.service.ts`: `OnModuleInit` subscribes `provider.on('ModelRegistered', ...)`;
    `OnModuleDestroy` cleans up. Handler: normalize event `modelHash` (Invariant 2) → idempotency
    check (skip if txHash already stored) → find model by normalized `modelHash` → fill
    `models.blockchain` sub-doc + set `onChainRegistered: true`.
  - `schemas/blockchain-cursor.schema.ts`: `{ contractAddress, lastSeenBlock }`.
  - `reconciliation.cron.ts`: every 60s `getLogs(lastSeenBlock+1, latest)`, apply the same handler,
    advance cursor.
  - `blockchain.module.ts`: wire all; on `OnModuleInit` resume from cursor.
- `apps/api/src/modules/models/models.repository.ts`: add `updateBlockchainRecord(modelHashCanonical, record)`.
- `apps/api/src/modules/models/models.controller.ts`: `PATCH /:id/blockchain` (AuthGuard; owner-only).
- `apps/api/src/modules/models/models.service.ts`: `updateBlockchainRecord(id, record, callerAddress)`
  — enforce caller is owner; idempotent.
- `apps/api/src/modules/models/schemas/model.schema.ts`: add a unique PARTIAL index on
  `blockchain.txHash` (only when present).
- `apps/api/.env`: `AVALANCHE_FUJI_WS`, `AVALANCHE_FUJI_RPC`, `MODEL_REGISTRY_ADDRESS`.
DONE WHEN: API boots; a fresh Fuji `registerModel` tx updates the matching Mongo doc
(`onChainRegistered: true` + populated `blockchain`) within ~30s; replaying the same tx is a no-op.

### T7 — Off-chain lineage reconstruction + ops
- `apps/api/src/modules/blockchain/lineage.service.ts`: `reconstructLineage(modelHashCanonical)` walks
  the DAG off-chain — read `getModel(hash).parents` on-chain per hop, BFS with a visited set, hard cap
  (e.g. 256 nodes), return edges. No on-chain recursion (Decision M).
- `apps/api/src/modules/blockchain/health.controller.ts`: `GET /health/blockchain` → lastSeenBlock,
  age, contract address, ws connected bool.
- `apps/api/scripts/reconcile-blockchain.ts`: manual full-scan reconciliation.
DONE WHEN: `GET /health/blockchain` returns live status; `reconstructLineage` returns the correct
chain for a 3-deep on-chain lineage built in T8.

### T8 — Demo + docs (feeds the paper's Evaluation)
- Send ≥5 Fuji txs: 3 base models + 2 derived (a 3-deep lineage chain via on-chain parents) +
  1 transferOwnership + 1 updateMetadata. Record all tx hashes.
- Capture the `hardhat-gas-reporter` table (this is the §7 gas figure).
- Docs: deploy address, Snowtrace verified URL, demo tx URLs, and the limitations entry from Decision N.
DONE WHEN: README/docs contain the address, verified URL, ≥5 tx URLs, the gas table, and the
front-running limitation statement.

Estimated effort: ~16–22h.

### T9 — Commit-reveal hardening (front-running mitigation; build LAST, on top of green T1–T8)
Do NOT start here. Only begin once T1–T8 pass and the plain registry is deployed and synced.

Contract (`ModelRegistry.sol`):
- Add `commitments` mapping, `REVEAL_WINDOW` constant, `ModelCommitted` event, and the four
  commit-reveal errors (interface above).
- `commit(bytes32 commitment)`: revert `CommitmentExists` if already set; store `block.number`; emit.
- `reveal(modelHash, metadataCID, parents, salt)`: recompute `keccak256(abi.encode(modelHash, salt,
  msg.sender))`; revert `NoCommitment` if absent; revert `CommitTooRecent` if `block.number ==`
  commit block; revert `CommitExpired` if past `REVEAL_WINDOW`; delete the commitment; run the same
  internal registration logic as `registerModel` (dedupe, MAX_PARENTS, parent-exists checks); emit
  `ModelRegistered`. Factor the shared body into an internal `_register(...)` used by both paths.

Contract tests (add to the suite):
- commit happy path → emits `ModelCommitted`.
- duplicate commitment → reverts `CommitmentExists`.
- reveal in the same block as commit → reverts `CommitTooRecent`.
- reveal after `REVEAL_WINDOW` → reverts `CommitExpired`.
- reveal with wrong salt / wrong modelHash → reverts `NoCommitment` (commitment mismatch).
- reveal from an address other than the committer → reverts `NoCommitment` (binds `msg.sender`).
- full commit→(mine ≥1 block)→reveal → model registered, `ModelRegistered` emitted.
- gas: record `commit` and `reveal` separately for the §7 table.

Frontend (`useRegisterModel.ts`, `Step5Summary.tsx`):
- Generate a random 32-byte `salt` client-side; persist it with the model in localStorage
  (`handshake:commit:${modelHash}` → `{ salt, commitment, committedAtBlock }`) BEFORE sending commit.
- Extend the state machine: `idle → committing → committed → (wait ≥1 block) → revealing → confirmed`.
  Surface a clear "waiting for commit confirmation" step between the two signatures.
- Two wallet signatures (commit, then reveal). Disable reveal until the commit tx has ≥1 confirmation.
- Warn the user that clearing site data before reveal loses the salt and forfeits the commit
  (gas spent, must re-commit after the window).
- Keep the direct `registerModel` path available behind a flag/fallback, documented as front-runnable.

Backend (`registry-listener.service.ts`):
- No new sync logic required — `ModelRegistered` is still emitted by `reveal`, so the existing
  listener and reconciliation handle it unchanged. Optionally also index `ModelCommitted` for UI
  status, but it is not required for provenance sync.

Docs:
- Update the limitations/threat-model entry from "front-running is future work" to "front-running
  is mitigated by commit-reveal binding (modelHash, salt, msg.sender); residual cost is two
  signatures / two txs and the salt-custody requirement."

DONE WHEN: the seven+ commit-reveal tests pass; a full commit→reveal cycle on Fuji registers a
model and the listener syncs it within ~30s; the frontend two-step flow completes end to end; a
reveal from a different wallet than the committer reverts; docs reflect the mitigation.

Estimated effort (T9 only): ~3–5h.

---

## ACCEPTANCE CRITERIA (final gate — all must hold)
1. `pnpm --filter @handshake/contracts test` passes (≥8 cases) and prints a gas table.
2. Contract is verified on Snowtrace; ≥5 demo txs visible.
3. API boots; `GET /health/blockchain` returns lastSeenBlock; `blockchain_cursors` collection written.
4. New Fuji tx → matching Mongo doc updated (`onChainRegistered: true`, `blockchain` populated) within ~30s.
5. Golden path: upload → "Register on-chain" → wallet sign → pending UI → confirmed → Snowtrace link on detail.
6. Skip path: "Skip for now" → detail shows unverified + "Register" CTA.
7. Idempotency: same tx hash replayed → no duplicate Mongo record.
8. Restart: listener resumes from `lastSeenBlock`; txs sent during downtime are caught by the cron.
9. Lineage: `registerModel` with an unregistered parent reverts `ParentNotRegistered`; external (HF)
   parents are absent on-chain and present only in off-chain metadata; `reconstructLineage` returns
   the correct chain off-chain (no on-chain recursion).
10. No code, dependency, package, or branch reference to opML / inference verification was added.
11. Commit-reveal (T9): a full commit→reveal cycle registers a model; reveal in the same block
    reverts `CommitTooRecent`; reveal past `REVEAL_WINDOW` reverts `CommitExpired`; reveal from a
    non-committer wallet reverts; the frontend two-step signature flow completes; docs state the
    mitigation. (Only required if T9 is built; the plain registry T1–T8 is the must-ship core.)

---

## FILE REFERENCE
Modify (existing):
`pnpm-workspace.yaml`,
`apps/api/package.json`,
`apps/api/src/modules/models/{models.controller.ts, models.service.ts, models.repository.ts, schemas/model.schema.ts}`,
`apps/web/src/services/api.ts`,
`apps/web/src/components/upload/{wizardTypes.ts, Step5Summary.tsx}`,
`apps/web/src/app/(app)/registry/[id]/page.tsx`.

Create (contracts pkg):
`packages/contracts/{contracts/ModelRegistry.sol, test/ModelRegistry.test.ts, scripts/deploy.ts, hardhat.config.ts, package.json, abi/ModelRegistry.json, index.ts, deployments/avalancheFuji.json, .env.example, .gitignore}`.

Create (backend module):
`apps/api/src/modules/blockchain/{provider.service.ts, registry-listener.service.ts, reconciliation.cron.ts, lineage.service.ts, blockchain.module.ts, health.controller.ts, schemas/blockchain-cursor.schema.ts}`,
`apps/api/scripts/reconcile-blockchain.ts`.

Create (frontend):
`apps/web/src/hooks/useRegisterModel.ts`,
`apps/web/src/lib/contracts.ts`.

Reuse unchanged:
`IBlockchainRecord` (`packages/types/src/model/model.types.ts`),
`onChainRegistered` + `blockchain` fields in `model.schema.ts`,
`auth.guard.ts`,
`apps/web/src/lib/wagmi.ts`.
