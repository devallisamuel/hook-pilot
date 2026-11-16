# Hook Pilot

[![CI](https://github.com/devallisamuel/hook-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/devallisamuel/hook-pilot/actions/workflows/ci.yml)
[![Release image](https://github.com/devallisamuel/hook-pilot/actions/workflows/release.yml/badge.svg)](https://github.com/devallisamuel/hook-pilot/actions/workflows/release.yml)

Reliable **webhook delivery** — send an event once, and Hook Pilot fans it out to every subscribed endpoint, records exactly what happened, and lets you replay anything that didn't arrive.

**Stack:** NestJS · CQRS (`@nestjs/cqrs`) · PostgreSQL (TypeORM) · BullMQ via `@nestjs/bullmq` (Redis) · Docker · GitHub Actions · Terraform (AWS ECS Fargate, RDS, ElastiCache)

## Features

- **Fan-out with filters** — endpoints subscribe to exact types (`invoice.paid`), prefixes (`invoice.*`) or everything.
- **Clear delivery states** — `PENDING` → `PROCESSING` → `SUCCESSFUL` (2xx), `FAILED` (any other answer) or `UNCERTAIN` (no answer after 3 retries).
- **Replay** — `FAILED` and `UNCERTAIN` deliveries can be sent again; the same row goes back to `PENDING`.
- **Last request and response on every delivery** — headers sent, status code, truncated response body, error and latency, alongside an attempt count.
- **Idempotent ingest** — `Idempotency-Key` header (or body field) de-duplicates event creation.
- **SSRF protection** — private, loopback, link-local (cloud metadata) and reserved addresses are refused, checked against the *connected* IP so DNS rebinding can't bypass it. Redirects are never followed.
- **Crash-safe** — Postgres is the source of truth; a recovery sweep recovers lost queue jobs and deliveries stranded by a crashed worker.

## Architecture

```
 POST /v1/events ──▶ API: save event + one delivery per endpoint as PENDING ──▶ enqueue (1 job, attempts: 1)
                                                                                   │
 Worker ◀──────────────────────────────── job ─────────────────────────────────────┘
   PENDING ──▶ PROCESSING ──▶ POST to the endpoint
                                 ├─ 2xx answer ............................▶ SUCCESSFUL
                                 ├─ any other answer (400, 404, 500...) ...▶ FAILED
                                 └─ no answer / timeout ─▶ retry, up to 3 times
                                                           still no answer ▶ UNCERTAIN

 POST /v1/deliveries/:id/replay (FAILED or UNCERTAIN) ──▶ back to PENDING ──▶ enqueue again
```

- `UNCERTAIN` means "we don't know if it arrived": the call timed out, so the endpoint may or may not have processed it. That's why it can be replayed, and why receivers should de-duplicate on `webhook-id` (the event ID, the same on every call and replay).
- Every state change happens in Postgres; the queue job only carries the delivery ID. Moving `PENDING` → `PROCESSING` is a single conditional update, so the same delivery can't be sent twice at once.
- A **recovery sweep** runs in the workers: a delivery stuck in `PROCESSING` (its worker died mid-call) becomes `UNCERTAIN`, and a `PENDING` delivery that never reached the queue is queued again.
- `api` and `worker` are separate entrypoints so they scale independently. Set `RUN_WORKER_IN_API=true` to run both in one process for small deployments.

### Layers (DDD + CQRS)

The code is split into four layers. Dependencies only point inwards: `presentation` and `infrastructure` depend on `application`, which depends on `domain`. The domain has no NestJS, TypeORM or BullMQ imports.

```
src/
  domain/                         # Entities, value objects, repository interfaces. Pure TypeScript.
    endpoint/   endpoint.ts                Entity: URL + event filter, soft delete, wants(type)
                endpoint-url.ts            Value object: http(s) only, no credentials, SSRF rules
                event-type-filter.ts       Value object: `invoice.*`, `user.created`, `*`
                endpoint.repository.ts     Port (abstract class)
    event/      webhook-event.ts           Entity: type + payload, builds the webhook body
                event-type.ts              Value object: `invoice.paid`
                event.repository.ts        Port
    delivery/   delivery.ts                Entity: the PENDING → PROCESSING → … life cycle
                delivery-status.ts         Status enum + which statuses can be replayed
                call-result.ts             Value objects for request/response + outcome rules
                delivery.repository.ts     Port
    shared/     domain-error.ts, id.ts, page.ts

  application/                    # Use cases: one command or query per file (class + handler)
    endpoints/  commands/ create, update, delete, send-test-event   queries/ get, list
    events/     commands/ publish-event                             queries/ get, list
    deliveries/ commands/ process-delivery, replay-delivery, recover-stuck-deliveries
                queries/  get, list
                events/   deliveries-scheduled (domain event + handler that queues them)
    ports/      delivery-queue.ts, webhook-sender.ts   # implemented by infrastructure
    settings.ts, handlers.ts

  infrastructure/                 # Adapters to the outside world
    persistence/  entities/*.record.ts (TypeORM), mappers.ts, repositories/typeorm-*.ts,
                  migrations/, migration-runner.ts, paginate.ts
    queue/        bullmq-delivery.queue.ts (DeliveryQueue), delivery.worker.ts (@Processor), redis.ts
    http/         http-webhook-sender.ts (WebhookSender), http-sender.ts
    scheduling/   recovery.scheduler.ts
    config/       config.ts
    infrastructure.module.ts      # binds every port to its implementation

  presentation/http/              # Controllers + request/response DTOs; maps domain errors to 400/404/409
  app.module.ts                   # composition root; main.ts (API) and worker.ts (worker) entrypoints
```

**CQRS flow.** Controllers do no work: they turn the request into a **command** (a write) or a **query** (a read) and send it to the bus. Saving deliveries raises a **domain event**, and a separate handler puts them on BullMQ, so saving and queueing are decoupled. The queue worker is just another entry point: each job becomes a `ProcessDeliveryCommand`.

```
HTTP ─▶ Controller ─┬─▶ CommandBus ─▶ PublishEventHandler ──(1 transaction)──▶ Postgres
                    │                        └─▶ EventBus: DeliveriesScheduledEvent
                    │                                     └─▶ EnqueueScheduledDeliveriesHandler ─▶ BullMQ
                    └─▶ QueryBus ───▶ GetDeliveryHandler ──────────────────────▶ Postgres

BullMQ job ─▶ DeliveryWorker ─▶ CommandBus ─▶ ProcessDeliveryHandler ─▶ WebhookSender ─▶ endpoint
```

| Area | Commands | Queries | Events |
| --- | --- | --- | --- |
| Endpoints | `CreateEndpoint`, `UpdateEndpoint`, `DeleteEndpoint`, `SendTestEvent` | `ListEndpoints`, `GetEndpoint` | |
| Events | `PublishEvent` | `ListEvents`, `GetEvent` | raises `DeliveriesScheduled` |
| Deliveries | `ProcessDelivery`, `ReplayDelivery`, `RecoverStuckDeliveries` | `ListDeliveries`, `GetDelivery` | `DeliveriesScheduled` → queue |

If queueing fails (for example, Redis is briefly down), the event is still accepted: the deliveries are already saved as `PENDING`, and the recovery sweep queues them later.

## Quick start

Requires Node 18.18+ and Docker.

```bash
npm install
cp .env.example .env
npm run infra:up          # Postgres on :55432, Redis on :56379
npm run dev               # API on :4000, migrations run on boot
npm run dev:worker        # in another terminal
```

Interactive API docs: http://localhost:4000/docs

Or run everything in containers: `docker compose --profile app up --build`.

## Usage

```bash
# 1. Register an endpoint.
curl -X POST localhost:4000/v1/endpoints -H 'content-type: application/json' \
  -d '{"url":"https://example.com/webhooks","eventTypes":["invoice.*"]}'

# 2. Publish an event.
curl -X POST localhost:4000/v1/events -H 'content-type: application/json' \
  -H 'idempotency-key: invoice-123-paid' \
  -d '{"type":"invoice.paid","payload":{"invoiceId":"inv_123","amount":4200}}'

# 3. Inspect and replay.
curl localhost:4000/v1/deliveries?status=UNCERTAIN
curl -X POST localhost:4000/v1/deliveries/$DELIVERY_ID/replay
```

### API

| Method | Path | Description |
| --- | --- | --- |
| `POST/GET` | `/v1/endpoints` | Create / list endpoints |
| `GET/PATCH/DELETE` | `/v1/endpoints/:id` | Read / update (`url`, `description`, `eventTypes`) / delete |
| `POST` | `/v1/endpoints/:id/test` | Send a `hookpilot.test` event to one endpoint |
| `POST/GET` | `/v1/events` | Publish / list events (`?type=`) |
| `GET` | `/v1/events/:id` | Event with its deliveries |
| `GET` | `/v1/deliveries` | List (`?status=`, `endpointId`, `eventId`) |
| `GET` | `/v1/deliveries/:id` | Delivery with its latest request and response |
| `POST` | `/v1/deliveries/:id/replay` | Send a `FAILED` or `UNCERTAIN` delivery again |
| `GET` | `/health` | Database + Redis health |

Lists are newest-first with cursor pagination: `?limit=20&cursor=<nextCursor>`.

## What your endpoint receives

```http
POST /webhooks HTTP/1.1
content-type: application/json
webhook-id: evt_3f9a…
hookpilot-event-type: invoice.paid
hookpilot-delivery-id: dlv_8c1e…
hookpilot-attempt: 1

{"id":"evt_3f9a…","type":"invoice.paid","timestamp":"2026-11-14T08:00:00.000Z","data":{"invoiceId":"inv_123","amount":4200}}
```

Respond with any `2xx` within the timeout (default 10s). `webhook-id` is the event ID and stays the same across retries and replays, so use it to ignore duplicates.

## Configuration

See [`.env.example`](.env.example). Key settings:

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL`, `REDIS_URL` | — | Required |
| `ALLOW_PRIVATE_NETWORKS` | `false` | Only enable for local development |
| `DELIVERY_TIMEOUT_MS` | `10000` | How long to wait for one call |
| `DELIVERY_RETRIES` | `3` | Extra calls when the endpoint doesn't answer, before `UNCERTAIN` |
| `DELIVERY_RETRY_DELAY_MS` | `2000` | Pause between those retries |
| `WORKER_CONCURRENCY` | `20` | Concurrent deliveries per worker |
| `RUN_MIGRATIONS` | `true` | API runs migrations at boot under an advisory lock |

## Testing

```bash
npm test             # unit tests (no infrastructure)
npm run infra:up
npm run test:e2e     # full API + worker against real Postgres/Redis and a local receiver
```

## CI/CD

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | Push to `main`, pull requests | Typecheck, unit tests with coverage, build; end-to-end tests against Postgres and Redis service containers; Docker build; `terraform fmt` + `validate` |
| [`release.yml`](.github/workflows/release.yml) | Push to `main`, `v*` tags | Builds and publishes the image to `ghcr.io/devallisamuel/hook-pilot` |
| [`deploy.yml`](.github/workflows/deploy.yml) | Manual | Builds and pushes to ECR, applies Terraform for `staging` or `production`, smoke-tests `/health` |

## Deployment

[`infra/terraform`](infra/terraform) deploys to AWS: a VPC across two availability zones, ECS Fargate services for the API (behind an ALB) and the workers, each with CPU autoscaling, RDS Postgres, ElastiCache Redis with TLS, Secrets Manager and ECR. See its [README](infra/terraform/README.md) for setup.

The published image runs anywhere containers do:

```bash
docker run --env-file .env -p 4000:4000 ghcr.io/devallisamuel/hook-pilot:latest                     # API
docker run --env-file .env ghcr.io/devallisamuel/hook-pilot:latest node dist/worker.js              # worker
```

## Roadmap

- Signed webhooks (HMAC) so receivers can verify the sender
- Per-endpoint delivery throttling
- Auto-disable endpoints after sustained failure, with notifications
- Data retention jobs for events and deliveries
- Dashboard UI and a TypeScript SDK

## License

MIT
