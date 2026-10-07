# Call Insights

A live dashboard of completed phone calls. When a call ends, the system that handled it
sends the call to this app by **webhook**, and it appears on the dashboard within a second,
with no page refresh: caller, time, a link to the recording, and the full transcript.

- **Next.js** (App Router) + **TypeScript** (strict), **Tailwind** + **shadcn/ui**
- **SQLite** via **Drizzle ORM** (written so moving to Postgres is a contained change)
- **Server-Sent Events** push new and updated calls to open browsers
- **Zod** validates everything that comes in; **Vitest** covers the logic

> ## ⚠️ Read this before exposing the app anywhere
>
> **There is no authentication yet.** Anyone who can reach the dashboard can read every call,
> transcript, phone number and recording link. Transcripts contain sensitive personal and
> financial information.
>
> - **Run it on `localhost` only** until authentication is added.
> - The **only** thing meant to be reachable from outside is the webhook
>   (`POST /api/webhooks/call-ended`), and it is protected by a shared secret.
> - A tunnel (ngrok, Cloudflare Tunnel) publishes your **whole** local app, not just the webhook.
>   Use it only briefly, with **fake data**, and stop it when you are done
>   (see [Testing the webhook locally](#testing-the-webhook-locally-with-a-tunnel)).
> - Never use real customer data in tests, fixtures, screenshots or bug reports.

## Contents

1. [Quick start](#quick-start)
2. [How it works](#how-it-works) · [From "call ended" to the screen](#from-call-ended-to-the-screen)
3. [How to connect the real API (the webhook)](#how-to-connect-the-real-api-the-webhook)
4. [Testing the webhook locally with a tunnel](#testing-the-webhook-locally-with-a-tunnel)
5. [Deploying](#deploying)
6. [Configuration](#configuration)
7. [Data retention](#data-retention) · [Recordings](#recordings) · [Privacy](#privacy)
8. [Development](#development)
9. [Extending it](#extending-it) · [Troubleshooting](#troubleshooting) · [Known limitations](#known-limitations)

## Quick start

Requires **Node.js 22 or newer** (developed on Node 24; `better-sqlite3` 13 needs 22+).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. `npm run dev` starts two processes side by side: the web app and a
small background worker. No configuration is needed in development (every setting has a safe
default; see [Configuration](#configuration)).

### Demo data

To fill the dashboard with **20 sample calls**, run this in a second terminal (it also works while the
app is stopped):

```bash
npm run seed
```

Each demo call has a transcript between the caller and **Amelia (AI Agent)** and a playable recording
(`public/recordings/demo-01.wav` … `demo-20.wav`, synthesized from the transcript text). The calls go
through the same `ingestCall` path as a real webhook, are spread over the past week relative to "now", and
re-running the seed refreshes them in place. Everything in them is invented (`src/demo/calls.ts`).
To regenerate the audio after editing a transcript, run `npm run demo:recordings` (Windows only; it uses
the built-in speech voices). To start empty again, stop the app and delete `./data/`.

To see a call arrive, send one to the webhook yourself (this is exactly what the real sender does;
the default development secret is `dev-only-webhook-secret`). The data is fake:

```bash
curl -X POST http://localhost:3000/api/webhooks/call-ended   -H "Authorization: Bearer dev-only-webhook-secret"   -H "Content-Type: application/json"   -d '{"phone_number":"+13125550123","conversation_id":"call-_+13125550123_Demo000001","timestamp":1791309411,
       "transcript":[{"role":"agent","message":"Thank you for calling."},{"role":"user","message":"Hi there."}],
       "call_recording_path":"https://example.com/demo.wav"}'
```

(PowerShell: use `curl.exe` and put the JSON in a file, `-d @call.json`.) It appears on the dashboard at once.
Sending the same body again returns `"status":"unchanged"`. Leave out `transcript` and `call_recording_path`
to see the "Processing" state, then send the complete version to see it fill in.

The database is created automatically at `./data/app.db` (git-ignored) and migrated on startup.

## How it works

```
 call sender ──POST──▶  /api/webhooks/call-ended ──▶ ingestCall() ──▶ SQLite
 (their system)         (Bearer secret, Zod)         validate·merge·save │
                                                          │               │
                                                          ▼               │
                                                     SSE hub (in memory)  │
                                                          │               │
 browser ◀──── /api/events (Server-Sent Events) ◀─────────┘               │
    │                                                                      │
    └────── GET /api/calls, /api/calls/:id, /api/summary ─────────────────┘

 worker process (npm run worker): retention cleanup + "stuck in processing" check
```

Two long-lived processes share one SQLite file:

| Process    | Command                     | Responsibility                                                                                       |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Web**    | `npm run dev` / `npm start` | Pages, the webhook, the JSON APIs, the live (SSE) stream                                             |
| **Worker** | `npm run worker`            | Deletes calls past the retention period; marks calls that never got a recording/transcript as failed |

There is **no polling**: the call source has no list endpoint, so calls only arrive by webhook.

### Folder structure

```
src/
  app/            Next.js routes. API handlers are thin: parse, call a service, respond.
  components/     UI only (ui/ = shadcn). Never touches the database.
  hooks/          Client state: live stream, list + pagination, call detail, URL state
  domain/         Pure types and rules (Call, status, merge rules, filters). No I/O.
  providers/      The adapter seam: how the sender's payload becomes a Call
    webhook/        payload.ts = THE ONLY file that knows the sender's JSON format
  ingestion/      ingestCall (validate → merge → save → broadcast) + the webhook handler
  services/       Queries and summaries used by the API routes
  db/             Drizzle schema, migrations, repositories (the only code that runs SQL)
  events/         EventPublisher interface, the SSE hub, the worker → web publisher
  worker/         Background process: retention + stuck-call check
  lib/            Config (Zod-validated env), logger + privacy redaction, formatting
  demo/           npm run seed: 20 invented calls, fed through ingestCall (not used by the app)
public/recordings/   The demo calls' audio files
tests/            Vitest; mirrors src/
docs/WEBHOOK_SPEC.md   What to send to the team that owns the call sender
```

Dependencies point one way: `domain` ← `providers`/`ingestion`/`services` ← `app`/`worker`.
Components never import `db` or `providers`.

### From "call ended" to the screen

1. A call ends. The sender POSTs it to `/api/webhooks/call-ended` with `Authorization: Bearer <secret>`.
2. **`webhookHandler`** checks the secret (constant-time, before reading the body), enforces the size
   limit, parses the JSON and validates it with the Zod schema in `providers/webhook/payload.ts`.
   Failures are `401` / `413` / `400` and nothing is saved.
3. **The normalizer** converts the payload to the app's `Call` shape (E.164 phone, transcript
   segments, recording link kept untouched).
4. **`ingestCall`** validates again, then saves **idempotently by `conversation_id`** and merges with any
   existing copy (data only moves forward: a later empty field never erases a value). It returns
   `created`, `updated` or `unchanged`.
5. For `created`/`updated` it publishes `{ callId }` straight to the in-memory **SSE hub**
   (no network hop; the webhook runs in the web process). `unchanged` duplicates send nothing.
6. Every open browser has an `EventSource` on `/api/events`. On an event it fetches that call and
   merges it into the list: a new call appears at the top with a brief highlight, and a call that
   was "processing" updates in place.
7. The sender gets `200` (also for duplicates) in well under a second.

If a browser's connection drops it reconnects automatically and **refetches the latest calls**, so
nothing is missed. The header shows **Live / Reconnecting**, and **Last call received: N minutes ago**.
A quiet period is normal and is not shown as an error; a red **Webhook rejected** badge appears only
when the sender's latest request was refused (for example a wrong secret) and nothing has succeeded since.

### Data model

One normalized `Call` is used everywhere (`src/domain/call.ts`):

| Field                        | Notes                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `conversationId`             | Unique, from the sender. The idempotency key. Contains `+` and `_`: always URL-encode it.                    |
| `phoneNumber`                | Stored as E.164, displayed nicely formatted                                                                  |
| `startedAt`                  | The sender's single `timestamp`, treated as the call **start** (see [Known limitations](#known-limitations)) |
| `endedAt`, `durationSeconds` | **Nullable**: the sender does not report them today (shown as "—"); used automatically if added later        |
| `recordingUrl`               | Opaque presigned link; null until available                                                                  |
| `transcript`                 | Array of `{ speaker, text }` exactly as received; null until available                                       |
| `status`                     | `processing` (recording or transcript missing) · `completed` · `failed` (timed out)                          |
| `rawPayload`                 | The original body, kept for debugging (never returned by the API)                                            |

## How to connect the real API (the webhook)

The sender's engineers push each finished call to us. To connect it:

1. **Generate a secret** (at least 16 characters) and set it on the server:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Put it in `WEBHOOK_SECRET`. Also set a different `INTERNAL_EVENTS_SECRET`. In production
   the app **refuses to start** with the built-in development defaults.
2. **Deploy** the app somewhere reachable over **HTTPS** (see [Deploying](#deploying)).
3. **Send [`docs/WEBHOOK_SPEC.md`](docs/WEBHOOK_SPEC.md) to the team that owns the sender**, together with the
   final URL and the secret (through a secure channel). It documents the endpoint, header, payload,
   response codes, idempotency, and asks them to retry with backoff.
4. **Test it** with the `curl` example at the end of the spec (use fake data). `200` with
   `"status":"created"` means it worked; the call appears on the dashboard immediately.
5. **Check the dashboard header:** "Last call received" should update, and no red "Webhook rejected" badge should appear.

**If their payload differs from the sample.** The format lives in exactly one place:
`src/providers/webhook/payload.ts` (the Zod schema, with notes on what is confirmed) and
`src/providers/webhook/normalizer.ts` (how it maps onto a `Call`). Change those two files, update
`docs/WEBHOOK_SPEC.md` and the tests; nothing else in the app moves.

**Calls sent while the dashboard is down are lost** unless the sender retries: the dashboard has no
way to ask for missed calls. That is why the spec asks them to retry with exponential backoff on
timeouts and 5xx responses, and why production needs an always-on host.

## Testing the webhook locally with a tunnel

The real sender cannot reach `localhost`, so to test with them you expose it temporarily through a tunnel.

> **A tunnel publishes your entire local app**, including the dashboard and its API, which have no
> authentication. Use fake data only, share the URL only with the person testing, and stop the
> tunnel as soon as you are done.

1. Start the app: `npm run dev`.
2. Set a real secret in `.env` (copy `.env.example`; `WEBHOOK_SECRET=...`, at least 16 characters) and restart.
3. Start **one** tunnel to port 3000:

   **ngrok**

   ```bash
   ngrok http 3000
   ```

   **Cloudflare Tunnel** (no account needed for a quick tunnel)

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   Either prints an `https://…` address.

4. The webhook URL is that address plus `/api/webhooks/call-ended`. Test it from anywhere:
   ```bash
   curl -i -X POST "https://<your-tunnel-address>/api/webhooks/call-ended" \
     -H "Authorization: Bearer <your WEBHOOK_SECRET>" \
     -H "Content-Type: application/json" \
     -d '{"phone_number":"+13125550123","conversation_id":"tunnel-test-1","timestamp":1791309411,
          "transcript":[{"role":"agent","message":"Test."}],"call_recording_path":"https://example.com/t.wav"}'
   ```
5. Watch it appear on <http://localhost:3000> (open the dashboard on `localhost`, not through the tunnel).
6. Stop the tunnel (Ctrl+C).

The tunnel address changes each time you restart it (unless you pay for a fixed one), so tell the sender the new URL.

## Deploying

### What the app needs

- An **always-on server** that runs **two processes**: `npm start` (web) and `npm run worker`.
  Calls arrive at unpredictable times and browsers hold open streaming connections, so the web
  process must stay running.
- **HTTPS** in front of it (a reverse proxy or platform TLS). The webhook secret travels in a header.
- A **persistent disk** for the SQLite file (`DATABASE_URL`). **Back it up**: it holds all call data.
- **One web instance.** The live-update hub is in memory (see below).
- If you use a reverse proxy, **do not buffer** `/api/events` (the app already sends `X-Accel-Buffering: no`),
  and allow long-lived connections.

### Build and run

```bash
npm ci
npm run build
npm start          # web, port 3000
npm run worker     # worker (second process / second service)
```

Set at least `NODE_ENV=production`, `WEBHOOK_SECRET`, `INTERNAL_EVENTS_SECRET`, `APP_URL`
(the URL the worker uses to reach the web process, e.g. `http://localhost:3000`), and `DATABASE_URL`.
Run both commands from the project root (migrations are read from `src/db/migrations`). The
web server exits at startup with a clear message if the secrets are missing or left at their defaults.

### Hosting options

| Option                                                                                      | Fits?    | Notes                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VPS / VM** (systemd, pm2, Docker)                                                         | ✅       | Simplest. Run web + worker, TLS via Caddy/nginx.                                                                                                                           |
| **Container platforms with persistent volumes** (Fly.io, Railway, Render, a Kubernetes pod) | ✅       | Two services/processes sharing one **volume**, or one container running both. Keep to one web replica.                                                                     |
| **Serverless** (Vercel, Netlify, Cloud Functions)                                           | ❌ as is | Functions are short-lived and many instances run at once: no long-lived SSE connections, no in-memory hub, no always-on worker, no writable shared SQLite file. See below. |

**What a serverless deployment would require** (not built; the code is structured for it):
move to **Postgres** (change `db/client.ts`, `db/schema.ts`, `drizzle.config.ts`, regenerate migrations);
replace the in-memory hub with **Redis pub/sub or Postgres `LISTEN/NOTIFY`** behind the existing
`EventPublisher` interface; run the retention and stuck-call checks from a **scheduled cron** endpoint instead of the worker.
SSE would then also need a host that supports long-lived streams.

## Configuration

Every setting is an environment variable, validated at startup by `src/lib/config.ts`
(a bad value fails fast with a readable message). Copy `.env.example` to `.env` to change anything.
Defaults suit development.

| Variable                     | Default                 | Purpose                                                                                          |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `WEBHOOK_SECRET`             | dev value               | Bearer token the sender must send. **Required in production** (≥16 chars, default refused).      |
| `WEBHOOK_MAX_BODY_BYTES`     | `5242880`               | Bodies larger than this get `413`.                                                               |
| `RECORDING_BASE_URL`         | unset                   | Only if the sender's `call_recording_path` is an object path rather than a full URL.             |
| `DEFAULT_PHONE_REGION`       | `US`                    | Region used to parse numbers sent without a `+`.                                                 |
| `PROCESSING_TIMEOUT_MINUTES` | `120`                   | A call still missing its recording/transcript this long after we received it is marked `failed`. |
| `RETENTION_DAYS`             | `30`                    | Delete calls older than this. `0` disables cleanup.                                              |
| `WORKER_INTERVAL_SECONDS`    | `60`                    | How often the worker checks for stuck calls.                                                     |
| `DATABASE_URL`               | `./data/app.db`         | SQLite file.                                                                                     |
| `APP_URL`                    | `http://localhost:3000` | How the worker reaches the web process.                                                          |
| `INTERNAL_EVENTS_SECRET`     | dev value               | Worker → web shared secret. **Required in production.**                                          |
| `LOG_LEVEL`                  | `info`                  | `debug` · `info` · `warn` · `error`                                                              |

## Data retention

Calls older than `RETENTION_DAYS` (default 30; `0` disables) are deleted from **this dashboard's
database**: the call details, the transcript, and the stored recording **link**. The worker runs the
cleanup once at startup and then once a day, and logs how many calls it removed.

Cleanup **never contacts MinIO and never deletes recording files**. The recording link is only a
column in our own table. Retention is by the call's start time.

## Recordings

The dashboard stores and shows the **link** only. It never downloads, proxies or stores audio.
In the call detail you can **Open recording** (new tab), **Copy link**, or play it inline straight
from the link.

In production the links are **presigned MinIO URLs and expire**. (The demo calls from `npm run seed`
point at static files in `public/recordings/` instead.) The player shows "Recording link may have
expired" when a link no longer loads, while Open and Copy keep working. Because calls are kept for 30
days, make sure the sender's links live long enough (or see below). The link is stored exactly as
sent (any change would break its signature), and the app sends `Referrer-Policy: no-referrer` so
opening it never leaks the dashboard's address.

**Fresh links on demand (not built).** The adapter interface (`providers/types.ts`) has an optional
`refreshRecordingUrl(conversationId)` hook for this: implement it to mint a new presigned URL, expose it
through a small API route, and call it from the detail view when the player reports a failure.

## Privacy

Transcripts and phone numbers are sensitive. What the app does, and what you must still do:

- **Logs never contain transcript text, full recording URLs or full phone numbers.** This is enforced in
  one place (`src/lib/redact.ts`, applied by the logger) and covered by tests: query strings (the presigned
  signature) are stripped, phone numbers are masked (`+1312***0123`, also inside conversation ids and file
  names), and any field that may carry message text is redacted.
- **The database file holds everything**, including each call's original webhook body (`rawPayload`, for
  debugging; never returned by the API). Restrict access to the file and its backups.
- **Nothing is sent to third parties.**
- **No authentication yet**: see the warning at the top.
- **Use fake data** in tests, fixtures, examples and bug reports (the test fixtures use fictional `555-01xx`
  numbers and invented conversations).

## Development

```bash
npm run dev          # web + worker
npm test             # unit tests (Vitest)
npm run test:watch
npm run typecheck    # generates Next's route types, then tsc (strict)
npm run lint
npm run format       # Prettier (format:check to verify)
npm run db:generate  # after editing src/db/schema.ts: creates a SQL migration
npm run seed         # load the 20 demo calls (see Quick start)
npm run build && npm start
```

- **Tests** cover the webhook (auth, size limits, validation, idempotency, merging, direct publishing),
  adapter normalization, the merge rules, status and timeouts, the retention cleanup, the cursor-based pagination,
  filters (the browser-side matching is checked against the SQL), live-list state, and privacy redaction.
  All test data is fake.
- **Migrations** run automatically when the database is opened. Concurrent first starts of the web
  process and the worker are safe (setup retries briefly on SQLite's "database is locked").
- **Changing the schema:** edit `src/db/schema.ts`, run `npm run db:generate`, commit the new SQL file.
- **Moving to Postgres:** the schema uses only portable column types. Change the driver and dialect in
  `db/client.ts`, `db/schema.ts` and `drizzle.config.ts`, regenerate migrations, and replace the SQLite-specific
  `LIKE ... ESCAPE` search with `ILIKE` in `db/callRepository.ts`. Also see the serverless notes under [Deploying](#deploying).
- Project conventions for contributors (and Claude Code sessions) are in [`CLAUDE.md`](CLAUDE.md).

## Extending it

The code is structured so these can be added without large rewrites. None of them is built.

| Feature                                         | Where it plugs in                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication / multiple users**             | Add middleware (`src/proxy.ts` in this Next.js version) that guards pages and `/api/*` except `/api/webhooks/*`; the webhook keeps its own secret. Per-user data needs a `userId` on the relevant tables. |
| **AI summaries, sentiment, tags**               | Generate after `ingestCall` saves (a job in the worker, or a step in `ingestCall`), store in new columns/table, return through `callDto.ts`, show in `components/detail/`.                                |
| **Analytics charts**                            | New `services/` queries over `calls` (counts by day, by status), a route per chart, components next to `components/summary/`.                                                                             |
| **Export (CSV/PDF)**                            | A route that reuses `listCallsPage` + the same `CallFilters` as the table, streaming rows out.                                                                                                            |
| **Another call source / second webhook format** | Implement `CallNormalizer` (`providers/types.ts`) in `providers/<name>/`, add a route that calls `ingestCall` with it. Calls already carry a `provider` column.                                           |
| **Scaling past one web instance**               | Back `EventPublisher` / `SseHub` with Redis pub/sub or Postgres `LISTEN/NOTIFY`; move to Postgres.                                                                                                        |

## Troubleshooting

| Symptom                                                     | Likely cause                                                                                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header shows **Webhook rejected**                           | The sender's last request was refused. Hover the badge for the reason: `401` wrong/missing secret, `400` bad payload (the message names the field), `413` body too large.                       |
| Calls sent but nothing appears                              | Check the sender's response code. Check the web server log (`[webhook]` lines). Is the app reachable over HTTPS from them?                                                                      |
| "Reconnecting…" in the header                               | The browser lost the live stream. It retries automatically and refetches when back. Behind a proxy, check that `/api/events` is not buffered or timed out.                                      |
| A call stays **Processing**                                 | It arrived without a transcript or recording. It is completed if the sender sends it again with the same `conversation_id`; otherwise it becomes **Failed** after `PROCESSING_TIMEOUT_MINUTES`. |
| "Recording link may have expired"                           | The presigned link's lifetime has passed. Open/Copy still work if the storage allows it; ask the sender for longer-lived links.                                                                 |
| `npm install` fails with a `node-gyp` / Visual Studio error | A dependency tried to compile from source. The included `.npmrc` (`ignore-scripts=true`) prevents this; make sure it is present and re-run `npm install`.                                       |
| Server exits at startup in production                       | The message names the setting: set a unique `WEBHOOK_SECRET` and `INTERNAL_EVENTS_SECRET`.                                                                                                      |
| Worker logs `Event broadcast failed`                        | The web server is not running or `APP_URL` is wrong. Data is still saved; browsers refetch when they reconnect.                                                                                 |

## Known limitations

- **No authentication** (see the warning at the top).
- **`timestamp` is assumed to be the call start.** The sender is confirming. If it is the end time, only
  `normalizer.ts` changes. Until end time/duration exist in the payload, they show as "—".
- **Presigned recording links expire** and are not refreshed automatically (hook provided, not built).
- **Single web instance** (in-memory live-update hub) and a **single SQLite file**.
- **Calls sent while the dashboard is down are lost** unless the sender retries (it is asked to).
- Summary counts for "today" and "this week" use the viewer's timezone; the week starts on Monday.
