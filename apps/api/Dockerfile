# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

FROM base AS pruner

RUN pnpm add --global turbo@2.8.21

COPY . .

RUN turbo prune @handshake/api --docker

FROM base AS builder

COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

RUN pnpm turbo run build --filter=@handshake/api...

FROM base AS runner

ENV NODE_ENV="production"
ENV PORT="4000"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/types/package.json packages/types/package.json

RUN --mount=type=cache,id=pnpm-prod,target=/pnpm/store pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages/config/dist packages/config/dist
COPY --from=builder /app/packages/types/dist packages/types/dist
COPY --from=builder /app/packages/contracts/dist packages/contracts/dist
COPY --from=builder /app/packages/contracts/abi packages/contracts/abi
COPY --from=builder /app/packages/contracts/deployments packages/contracts/deployments

EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
