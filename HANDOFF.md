# Call Insights: developer handoff

A live dashboard of completed phone calls. The system that handles calls sends each finished call
to this app by **webhook**; the dashboard shows it within a second (caller, time, recording link,
full transcript) with no page refresh.

Read in this order: **this file** → `README.md` (architecture, data flow, deployment, configuration)
→ `docs/WEBHOOK_SPEC.md` (the contract to send to the call-sender team) → `CLAUDE.md` (code conventions).

## Current status

**Built and working** (verified in a real browser and by 180 unit tests):

- Webhook endpoint `POST /api/webhooks/call-ended`: bearer-secret auth, size limit, Zod validation, idempotent by
  `conversation_id`, safe merging if the same call is sent more than once.
- Live dashboard: summary cards (today / this week / last hour), searchable and date-filterable call list with
  pagination, live updates over Server-Sent Events with automatic reconnect and refetch.
- Call detail panel (`?call=<id>`): metadata with copy buttons, recording (open, copy link, inline player with an
  "expired link" message), chat-style transcript with search.
- Background worker: data retention (default 30 days; deletes only this app's own database rows, never MinIO)
  and a stuck-"processing" timeout.
- Privacy protections in logging (no transcript text, no full recording URLs, masked phone numbers), security headers,
  production start-up checks (refuses default secrets).
- **Demo data on request:** the database starts empty; `npm run seed` loads 20 invented calls (transcripts between
  the caller and Amelia, the AI agent, with playable recordings in `public/recordings/`). There is no mock API.

**Not built (by design):** authentication, hosting/deployment configuration, automatic refresh of expired recording links,
AI summaries, charts, CSV/PDF export, running more than one web instance.

> ⚠️ **There is no authentication.** Anyone who can reach the dashboard can read all calls, transcripts and phone numbers.
> Keep it on `localhost` (or a private network) until authentication is added. Only the webhook should ever be reachable
> from outside, and it is protected by a shared secret.

## Requirements

- **Node.js 22 or newer** (developed and tested on **Node 24.11.1**), npm 10+. (`better-sqlite3` 13 requires Node 22+.)
- No other services: the database is a local SQLite file created automatically.
- `better-sqlite3` is a native module that ships prebuilt binaries for Windows, macOS and Linux (x64/arm64). The included `.npmrc`
  (`ignore-scripts=true`) stops npm from trying to compile it, which otherwise fails on machines without a C++ toolchain.
  If you add a package that needs a build step, run `npm rebuild <package>`.

## Setup

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Every setting has a development default, so the `.env` file is optional locally. For anything beyond your own machine, set at
least `WEBHOOK_SECRET` (16+ characters) and `INTERNAL_EVENTS_SECRET`; production refuses to start with the built-in defaults.
Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Run it

```bash
npm run dev        # web (http://localhost:3000) + background worker, together
```

Send a test call (fake data) to see it appear: the `curl` example in the README's Quick start. Production run commands are in
the README ("Deploying"): `npm run build`, `npm start`, and `npm run worker` as a second process.

Useful commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`.

## Open questions for the call-sender team

These need answers before go-live. The spec (`docs/WEBHOOK_SPEC.md`) can be sent as-is: its "Open questions" cover the timestamp, link lifetime, end time/duration, retries and phone format.

1. **What does `timestamp` mean?** We assume it is the **start** of the call (Unix seconds). The payload has no end time or
   duration, so both show as "—". Is it the start? Can they add `ended_at` / `duration_seconds`? (If `timestamp` is actually the
   end time, only `src/providers/webhook/normalizer.ts` changes.)
2. **How long do the presigned recording links live?** We keep calls for 30 days (`RETENTION_DAYS`). If links expire sooner
   (hours or days), older recordings will stop playing. Options: longer-lived links from them, or we build link refreshing (below).
3. **Retries.** Will their system retry on timeouts and 5xx responses, with exponential backoff, and for how long? Calls sent while
   our server is down are lost otherwise, because we cannot ask for missed calls later. How will they alert if retries are exhausted?
4. **Does a call get sent once, complete?** They said yes (once, after transcript and recording are ready). Confirm that a call
   is never sent earlier or in pieces. We still handle it safely if it is.
5. **VPN / network access to MinIO.** The server never contacts MinIO; the **viewer's browser** loads the recording straight from the
   presigned link. So everyone using the dashboard must be able to reach the MinIO host from their browser (VPN included).
   Which host/URL do links use? Is it reachable from where the dashboard will run and from users' machines? If the dashboard is
   served over HTTPS and links are plain `http://`, browsers will **block** the audio (mixed content); links need to be HTTPS.
6. **Phone number format.** Always E.164 (`+13125550123`)? Numbers without a `+` are currently read as US (`DEFAULT_PHONE_REGION`).
7. **Hosting details for the webhook:** which URL will they call, and who rotates the secret if it leaks?

If the real payload differs from the sample, change only `src/providers/webhook/payload.ts` and `normalizer.ts`, update
`docs/WEBHOOK_SPEC.md` and the tests (`tests/webhookPayload.test.ts`, `tests/fixtures.ts`). Nothing else depends on the format.

## Remaining work

In rough priority order:

1. **Host it on an always-on server with HTTPS.** Two processes (`npm start` and `npm run worker`), a persistent disk for the
   SQLite file (with backups), a reverse proxy with TLS, **one** web instance, and no response buffering on `/api/events`.
   Set the production environment variables. Serverless platforms (Vercel, Netlify) do **not** fit as-is; see the README
   ("Deploying") for what that would take. Then give the sender team the URL and secret and have them follow `docs/WEBHOOK_SPEC.md`.
2. **Add authentication** before the dashboard is reachable by anyone beyond a trusted network. Suggested approach (README,
   "Extending it"): a Next.js `proxy` (this version's name for middleware) guarding pages and `/api/*` **except** `/api/webhooks/*`,
   which keeps its own secret. `/api/internal/events` is also secret-protected. Add per-user data later if needed.
3. **Handle expiring recording links** (if the answer to question 2 is "short"). The adapter interface already has an optional
   `refreshRecordingUrl(conversationId)` hook (`src/providers/types.ts`). Implement it to mint a fresh presigned URL, expose it
   through a small API route, and call it from the detail panel when the player reports "Recording link may have expired".
   Until then, the panel shows that message and Open / Copy keep working.
4. ~~Remove the mock~~ **Done.** Nothing to do.
5. **Confirm the open questions above** and adjust the adapter if needed (timestamp meaning; end time / duration).
6. Optional later: analytics charts, CSV/PDF export, AI summaries, Postgres + Redis for more than one instance. Each has a
   documented extension point in the README.

## Things worth knowing

- **Privacy:** transcripts hold sensitive personal and financial data. Logs never contain transcript text, full recording URLs or full
  phone numbers (enforced in `src/lib/redact.ts`, tested). The database file holds everything, including each call's original
  webhook body (`rawPayload`, never returned by the API), so restrict access to it and its backups. Use fake data for all testing.
- **Data retention** deletes calls older than `RETENTION_DAYS` from this app's database only; it never touches recording files.
- **Duplicates are harmless:** the same `conversation_id` is saved once; later copies fill in missing data and never erase stored data.
- **Conversation ids contain `+` and `_`:** always URL-encode them in URLs and query strings.
- **This is Next.js 16** (APIs differ from older versions; see `AGENTS.md`). Middleware is called `proxy`.
- All settings are environment variables, validated at start-up in `src/lib/config.ts`; the full table is in the README.
