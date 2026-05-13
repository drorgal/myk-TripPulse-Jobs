# node:24-slim is Debian-based (glibc) — Prisma binaries work without extra config.
# Alpine (musl libc) requires additional workarounds for Prisma's native binaries.

# ---- Stage 1: install dependencies ----
# Separate stage so dep install is cached unless package.json files change.
FROM node:24-slim AS deps

RUN apt-get update -y && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests first — Docker only re-runs this layer when they change.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json   ./packages/shared/package.json
COPY packages/db/package.json       ./packages/db/package.json
COPY packages/api/package.json      ./packages/api/package.json
COPY packages/worker/package.json   ./packages/worker/package.json

RUN pnpm install --frozen-lockfile

# ---- Stage 2: build ----
FROM deps AS builder

COPY . .

# Generate the Prisma client, then compile all packages
RUN pnpm db:generate && pnpm build

# ---- Stage 3: runtime ----
FROM node:24-slim AS runtime

RUN apt-get update -y && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

COPY --from=builder /app/node_modules        ./node_modules
COPY --from=builder /app/package.json        ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages/shared     ./packages/shared
COPY --from=builder /app/packages/db         ./packages/db
COPY --from=builder /app/packages/api        ./packages/api
COPY --from=builder /app/packages/worker     ./packages/worker
