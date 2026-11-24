# Full-Stack IVR Delivery Confirmation

A small dashboard for telecallers: click **Call** on a delivery and an automated IVR call asks the
customer to confirm. The customer presses **1** / says **Yes**, or presses **2** / says **No**, and the
answer is saved against the delivery. The table updates automatically via polling.

## Features

- Deliveries dashboard with order ID, customer, `+91` phone, product, delivery date, confirmation
  status and last call time.
- Filter by status: Not called, Calling, Received, Not received, No answer / Failed.
- One-click outbound calls are queued in Redis/BullMQ; a worker places them with a configurable
  concurrency cap and rate limit, retries provider errors, and stores the provider call ID.
- IVR prompt with DTMF **and** speech input (English + Hindi), one repeat on timeout/invalid input,
  and a thank-you before hang-up.
- Provider webhooks record the response and call status (no answer, busy, failed), with a per-call log
  of time, duration, outcome, raw input and recording URL.
- Automatic dashboard refresh (SWR polling every 3 seconds).
- Bulk "Call selected" and an offline mock provider for development/demos.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, SWR |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 |
| Queue | Redis 7 + BullMQ worker |
| Telephony | Twilio (with a built-in mock provider) |

## Telephony provider: why Twilio

Twilio was chosen because:

- Its free trial can call **verified** Indian mobile numbers (`+91`), and verification is self-serve.
- TwiML provides a simple `<Gather input="dtmf speech">` with `en-IN` and `hi-IN` speech locales.
- Signed webhooks and status callbacks include duration and recording URLs, which map cleanly to the
  call log.
- It has excellent documentation and a mature Node SDK.

Trial limitations to be aware of:

- Trial accounts may only call phone numbers verified in the Twilio console.
- Indian carriers can mute or filter calls from international caller IDs. For reliable audio, use a
  Twilio India number or a verified caller ID where available.
- Local webhooks must be reachable publicly; use ngrok (or similar) during development.

## Quick start (mock mode — no Twilio account needed)

Requirements: Node.js 20+, npm, Docker.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migrate
npm run seed
npm run dev:api        # terminal 1 — http://localhost:4000
npm run dev:worker     # terminal 2 — processes the call queue
npm run dev:web        # terminal 3 — http://localhost:3000
```

Open <http://localhost:3000>. The mock provider simulates a call and posts to the same webhooks as
Twilio. Pick a **Mock outcome** in the toolbar (Received, Not received, No answer, Timeout) and click
**Call** to exercise each path. Seed data contains 15 deliveries across all five statuses.

`POST /api/deliveries/:id/call` responds immediately with `202` and a `jobId`; the worker then places
the call, so **Calling** means *queued/being attempted*, not necessarily already ringing.

Useful scripts: `npm test` (unit tests), `npm run build` (both packages). Data is persisted in the Docker
volumes `ivr-postgres-data` and `ivr-redis-data`.

## Environment variables

Copy `.env.example` to `.env` at the repository root. The API loads it automatically; the frontend
reads `NEXT_PUBLIC_API_BASE_URL` (set `apps/web/.env.local` if you need a different value).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/ivr_delivery` | Postgres connection string |
| `PORT` | `4000` | API port |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | Base URL Twilio/mock use for webhook callbacks. Must exactly match the URL configured in Twilio |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000` | API base URL used by the browser |
| `TELEPHONY_PROVIDER` | `mock` | `mock` or `twilio` |
| `MOCK_OUTCOME` | `received` | Default mock simulation result |
| `TWILIO_ACCOUNT_SID` | — | Required in Twilio mode |
| `TWILIO_AUTH_TOKEN` | — | Required in Twilio mode and for signature validation |
| `TWILIO_FROM_NUMBER` | — | Twilio number that places calls (E.164) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection used by BullMQ |
| `CALL_QUEUE_CONCURRENCY` | `2` | Max calls the worker places at once |
| `CALL_QUEUE_RATE_MAX` | `5` | Max call placements per rate window |
| `CALL_QUEUE_RATE_DURATION_MS` | `1000` | Rate-limit window in milliseconds |
| `CALL_RETRY_ATTEMPTS` | `3` | Total attempts before a failed placement is logged |
| `CALL_RETRY_DELAY_MS` | `5000` | Base exponential backoff delay |
| `COMPANY_NAME` | `Our Team` | Company name spoken in the IVR prompt |
| `WEBHOOK_VALIDATION` | `true` | Set to `false` only for local debugging in Twilio mode |

Never commit real credentials. `.env` and `.env.*` are gitignored (`.env.example` is not).

## Going live with Twilio

1. Create a Twilio trial account, verify **your own** Indian mobile number, and get a Twilio number.
2. Expose the API publicly, e.g. `ngrok http 4000`. Note the HTTPS URL.
3. In `.env`, set `TELEPHONY_PROVIDER=twilio`, `PUBLIC_BASE_URL=<ngrok url>`, the three `TWILIO_*`
   variables and `WEBHOOK_VALIDATION=true`. Restart **both** the API and the worker so they pick up
   the new provider and URL.
4. The webhook URLs are configured automatically per call by the worker:
   `POST {PUBLIC_BASE_URL}/webhooks/twilio/voice?deliveryId=...` (IVR prompt), `/gather` (response) and
   `/status` (call status). No manual console webhook configuration is required.
5. Click Call on a delivery whose phone is your verified number. Press 1, 2, or nothing to test the
   branches. Watch the table update and open **Log** to see the raw input, duration and recording link.

For deployment, run three processes against managed Postgres and Redis:

```bash
npm run build
npm run start:api       # API, public HTTPS URL = PUBLIC_BASE_URL
npm run start:worker    # can be scaled to multiple instances behind the same Redis
npm run start:web       # set NEXT_PUBLIC_API_BASE_URL to the API's public URL
```

Run `npm run migrate` (and optionally `npm run seed`) once during setup. Webhook endpoints must be
publicly reachable and must not be blocked by app-level auth; they are protected by Twilio signatures.

## Architecture note

```
Browser (Next.js, SWR polling every 3s)
        │  GET /api/deliveries?status=
        │  POST /api/deliveries/:id/call  → 202 { jobId }
        ▼
Express API ──► Redis / BullMQ queue ──► Worker (concurrency + rate limiter)
                                             │
                                             ▼
                                  telephony provider interface
                                             │
                                             ▼
                              Twilio REST (or mock simulator)
                                             │
        POST /webhooks/twilio/{voice,gather,status} ◄──────────┘
        ▼
Postgres: deliveries (status, last_call_at) + call_logs (per attempt: time, duration,
outcome, raw input, provider status, raw payload, recording URL)
```

Key decisions:

- The API only claims the delivery (`status = calling`) and enqueues a job, so click-to-call stays fast
  regardless of how many calls are pending. The worker is the only component that talks to the provider.
- Worker concurrency and rate limits are configurable (`CALL_QUEUE_CONCURRENCY`, `CALL_QUEUE_RATE_*`);
  you can run multiple worker processes to scale out while staying under provider limits.
- A provider call ID is stored on the BullMQ job *before* the DB write. If a retry happens, the worker
  reuses that ID instead of placing a duplicate call. After all retries fail, the delivery returns to
  its previous status and a failed call log is written.
- The provider interface keeps Twilio-specific code behind `placeCall`; the mock provider emits the
  same webhook payloads, so all business logic is shared and testable offline.
- Webhook requests are signature-checked with `TWILIO_AUTH_TOKEN` in Twilio mode; only mock mode can
  skip that check. Webhook URLs carry `deliveryId` as a fallback in case a callback beats the worker's
  call-log insert.
- Writes are keyed by `provider_call_id` and only transition `calling` deliveries, so duplicate or
  late callbacks cannot overwrite a customer's answer.
- An invalid key or timeout repeats the question once, then thanks the caller and ends the call.
- Speech recognition uses `en-IN hi-IN`; common English/Hindi yes/no words are normalised in
  `apps/api/src/ivr/mapping.ts`. DTMF is the reliable primary path.

## Assumptions

- Single-tenant demo for one telecaller; no authentication or role management is included.
- Phone numbers are stored in E.164 `+91` format and validated against that pattern in the schema.
- Delivery dates are displayed in IST (`Asia/Kolkata`); call times in the log are also IST.
- Trial accounts can only call verified numbers, and a public webhook URL is required for live calls.
- Speech recognition is best-effort (network and carrier dependent); keypress input is required.
- Failed/busy/no-answer calls share the single status "No answer / Failed", as specified.
- Call placement is at-least-once: the worker records the provider SID on the job to avoid duplicates
  on retry, but a provider-side duplicate cannot be ruled out in a crash between those two steps.
- Automatic retry of *unanswered* calls is not enabled; only failed *placements* are retried by the queue.
- Redis is required even in mock mode because both modes use the same queue.

## Repository layout

```
docker-compose.yml          Postgres 16 + Redis 7
.env.example                Environment template (no secrets)
apps/api/                   Express API, queue worker, schema, seed, providers, IVR webhooks, tests
apps/web/                   Next.js dashboard
```

## Verification performed

- `npm test` — 10 unit tests for input/status mapping and TwiML generation.
- `npm run build` — API type-check and Next.js production build.
- Mock-mode end-to-end run against Docker Postgres: click-to-call moved a delivery to Calling, then
  webhooks produced Received, No answer / Failed (no answer and timeout) and recorded duration/raw
  input; status filtering and bulk calling returned correct results; dashboard served HTTP 200.
- Queued-flow run: six calls with mixed outcomes were enqueued in ~134 ms total; the worker processed
  them with the configured limits and every delivery ended with the expected status and call log.
- Live Twilio calling was not performed because it requires your trial credentials, a verified phone
  number and a public webhook URL.
