# TripPulse Jobs — Claude Code Context

## What This Project Is

A distributed job processing and travel data aggregation backend. External travel provider APIs (car rentals, hotels, flights) are slow and rate-limited — this system decouples the request from the result using a job queue. The travel app (`myk-trip-plan`) only calls our local API; workers call external providers in the background.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design, component diagram, and 8-phase roadmap.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (strict) |
| API | Express |
| Job Queue | BullMQ + Redis |
| Database | PostgreSQL + Prisma ORM |
| Validation | Zod (schema = TypeScript type via `z.infer<>`) |
| Logging | pino + pino-pretty (dev) |
| Testing | Jest + ts-jest + supertest |
| Package Manager | pnpm workspaces |
| Infrastructure | Docker Compose |
| Observability | OpenTelemetry + Prometheus (Phase 7) |

---

## Monorepo Package Map

```
packages/
  shared/   @trippulse/shared   — Zod schemas, queue names, logger, error classes
  db/       @trippulse/db       — Prisma schema + PrismaClient singleton
  api/      @trippulse/api      — Express REST API
  worker/   @trippulse/worker   — BullMQ worker + providers
```

Import order: `shared` has no internal deps. `db` imports `shared`. `api` imports `shared` + `db`. `worker` imports `shared` + `db`.

---

## Coding Conventions

### TypeScript
- `strict: true` always — no exceptions
- `exactOptionalPropertyTypes: true` — `field?: T` means the field may be absent, not `T | undefined`
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`
- Path alias: `@trippulse/shared`, `@trippulse/db` etc. (via pnpm workspace symlinks)

### Schemas and Types
- **Always use Zod** for types that cross system boundaries (API requests, job payloads, provider responses)
- `type Foo = z.infer<typeof FooSchema>` — never write a type separately if a schema exists
- Runtime-validated data is the source of truth

### Money
- **Always store prices in cents (integer)** — `$45.00 = 4500`
- Never use `Float` for monetary values
- Display layer divides by 100

### Logging
- Use `createLogger(component)` from `@trippulse/shared` — never use `console.log`
- Always include `searchJobId` in log context for distributed tracing
- `pino-pretty` in dev, raw JSON in prod (parseable by Datadog/CloudWatch)

### Error Handling
- Throw `AppError` subclasses, not raw `Error`
- In workers: throw to trigger BullMQ retry. Mark non-retryable errors explicitly.
- In API controllers: use `next(err)` — never `res.send()` from catch blocks

### Providers
- Every provider implements `TravelProvider<TSearchParams, TNormalized>`
- Adding a provider = implement interface + register in `registry.ts` — nothing else changes
- Providers must be idempotent: same input = same output (or superset)
- Store `rawData` (raw provider response) alongside normalized data

### Idempotency
- Use `prisma.createMany({ skipDuplicates: true })` for offer inserts
- The `@@unique([searchJobId, providerName, providerOfferId])` constraint enforces deduplication
- Worker retries must be safe to re-run

---

## Development Workflow

```bash
# First time setup
cp .env.example .env
docker compose up -d          # Start PostgreSQL + Redis + Bull Board
pnpm install                  # Install all workspace dependencies
pnpm db:migrate               # Run Prisma migrations
pnpm db:seed                  # Insert sample data

# Daily development
docker compose up -d          # Ensure infrastructure is running
pnpm dev                      # Start API (port 3000) + Worker concurrently

# Database
pnpm db:migrate               # Apply pending migrations
pnpm db:studio                # Open Prisma Studio at localhost:5555

# Testing
pnpm test                     # Run all tests across workspaces
pnpm --filter @trippulse/api test   # Test a specific package

# Build
pnpm build                    # Compile all packages

# Reset
pnpm docker:reset             # Wipe DB + Redis volumes, restart containers
```

---

## Key Design Decisions (Always Respect These)

1. **API never calls external providers directly** — it only creates jobs and reads results
2. **Worker and API are separate processes** — never import worker internals into API
3. **Job payloads are minimal** — only `searchJobId` + `params` go into Redis, not full objects
4. **`params` is Json in DB** — flexible, not queryable by field, always queried by `jobId`
5. **Two-phase write**: create DB record first, enqueue second, update `bullJobId` third
6. **`Promise.allSettled` in processor** — one provider failing must not fail the entire job
7. **`PARTIAL` status** — some providers succeeded, some failed; result is still useful
8. **Throw in worker to trigger retry** — only throw if ALL providers failed

---

## REST API Contract

```
POST /jobs/car-search
  Body: CarSearchParams (Zod validated)
  Response 202: { jobId, status: 'PENDING', statusUrl, offersUrl, estimatedWaitMs }

GET /jobs/:id
  Response 200: { id, status, params, providers, offerCount, errorMessage, createdAt, completedAt }
  Response 404: { error: 'Job not found' }

GET /offers/cars
  Query: jobId (required), vehicleType?, maxPrice?, isAutomatic?, sortBy?, limit?, offset?
  Response 200: { offers: CarOffer[], total, jobStatus, pagination }

GET /health
  Response 200: { db: 'ok', redis: 'ok' }

GET /metrics
  Response 200: Prometheus text format
```

---

## Job Status Flow

```
PENDING → PROCESSING → COMPLETED   (all providers succeeded)
                     → PARTIAL     (some providers succeeded)
                     → FAILED      (all providers failed; BullMQ will retry)
```

If `FAILED` after all retries, BullMQ moves job to the failed set. The `SearchJob` record in DB retains the error message.

---

## Current Implementation Phase

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full 8-phase roadmap.

**Implemented phases**: _(updated as each phase completes)_  
**Current phase**: Phase 1 — Scaffolding

---

## Consumer App Context

`myk-trip-plan` (React + Zustand) expects:
- `ID = string` (cuid format)
- ISO 8601 datetime strings over the wire
- Prices in cents (display layer handles formatting)
- `vehicleType`: `"economy" | "compact" | "midsize" | "suv" | "van" | "luxury"`
- Locations as human-readable strings with optional `lat` / `lng`
