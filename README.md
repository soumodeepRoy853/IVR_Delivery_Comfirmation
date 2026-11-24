# Full-Stack IVR Delivery Confirmation

A small dashboard for telecallers: click **Call** on a delivery and an automated IVR call asks the
customer to confirm. The customer presses **1** / says **Yes**, or presses **2** / says **No**, and the
answer is saved against the delivery. The table updates automatically via polling.

## Features

- Deliveries dashboard with order ID, customer, `+91` phone, product, delivery date, confirmation
  status and last call time.
- Filter by status: Not called, Calling, Received, Not received, No answer / Failed.
- One-click outbound calls; provider call ID is stored and the status moves to Calling.
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
npm run dev:web        # terminal 2 — http://localhost:3000
```

Open <http://localhost:3000>. The mock provider simulates a call and posts to the same webhooks as
Twilio. Pick a **Mock outcome** in the toolbar (Received, Not received, No answer, Timeout) and click
**Call** to exercise each path. Seed data contains 15 deliveries across all five statuses.

Useful scripts: `npm test` (unit tests), `npm run build` (both packages). The database is persisted in
the Docker volume `ivr-postgres-data`.

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
| `COMPANY_NAME` | `Our Team` | Company name spoken in the IVR prompt |
| `WEBHOOK_VALIDATION` | `true` | Set to `false` only for local debugging in Twilio mode |

Never commit real credentials. `.env` and `.env.*` are gitignored (`.env.example` is not).

## Going live with Twilio

1. Create a Twilio trial account, verify **your own** Indian mobile number, and get a Twilio number.
2. Expose the API publicly, e.g. `ngrok http 4000`. Note the HTTPS URL.
3. In `.env`, set `TELEPHONY_PROVIDER=twilio`, `PUBLIC_BASE_URL=<ngrok url>`, the three `TWILIO_*`
   variables and `WEBHOOK_VALIDATION=true`. Restart the API.
4. In Twilio's console the webhook URLs are configured automatically per call by the API:
   `POST {PUBLIC_BASE_URL}/webhooks/twilio/voice` (IVR prompt), `/gather` (response) and `/status`
   (call status). No manual console webhook configuration is required.
5. Click Call on a delivery whose phone is your verified number. Press 1, 2, or nothing to test the
   branches. Watch the table update and open **Log** to see the raw input, duration and recording link.

## Architecture note

```
Browser (Next.js, SWR polling every 3s)
        │  GET /api/deliveries?status=
        │  POST /api/deliveries/:id/call
        ▼
Express API ──► telephony provider interface ──► Twilio REST (or mock simulator)
        │                                              │
        │  POST /webhooks/twilio/{voice,gather,status} ◄┘
        ▼
Postgres: deliveries (status, last_call_at) + call_logs (per attempt: time, duration,
outcome, raw input, provider status, raw payload, recording URL)
```

Key decisions:

- The provider interface keeps Twilio-specific code behind `placeCall`; the mock provider emits the
  same webhook payloads, so all business logic is shared and testable offline.
- Webhook requests are signature-checked with `TWILIO_AUTH_TOKEN` in Twilio mode.
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
- Automatic retry is not enabled by default; it can be added on top of the status callback.

## Repository layout

```
docker-compose.yml          Postgres 16
.env.example                Environment template (no secrets)
apps/api/                   Express API, schema, seed, providers, IVR webhooks, tests
apps/web/                   Next.js dashboard
```

## Verification performed

- `npm test` — 10 unit tests for input/status mapping and TwiML generation.
- `npm run build` — API type-check and Next.js production build.
- Mock-mode end-to-end run against Docker Postgres: click-to-call moved a delivery to Calling, then
  webhooks produced Received, No answer / Failed (no answer and timeout) and recorded duration/raw
  input; status filtering and bulk calling returned correct results; dashboard served HTTP 200.
- Live Twilio calling was not performed because it requires your trial credentials, a verified phone
  number and a public webhook URL.
