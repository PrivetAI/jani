# Development Plan: Telegram Mini App + Bot (Janitor Role-Play)

## 0. Objectives & Guiding Principles
- Deliver a Russian-language Telegram Mini App that lets users pick rich-lore characters and continue role-play chats inside the companion bot.
- Guarantee conversation memory via rolling summaries and a sliding window of four message pairs; unlock episodic vector memory through Memory Pack or higher subscription tiers.
- Implement monetization around Telegram Stars (XTR) for subscriptions (Free/Plus/Pro/Ultra) and item packs (Story, Memory, Creator) plus shop consumables.
- Ship a local-only RU PWA for debugging with mocked Stars while the production bot + mini app process real Stars.
- Launch without voice features.

## 1. Monorepo Architecture
- Adopt Turborepo (pnpm) for workspace management. Services live under `/apps/*`; shared code under `/packages/*`; infra assets under `/infra`.
- Core apps (all NestJS/TypeScript unless noted):
  - `gateway`: REST API for Mini App + Admin.
  - `bot`: grammY-based webhook ingress.
  - `orchestrator`: worker handling prompt orchestration, streaming, and effects.
  - `persona`: content admin for characters, versions, and stories.
  - `billing`: Stars payments, subscriptions, entitlements.
  - `shop`: Catalog, inventory, and item effects.
  - `pwa`: React/Vite RU PWA with mocked payments (dev only).
- Shared packages:
  - `db`: Prisma schema/client, migrations, seeds.
  - `shared`: DTOs, schemas, constants.
  - `utils`: helpers (HMAC verify, Telegram utilities, OpenRouter client, etc.).
- Infra directory holds Docker Compose (Postgres + Redis) and optional Kubernetes manifests.

## 2. Environment & Tooling
- Root `.env.example` containing database, Redis, OpenRouter, Telegram webhook, and monetization settings. Emphasize `APP_MODE` (telegram|miniappprod|pwa-dev) and `PAYMENTS_MODE` (stars|mock) toggles.
- Local workflow:
  1. `docker compose -f infra/docker-compose.yml up -d` to boot Postgres + Redis.
  2. `pnpm install`, `pnpm db:migrate`, `pnpm db:seed` (seed RU characters, stories, items).
  3. Per-service `pnpm dev:<service>` scripts.
- Telegram integration: set webhook to `<ngrok>/bot/webhook?secret=...`; enforce initData HMAC verification inside gateway.

## 3. Database Planning (Prisma)
- Implement core models for users, characters, dialogs, messages, memory, monetization, and shop per supplied schema excerpt.
- Add pgvector extension and HNSW index for `MemoryEpisodic.embedding` in initial migration.
- Build seed loaders for characters, stories, items in `/packages/db/seeds/*.json` and ensure RU content.

## 4. API Contracts & Flows
### Gateway
- Endpoints: characters list/detail, dialog creation, quota status, entitlements, payments invoice, shop list/checkout/consume.
- Auth: Mini App via initData HMAC; PWA dev via signed cookie/dev token; return RU copy.
- Provide Swagger/OpenAPI docs for internal QA.

### Bot Ingress
- Receive updates at `/bot/webhook` with secret query guard; deduplicate by `update_id`.
- Queue incoming messages via BullMQ for orchestrator processing; support streaming responses with throttled `editMessageText`.
- Handle `pre_checkout_query`, `successful_payment`, inline buttons for purchases; interact with Billing + Shop.

### Orchestrator
- Compose prompts: persona → story directives → summary → four recent message pairs → optional vector memories.
- Manage OpenRouter SSE streaming with prompt caching; parse Action Protocol envelopes; apply actions (item offers/consumption/flags) via Shop/Billing services.
- Update dialog summary after assistant replies; decay time-limited effects.

### Persona Service (Admin)
- CRUD for characters, versions, stories; manage visibility/status.
- Version activation with system prompts, safety policies, model presets.

### Billing & Entitlements
- Generate Stars invoices (subscriptions + packs + items); record payments, entitlements, refunds.
- Enforce subscription tiers, quotas, and unlimited softcaps.

### Shop
- Provide catalog with tier discounts, ownership counts, checkout flows, consumption endpoints, and story gate resolution.

### PWA Dev App
- Mirror Mini App UI flows in Russian; highlight mocked payments banner; support offline shell via Service Worker.

### Admin Panel
- RU/EN interface for content, pricing, refunds, usage dashboards, and role-based access (admin/creator/viewer).

## 5. Monetization Logic
- Subscriptions: Free (tracked), Plus, Pro, Ultra with unlimited messaging (softcap env-driven). Each tier toggles vector memory depth, story access, discounts, speed priority.
- Packs: Story, Memory, Creator as one-off entitlements; integrate with gating logic.
- Shop Items: consumables, keys, boosters, cosmetics affecting story branches or model behavior; ensure item effects map to orchestrator actions.

## 6. Content Seeding
- Provide RU seed data for default characters (Арина Климова, Илья «Вектор» Силантьев) including arcs and story gating nodes.
- Seed items like "Кристалл Памяти", "Сюжетный Ключ: «Приют‑13»", and "Быстрый Проход" with pricing/discount metadata.
- Ensure seeds populate inventory prerequisites for demo flows.

## 7. Testing Strategy
- Unit tests: prompt composer, summary reducer, action envelope parser, quota math, HMAC validator.
- Integration tests: Stars payments (mock), OpenRouter SSE streaming, inventory consumption idempotency.
- E2E: Mini App dialog creation → bot chat → item gate purchase → branch continuation.
- Load: simulate 1k concurrent chats; validate throttled message edits and 429 backoff.

## 8. Work Breakdown (Epics & Key Tasks)
### Epic A — Repo, Infra, CI
1. Bootstrap Turborepo with pnpm, shared TS config, linting, and formatting.
2. Provision Docker Compose (Postgres, Redis) with health checks.
3. Author Prisma schema, migrations, and pgvector setup; connect to services via `/packages/db`.
4. Implement seeding pipeline for characters, stories, and items.
5. Configure CI (lint, test, build) with per-app artifacts and environment matrix.

### Epic B — Gateway API
1. Implement Telegram initData HMAC validator and dev auth middleware.
2. Scaffold REST endpoints for characters, dialogs, quotas, entitlements, payments, shop operations.
3. Integrate with Billing/Shop services; ensure RU responses.
4. Publish OpenAPI spec and add swagger UI for QA.

### Epic C — Bot Ingress
1. Configure grammY webhook with secret validation and dedup.
2. Pipe messages to orchestrator via BullMQ; implement streaming UX.
3. Handle Stars payment lifecycle (pre-checkout, success) and inline purchase callbacks.

### Epic D — Dialog Orchestrator
1. Build prompt composer using persona, story directives, summary, recent pairs, vector facts.
2. Implement OpenRouter SSE client with caching and throttled streaming to bot.
3. Develop action envelope parser + effect application (items, flags, offers).
4. Maintain dialog summaries, decay active effects, and persist messages.

### Epic E — Persona Service (Admin)
1. CRUD for characters, versions, stories with status/visibility controls.
2. Support version activation, safety policy editing, and model preset management.

### Epic F — Billing & Entitlements
1. Stars invoice generation for subscriptions/packs/items.
2. Subscription lifecycle (activation, renewal, cancellation, softcap).
3. Refund handling: revoke entitlements/inventory and notify users.
4. Quota service enforcing daily cap and unlimited logic.

### Epic G — Shop Service
1. Catalog endpoints with tier discounts and ownership counts.
2. Checkout orchestration with Billing; handle fulfillment + inventory updates.
3. Implement consume endpoint with idempotency and story gate resolution.

### Epic H — PWA Dev App
1. Build Vite React RU interface mirroring Mini App flows.
2. Mock payments when `PAYMENTS_MODE=mock`; add dev "Mark paid" tools.
3. Add manifest + Service Worker; display warning banner about real payments.

### Epic I — Admin Panel
1. Develop RU/EN admin UI for content, items, pricing, refunds.
2. Add dashboards (usage metrics, token costs, failures) and CSV export.
3. Implement role-based access (admin/creator/viewer).

### Epic J — Observability & Security
1. Instrument OpenTelemetry traces and Prometheus metrics across services.
2. Configure Pino logging with PII masking.
3. Apply rate limiting, OpenRouter circuit breakers, security headers, and secret management policy.

## 9. Acceptance Criteria Snapshot
- Prompt logs include persona → story → summary → last 4 pairs → optional vector facts per message.
- Daily quota enforced for non-subscribers with RU CTA; subscribers get unlimited (softcap monitored).
- Stars payment lifecycle recorded; refunds revoke entitlements/inventory.
- Purchasing "Сюжетный Ключ: «Приют‑13»" unlocks gated story nodes and resumes flow.
- "Кристалл Памяти" boosts vector retrieval (top-k +3) for exactly 10 messages via ActiveEffect TTL.
- PWA dev mode shows RU banner and mocks payments.

## 10. Deliverables & Documentation
- Working local stack with Docker Compose and pnpm scripts.
- Live Telegram bot webhook via ngrok.
- RU Mini App, PWA, and Admin panel.
- Seeded default content via scripts.
- API collection (Postman/Insomnia) and comprehensive README + RUNBOOK (payments/refunds/incident response).

## 11. Open Questions to Track
- Timeline for enabling Creator role in MVP?
- Confirm story access per tier (Plus partial Story Pack?).
- Finalize discount percentages per tier (current defaults acceptable until product review).

