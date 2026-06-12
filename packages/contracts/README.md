# @handshake/contracts — On-chain Model Registry (Phase 2)

`ModelRegistry` anchors the canonical model record — `modelHash` (blake3 of the manifest JSON),
`owner`, the metadata pointer (`metadataCID`), and in-registry `parents` — immutably on
**Avalanche Fuji** (chainId `43113`). On-chain is the source of truth; MongoDB is a reconciled cache.

License, version, tags, lifecycle (`isActive`) and **external** (HuggingFace) lineage stay
off-chain in the IPFS metadata / Mongo by design (Decisions A, B, C, L).

## Layout

```
contracts/ModelRegistry.sol     the contract (registerModel + commit/reveal + 2-step ownership)
test/ModelRegistry.test.ts      19 cases incl. commit-reveal; prints the gas table
scripts/deploy.ts               deploy + write deployments/<network>.json + Snowtrace verify
scripts/demo-seed.ts            seed the §7 demo dataset (3 base + 2 derived + transfer + update)
scripts/extract-abi.js          artifact ABI -> abi/ModelRegistry.json (committed, app-facing)
abi/ModelRegistry.json          shared ABI, re-exported by index.ts
deployments/avalancheFuji.json  { chainId, address } — filled by deploy
index.ts                        exports ModelRegistryAbi, getRegistryAddress, toCanonicalHash, toBytes32
```

## Develop

```bash
pnpm --filter @handshake/contracts compile   # zero-warning compile (solc 0.8.24)
pnpm --filter @handshake/contracts test      # 19 passing + gas table
```

## Deploy + verify (Fuji)

1. `cp packages/contracts/.env.example packages/contracts/.env` and set `DEPLOYER_PRIVATE_KEY`
   (an EOA funded from the [Fuji faucet](https://faucet.avax.network/)) and `SNOWTRACE_API_KEY`.
2. Deploy (also writes `deployments/avalancheFuji.json` and attempts Snowtrace verification):
   ```bash
   pnpm --filter @handshake/contracts deploy:fuji
   pnpm --filter @handshake/contracts extract-abi   # refresh the shared ABI
   ```
3. Point the apps at it: set `MODEL_REGISTRY_ADDRESS` (and optionally `MODEL_REGISTRY_DEPLOY_BLOCK`)
   in the **repo-root `.env`**. The web app also resolves the address from the committed
   `deployments/avalancheFuji.json` via `getRegistryAddress(43113)`.
4. Seed the evaluation dataset and record tx hashes:
   ```bash
   pnpm --filter @handshake/contracts demo:fuji
   ```

> A local end-to-end dry run (no faucet needed) is available via `pnpm --filter @handshake/contracts node`
> in one shell, then `deploy:local` + `demo:local` in another.

### Deployment record (fill in after deploying)

| Field | Value |
| --- | --- |
| Contract address | `<deploy:fuji output>` |
| Snowtrace (verified) | `https://testnet.snowtrace.io/address/<address>#code` |
| Demo txs | see `deployments/demo-avalancheFuji.json` (≥5 tx hashes) |

## Gas (from `hardhat test`, solc 0.8.24, optimizer runs=200)

| Method | Gas |
| --- | --- |
| `registerModel` (0 parents) | 160,912 |
| `registerModel` (3 parents) | ~233,000 |
| `registerModel` (8 parents) | 387,536 |
| `commit` | 45,669 |
| `reveal` (fresh registration) | ~162,158 |
| `updateMetadata` | 35,760 |
| `transferOwnership` | 50,769 |
| `acceptOwnership` | 31,388 |
| Deployment | 819,681 |

## Threat model — ownership front-running (mitigated)

`registerModel(modelHash, …)` is first-come: `msg.sender` becomes the owner. Because `modelHash` is
public in the mempool, a bot can observe a pending `registerModel` and **front-run** it, claiming the
hash from another wallet before the original tx mines.

This is **mitigated** by a two-step **commit-reveal** that binds the committer:

1. `commit(keccak256(abi.encode(modelHash, salt, msg.sender)))` — a sealed commitment. `salt` is a
   client-side random 32 bytes, kept off-chain.
2. `reveal(modelHash, metadataCID, parents, salt)` — must land in a **later block** than the commit
   (`CommitTooRecent` otherwise) and within `REVEAL_WINDOW` (240 blocks; `CommitExpired` otherwise).

Because the commitment includes `msg.sender`, an observer who copies the commitment cannot reveal
against it: their reveal recomputes a commitment with **their** address and reverts `NoCommitment`.
The direct `registerModel` path remains available (and is exposed in the UI behind an "Advanced:
one-step" toggle) but is documented as front-runnable.

**Residual cost:** two signatures / two transactions, and client-side **salt custody** — clearing
site data before the reveal forfeits the commit (gas is spent; re-commit after the window). The
frontend persists `{ salt, commitment }` to `localStorage` (`handshake:commit:<modelHash>`) *before*
sending the commit and warns the user not to clear site data mid-flow.

## Lineage (scope limitation)

On-chain `parents` are **in-registry only**: `registerModel`/`reveal` revert `ParentNotRegistered`
if a listed parent is not itself registered (Decision L). External base models (HuggingFace, etc.)
are **not** placed on-chain — they live only in the off-chain metadata. There is intentionally **no**
on-chain `getLineage`: a recursive walk (depth × `MAX_PARENTS`) is exponential and would exceed
`eth_call` gas. The full DAG is reconstructed **off-chain** by walking immediate `parents` hop-by-hop
and verifying each edge with `getModel` (Decision M, `apps/api` `LineageService`).

## Backend sync (apps/api `modules/blockchain`)

A WebSocket listener (`AVALANCHE_FUJI_WS`) plus a 60s `getLogs` reconciliation cron keep Mongo in
sync with `ModelRegistered` events; the WS auto-reconnects and re-subscribes, with the cron as the
guaranteed backstop. `GET /health/blockchain` reports `{ lastSeenBlock, wsConnected, contractAddress }`.
`pnpm --filter @handshake/api reconcile:blockchain` runs a manual full re-scan. Both `registerModel`
and the commit-reveal `reveal` emit `ModelRegistered`, so no listener change is needed for either path.
