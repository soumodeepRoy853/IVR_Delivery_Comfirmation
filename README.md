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
- Dashboard API protected by HTTP Basic auth; the browser talks only to the Next.js server, which
  holds the credentials.
- Recordings streamed through the API, so "Listen" works without Twilio's basic-auth popup.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, SWR |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 |
| Telephony | Twilio (with a built-in mock provider) |

## Telephony provider: why Twilio

Twilio was chosen because:

- Its free trial can call **verified** Indian mobile numbers (`+91`), and verification is self-serve.
- TwiML provides a simple `<Gather input="dtmf speech">` with multi-language speech recognition
  (English + Hindi) via the Deepgram nova-3 model.
- Signed webhooks and status callbacks include duration and recording URLs, which map cleanly to the
  call log.
- It has excellent documentation and a mature Node SDK.

Trial limitations to be aware of:

- Trial accounts may only call phone numbers verified in the Twilio console.
- Personal Indian mobile numbers can be verified as Caller IDs but are often on Twilio's
  do-not-originate (DNO) list, so they cannot be used as `From`. Buy a Twilio voice number instead.
- Indian carriers can mute or filter calls from international caller IDs. For reliable audio, use a
  Twilio India number where available.
- Webhooks must be publicly reachable; use ngrok locally and a real HTTPS domain in production.

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
Twilio. Set `MOCK_OUTCOME` to `received`, `not_received`, `no_answer` or `timeout` in `.env` and click
**Call** to exercise each path. Seed data contains 15 deliveries across all five statuses.

With the example `.env`, API auth is enabled using `DASHBOARD_USER=admin` /
`DASHBOARD_PASSWORD=change-me`; the Next.js server sends those credentials for you, so no browser
popup appears. Leave both values empty to disable auth purely for local debugging.

Useful scripts: `npm test` (unit tests), `npm run build` (both packages). The database is persisted in
the Docker volume `ivr-postgres-data`.

## Environment variables

Copy `.env.example` to `.env` at the repository root. The API loads it automatically; the frontend
reads `NEXT_PUBLIC_API_BASE_URL` (set `apps/web/.env.local` if you need a different value).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/ivr_delivery` | Postgres connection string |
| `PORT` | `4000` | API port |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | Public API URL used in webhook callbacks. Must exactly match the external URL and have no trailing slash |
| `API_BASE_URL` | `http://localhost:4000` | Server-side URL the Next.js dashboard uses to reach the API |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | unset locally, required in production | Basic-auth credentials for `/api/*`; webhooks are exempt |
| `WEB_ORIGIN` | unset locally, required in production | Allowed browser origin for CORS |
| `TELEPHONY_PROVIDER` | `mock` | `mock` or `twilio` |
| `MOCK_OUTCOME` | `received` | Default mock simulation result |
| `TWILIO_ACCOUNT_SID` | — | Required in Twilio mode |
| `TWILIO_AUTH_TOKEN` | — | Required in Twilio mode, signature validation and recording streaming |
| `TWILIO_FROM_NUMBER` | — | Twilio-owned voice number that places calls (E.164) |
| `COMPANY_NAME` | `Our Team` | Company name spoken in the IVR prompt |
| `WEBHOOK_VALIDATION` | `true` | Set to `false` only for local debugging in Twilio mode |

`NEXT_PUBLIC_API_BASE_URL` is no longer used: the dashboard calls same-origin Next.js route handlers,
which forward to the API with the credentials above.

Never commit real credentials. `.env` and `.env.*` are gitignored (`.env.example` is not).

## Going live with Twilio

1. Buy a **Twilio-owned voice number** and put it in `TWILIO_FROM_NUMBER`. Personal Indian mobiles
   may be verified as Caller IDs but are commonly blocked by Twilio's DNO list.
2. Upgrade the Twilio account so calls to arbitrary customer numbers are allowed. On a trial account
   only verified destinations work.
3. Expose the API on a public HTTPS domain (or use ngrok locally). Set `PUBLIC_BASE_URL` to that exact
   URL, e.g. `https://api.example.com`.
4. Set `TELEPHONY_PROVIDER=twilio`, the three `TWILIO_*` variables and `WEBHOOK_VALIDATION=true`.
5. Webhook URLs are set per call by the API:
   `POST {PUBLIC_BASE_URL}/webhooks/twilio/voice` (IVR prompt), `/gather` (response) and `/status`
   (call status). No manual console webhook configuration is required.
6. Click Call on a delivery whose phone is a number you can answer. Press 1, 2, or nothing to test the
   branches. Open **Log** for duration, raw input and the proxied recording link.

## Production deployment

Use the included production images:

```bash
# 1. Set real values in .env (see .env.example), including DASHBOARD_USER,
#    DASHBOARD_PASSWORD, WEB_ORIGIN, PUBLIC_BASE_URL and Twilio credentials.
docker compose -f docker-compose.prod.yml up -d --build

# 2. Apply the schema once against the production database.
docker compose -f docker-compose.prod.yml exec api node apps/api/dist/migrate.js
```

The API listens on `:4000` and the dashboard on `:3000`. Put both behind a TLS reverse proxy:

- `https://api.example.com/*` → `api:4000` (webhooks are public and signature-checked)
- `https://example.com/*` → `web:3000` (dashboard; add your proxy-level auth if desired)

In the web service, `API_BASE_URL` defaults to `http://api:4000` in the compose file. The browser
only talks to `https://example.com/api/*`; Next.js route handlers forward those calls to the API
with Basic auth, so credentials never enter the browser bundle. `/api/recording/:callId` is proxied
the same way and streams audio from Twilio using the auth token on the server.

If deploying to separate platforms (for example Vercel + Render), set these server-side variables
on the web service: `API_BASE_URL`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`. The API service needs
`DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `WEB_ORIGIN` and `NODE_ENV=production`.

## Architecture note

```
Browser (Next.js, SWR polling every 3s)
        │  same-origin /api/*  → Next.js route handlers (add Basic auth server-side)
        ▼
Express API ──► telephony provider interface ──► Twilio REST (or mock simulator)
        │  /api/* protected by DASHBOARD_USER / DASHBOARD_PASSWORD
        │  /webhooks/twilio/* public, signature-checked
        │                                              │
        │  POST /webhooks/twilio/{voice,gather,status} ◄┘
        ▼
Postgres: deliveries (status, last_call_at) + call_logs (per attempt: time, duration,
outcome, raw input, provider status, raw payload, recording URL)
        │
        └─ /api/recordings/:callId streams Twilio audio with server-side credentials
```

Key decisions:

- The provider interface keeps Twilio-specific code behind `placeCall`; the mock provider emits the
  same webhook payloads, so all business logic is shared and testable offline.
- Webhook requests are signature-checked with `TWILIO_AUTH_TOKEN` in Twilio mode.
- Writes are keyed by `provider_call_id` and only transition `calling` deliveries, so duplicate or
  late callbacks cannot overwrite a customer's answer.
- An invalid key or timeout repeats the question once, then thanks the caller and ends the call.
- Speech recognition uses `language="multi"` with `speechModel="deepgram_nova-3"`; common
  English/Hindi yes/no words are normalised in `apps/api/src/ivr/mapping.ts`. DTMF is the reliable
  primary path.

## Assumptions

- Single shared dashboard login via `DASHBOARD_USER` / `DASHBOARD_PASSWORD`; there are no per-user roles.
- Phone numbers are stored in E.164 `+91` format and validated against that pattern in the schema.
- Delivery dates are displayed in IST (`Asia/Kolkata`); call times in the log are also IST.
- Trial accounts can only call verified numbers, and a public webhook URL is required for live calls.
- Speech recognition is best-effort (network and carrier dependent); keypress input is required.
- Failed/busy/no-answer calls share the single status "No answer / Failed", as specified.
- Automatic retry is not enabled by default; it can be added on top of the status callback.

## Repository layout

```
docker-compose.yml          Local Postgres 16
docker-compose.prod.yml     Production API + web + Postgres
Dockerfile.api              Production API image
Dockerfile.web              Production Next.js image
.env.example                Environment template (no secrets)
apps/api/                   Express API, schema, seed, providers, IVR webhooks, tests
apps/web/                   Next.js dashboard and server-side API proxy routes
```

## Verification performed

- `npm test` — 15 unit tests for input/status mapping, outcome reconciliation, attempt parsing,
  TwiML generation, basic-auth parsing and recording URL validation.
- `npm run build` — API type-check and Next.js 16 production build.
- `npm audit --omit=dev` — 0 known runtime dependency vulnerabilities.
- Mock-mode end-to-end run against Docker Postgres: click-to-call moved a delivery to Calling, then
  webhooks produced Received, No answer / Failed (no answer and timeout) and recorded duration/raw
  input; status filtering and bulk calling returned correct results; dashboard served HTTP 200.
- Production-mode server checks: health public, unauthenticated `/api/*` rejected with 401, authenticated
  list/call/bulk endpoints working, web proxy forwarding, and recording endpoint returning a clean 404
  when no recording exists. A live Twilio call was verified separately with a Twilio-owned `From`
  number and a verified destination.
