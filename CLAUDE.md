@AGENTS.md

# Call Insights: project conventions

A live dashboard of completed phone calls. Calls arrive by **webhook** (`POST /api/webhooks/call-ended`),
are saved to SQLite, and are pushed to browsers over Server-Sent Events. This is a product other developers
maintain: keep it clean, small-filed and tested. Read `README.md` for the architecture and data flow, and
`docs/WEBHOOK_SPEC.md` for the sender contract.

## Commands

```bash
npm run dev          # web + worker (needs no config in development)
npm test             # Vitest
npm run typecheck    # next typegen + tsc --noEmit (strict)
npm run lint && npm run format:check
npm run db:generate  # after changing src/db/schema.ts
npm run seed         # load 20 invented demo calls (src/demo/, audio in public/recordings/)
npm run build
```

Before finishing any change: `npm run typecheck && npm run lint && npm run format:check && npm test`
(and `npm run build` if you touched routes, config or `next.config.ts`). Run `npm run format` to fix style.

## Architecture rules

Dependencies point one way: **`domain` ← `providers` / `ingestion` / `services` ← `app` / `worker`**.

| Folder            | Rule                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`     | Pure types and rules (Call, status, merge, filters, DTOs). **No I/O, no imports from other layers.**                                                        |
| `src/providers/`  | The adapter seam. `webhook/payload.ts` is the **only** file that knows the sender's JSON shape; `normalizer.ts` maps it onto a `Call`.                      |
| `src/ingestion/`  | `ingestCall` (validate → merge → save → broadcast) and `webhookHandler`. **All ingestion goes through `ingestCall`**; never duplicate save/broadcast logic. |
| `src/services/`   | Queries/summaries for API routes. Return DTOs, never raw rows.                                                                                              |
| `src/db/`         | Schema, migrations, repositories. **The only code that writes SQL.** `client.ts` is the only file that knows the engine.                                    |
| `src/app/api/`    | Thin route handlers: parse → call a service/handler → respond. No business logic. Errors use `jsonError(status, message)` → `{ "error": "..." }`.           |
| `src/components/` | UI only. **Never import `db`, `providers` or `ingestion`.** `ui/` is shadcn (Base UI flavor, not Radix: use `render` props, not `asChild`).                 |
| `src/hooks/`      | Client state. Keep state transitions in pure reducers (`callsReducer.ts`) so they are unit-tested.                                                          |
| `src/events/`     | `EventPublisher` interface; the in-memory SSE hub; the worker's HTTP publisher. Publishing is best-effort and must never fail an ingest.                    |
| `src/worker/`     | Background process: retention + stuck-"processing" check. No polling (there is no list endpoint).                                                           |
| `src/lib/`        | Config, logger/redaction, formatting helpers.                                                                                                               |
| `src/demo/`       | Demo seed (`npm run seed`) through `ingestCall`. All data invented; edit `calls.ts`, then `npm run demo:recordings`.                                        |

## Code conventions

- **TypeScript strict. No `any`.** Prefer `unknown` + Zod at boundaries. Use `import type` for types.
- **Validate all incoming data with Zod** (webhook body, query params, env). Config only through `getConfig()` /
  `loadConfig()` in `src/lib/config.ts`; never read `process.env` elsewhere.
  Every env var is documented in `.env.example` and the README table.
- **Small, focused files and components.** One responsibility per file. Co-locate nothing large in route files.
- **Match surrounding style**: Prettier (double quotes, semicolons, trailing commas, width 100), ESLint, `@/` imports.
- **Errors:** return `{ outcome: "invalid" }`-style results for bad data, throw for our own faults
  (`ConfigurationError` → the webhook answers 5xx so the sender retries). Never swallow errors silently.
- **Time:** store UTC epoch ms; format in the viewer's locale/timezone in the UI. Summary ranges are supplied by the browser.
- **Idempotency & merging:** keyed by `conversationId`. **Data only moves forward**: a later empty/null field never erases
  a stored value; a later non-null value replaces it (`domain/mergeCall.ts`). Keep that rule intact.
- **Phone numbers:** E.164 in the database; format only for display (`lib/phone.ts`).
- **Conversation ids contain `+` and `_`.** URL-encode them in any URL, path or query (`URLSearchParams` /
  `encodeURIComponent`). The detail panel's `?call=` uses the internal UUID, not the conversation id.

## Domain facts to preserve

- `timestamp` from the sender is the call **start** (unconfirmed with the sender). `endedAt` and `durationSeconds` are **nullable**
  (shown as "—") and used automatically if the payload adds them. Sorting, date filters, summaries and retention use `startedAt`.
- Transcript messages are stored and shown **exactly as received**: no trimming, merging or editing; preserve line breaks.
  Only the _display_ maps roles (`agent` → "Amelia (AI Agent)", `user` → "Caller"; unknown roles shown as-is, `lib/speaker.ts`).
  No per-message timestamps, so no click-to-seek.
- An empty or missing transcript, or an empty recording link, means "not ready": the call stays `processing`.
- The recording link is a **presigned URL that expires**: store it untouched (never re-encode), never download/proxy/store audio,
  never print it. `refreshRecordingUrl` on `CallNormalizer` is a hook for later.
- Retention deletes **only this app's database rows**. It must never call MinIO or delete recording files.

## Privacy rules (transcripts hold sensitive personal and financial data)

- **Never log** transcript contents, full recording URLs (strip the query string) or full phone numbers (mask like `+1312***0123`).
  The logger sanitizes every context object and message through `src/lib/redact.ts`; do not bypass it (no raw `console.log`
  of call data) and keep `tests/privacy.test.ts` passing.
- **Fixtures, tests and examples use fake data only** (fictional `555-01xx` numbers, invented conversations).
  Never paste real customer data anywhere, including docs, issues and commit messages.
- `rawPayload` is stored for debugging and **never returned by the API** (DTOs exclude it).
- There is **no authentication yet**: do not add features that assume it exists, and keep the README warning accurate.

## Testing

- Vitest, node environment, files in `tests/` mirroring `src/`. Use `memoryDb()` / `builderFor()` from `tests/helpers.ts` and the
  fake payload in `tests/fixtures.ts`.
- Add tests with every behavior change: webhook handling, merge rules, status/timeouts, retention, filters, redaction.
- The browser-side filter logic (`domain/callFilters.ts`) must agree with the SQL in `db/callRepository.ts`; a test enforces it.
- UI is checked in a real browser (there is no component-test setup). When you change UI behavior, run the app and exercise it.

## Database

- Edit `src/db/schema.ts`, then `npm run db:generate`; commit the generated SQL in `src/db/migrations/`. Migrations run automatically when the
  database opens; concurrent first starts of the web process and worker are safe (retry on "database is locked").
- Keep column types portable (text / integer / JSON-as-text) so a move to Postgres stays mechanical.
- drizzle-kit asks interactively when a table or column could be a rename; split such changes into separate generate runs.

## Gotchas

- This is **Next.js 16**: APIs differ from older versions (see `AGENTS.md`). Middleware is now `proxy`; route handler `params` are Promises;
  `LayoutProps` types are generated by `next typegen` (the `typecheck` script runs it).
- Route handlers have **no built-in body-size limit**; the webhook enforces its own (`WEBHOOK_MAX_BODY_BYTES`).
- The SSE hub is **in memory** (single web instance). The worker is a separate process and publishes through `HttpEventPublisher`
  to `/api/internal/events` (shared secret). The webhook runs in the web process and publishes directly.
- On Windows you cannot delete an open SQLite file: close connections (`db.$client.close()`) before removing temp files in tests.
- Background tabs do not run animations or smooth-scroll, which matters when verifying UI with browser automation.
- Do not run the dev server and the production build against the same `.next` at once.

## Extending (not built; see README "Extending it")

Authentication, AI summaries/sentiment/tags, analytics charts, CSV/PDF export, a second webhook format or call source, multiple
instances. Add them through the existing seams (`CallNormalizer`, `ingestCall`, `EventPublisher`, services, DTOs) rather than around them.
