# @handshake/e2e-seed-pipeline

Seeds curated Hugging Face model metadata into Handshake through the normal API path, then anchors each API-created model on Fuji with `ModelRegistry.registerModel`.

The v1 fetcher downloads only small allowlisted repository files such as model cards, configs, tokenizers, and preprocessing metadata. Weight files are ignored by default and every selected file set is bounded by `SEED_HF_MAX_BYTES_PER_MODEL`.

## Commands

Run from the repo root:

```sh
pnpm seed:hf-fetch -- --dry-run
pnpm seed:all -- --dry-run
pnpm seed:fund
pnpm seed:api
pnpm seed:onchain
pnpm seed:verify
```

`seed:all` runs funding, Hugging Face fetch/staging, API creation, on-chain registration, and verification.

`seed:all -- --dry-run` does not require secrets. If `SEED_MNEMONIC` is missing, it uses the public test mnemonic `test test test test test test test test test test test junk` only for wallet and DTO planning.

## Required Environment

```sh
SEED_MNEMONIC=
SEED_TREASURY_PRIVATE_KEY=
SEED_MODEL_COUNT=25
SEED_API_URL=http://localhost:4000
SEED_CLIENT_URL=http://localhost:3000
SEED_REGISTRY_ADDRESS=
SEED_RPC_URL=
SEED_HF_TOKEN=
SEED_HF_MAX_BYTES_PER_MODEL=5000000
SEED_CONCURRENCY=3
```

`SEED_REGISTRY_ADDRESS` defaults to the Fuji deployment exported by `@handshake/contracts`. `SEED_RPC_URL` defaults to `AVALANCHE_FUJI_RPC`, then Fuji's public RPC.

## Outputs

Generated files are written under `.seed-output/` and ignored by git:

- `hf-cache/`: staged Hugging Face files and bundle files
- `wallets.json`: derived wallet indexes, paths, and addresses only
- `seed-report.jsonl`: append-only event report
- `seed-state.json`: API and on-chain records used by later stages
