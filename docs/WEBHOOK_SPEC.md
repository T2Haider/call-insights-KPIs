# Call-ended webhook: integration spec

This is what the Call Insights dashboard expects from the system that sends it
finished calls. Please send **one HTTP request per call**, **once**, after the
transcript and the recording link are both ready.

> **Privacy:** transcripts contain sensitive personal and financial information.
> Use HTTPS only, keep the shared secret out of logs and source control, and never
> use real customer data when testing against any non-production environment.

## Endpoint

|                          |                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Method**               | `POST`                                                                                                            |
| **URL**                  | `https://<our-dashboard-host>/api/webhooks/call-ended` (we will give you the real host; HTTPS only in production) |
| **Content-Type**         | `application/json`                                                                                                |
| **One call per request** | Yes. Do not batch several calls into one request.                                                                 |

## Authentication

Send the shared secret we give you on **every** request:

```
Authorization: Bearer <secret>
```

Requests with a missing or wrong secret get `401` and nothing is saved. If the
secret leaks, tell us and we will rotate it.

## When to send

Send each call **once, after both the transcript and the recording link are
ready**. That is what the dashboard is designed around, and **we expect complete
calls**.

As a safety net the dashboard still behaves sensibly if a call arrives incomplete
(for example with an empty `transcript` or `call_recording_path`) and the full
version is sent later with the same `conversation_id`: the later request fills in
the missing data in place. A call that arrives without a transcript or recording is
shown as "Processing", and if it is never completed it is marked "Failed" after a
timeout (default 2 hours). Please do not rely on this; send complete calls.

## Request body

```json
{
  "phone_number": "+13125550123",
  "transcript": [
    {
      "role": "agent",
      "message": "Thank you for calling, I'm Amelia, your AI assistant, on a recorded line. Are you calling about your account today?"
    },
    { "role": "user", "message": "Yes, I'd like to update my billing address." },
    { "role": "agent", "message": "I can help with that.\n\nCould you share your account number?" }
  ],
  "timestamp": 1791309411,
  "conversation_id": "call-_+13125550123_AbCdEf123456",
  "call_recording_path": "https://minio.example.com/bucket/recordings/2026/10/06/13125550123_20261006_180045.wav?X-Amz-Algorithm=...&X-Amz-Signature=..."
}
```

(All values above are fake examples.)

| Field                          | Type                         | Required    | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation_id`              | string                       | **yes**     | Unique per call. This is the idempotency key. It may contain characters such as `+` and `_`; that is fine.                                                                                                                                                                                                                                                                               |
| `phone_number`                 | string                       | **yes**     | The caller's number, ideally E.164 (`+13125550123`). Other common formats are normalized; numbers without a `+` are read as US by default.                                                                                                                                                                                                                                               |
| `timestamp`                    | number (or ISO-8601 string)  | **yes**     | Unix time in **seconds**. **We treat this as when the call started.** ⚠ _Please confirm that is correct._ If it is the end time or the time of sending, tell us; it is a small change on our side.                                                                                                                                                                                       |
| `transcript`                   | array of `{ role, message }` | recommended | `role` is `"agent"` or `"user"` (shown in the dashboard as "Amelia (AI Agent)" and "Caller"; any other role is shown as sent). `message` is shown **exactly as sent**, including line breaks and messages that end mid-sentence; we never edit, trim or merge messages. Empty or missing means "not ready yet".                                                                          |
| `call_recording_path`          | string                       | recommended | The presigned link to the `.wav` file, sent exactly as generated. The dashboard only stores and plays it; it never downloads audio. Empty or missing means "not ready yet". ⚠ _Presigned links expire. How long do they live?_ Please make them long-lived enough that people can listen for the full retention period (30 days by default), or tell us so we can plan to refresh links. |
| `ended_at`, `duration_seconds` | number                       | optional    | Not sent today. If you can add the call's end time (Unix seconds) and/or its length in seconds later, the dashboard will show them automatically. Until then it shows "—".                                                                                                                                                                                                               |

Unknown extra fields are ignored. Bodies up to **5 MB** are accepted, far more
than any transcript needs.

## Responses

We answer quickly (normally well under a second). Please use a timeout of about 10 seconds.

| Status  | Meaning                                                                | Body                                                                                              | Retry?                                                              |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **200** | Accepted. Also returned for a **duplicate** of a call we already have. | `{"status":"created"\|"updated"\|"unchanged","id":"…","conversationId":"…"}`                      | No, you are done.                                                   |
| **400** | The body is not valid JSON, or a field is missing/invalid.             | `{"error":"Invalid payload: phone_number: …"}` (names the problem; never repeats transcript text) | Not until the cause is fixed. The same body will fail the same way. |
| **401** | Missing or wrong `Authorization: Bearer` secret.                       | `{"error":"Missing or invalid bearer token"}`                                                     | Not until the secret is fixed.                                      |
| **413** | Body larger than 5 MB.                                                 | `{"error":"Body exceeds … bytes"}`                                                                | Not until the body is reduced.                                      |
| **5xx** | A problem on our side (database error, misconfiguration).              | `{"error":"Internal server error"}`                                                               | **Yes**, with backoff.                                              |

Other HTTP methods get `405`.

## Idempotency

`conversation_id` identifies the call. Sending the same call again is safe:

- an identical repeat returns `200` with `"status":"unchanged"` and changes nothing;
- a later version of the same call (for example with the transcript or recording now
  present, or a refreshed recording link) returns `200` with `"status":"updated"` and
  is merged into the same entry;
- data is only filled in or replaced by newer data, **never erased**: a later request
  with an empty transcript or link will not remove what we already have.

So it is always safe to retry.

## Please retry on failure

If the request fails (a timeout, a connection error, or any non-2xx response) please
**retry with exponential backoff**, for example after 5 s, 30 s, 2 min, 10 min, 1 h,
then give up and alert someone. This matters because **calls sent while the
dashboard is down are otherwise lost**: the dashboard has no way to ask for missed
calls later.

For `400`, `401` and `413` we recommend capping the retries and alerting instead,
because retrying the same request cannot succeed until the cause is fixed. For `5xx`
and timeouts, keep retrying; the duplicate handling above makes that safe.

## Try it (with fake data)

```bash
curl -i -X POST "https://<our-dashboard-host>/api/webhooks/call-ended" \
  -H "Authorization: Bearer <secret>" \
  -H "Content-Type: application/json" \
  -d '{
        "phone_number": "+13125550123",
        "transcript": [
          { "role": "agent", "message": "Hello, this is a test call." },
          { "role": "user",  "message": "Hi, this is only a test." }
        ],
        "timestamp": 1791309411,
        "conversation_id": "call-_+13125550123_TestOnly0001",
        "call_recording_path": "https://example.com/test.wav"
      }'
```

A `200` with `"status":"created"` means it worked and the call appears on the
dashboard within a second or two. Sending it again returns `"status":"unchanged"`.

## Open questions

1. Is `timestamp` the **start** of the call? (We assume so.)
2. How long do presigned recording links stay valid?
3. Can you also send the call's end time or duration (`ended_at`, `duration_seconds`)?
4. Will your system retry on timeouts and `5xx` responses with backoff (see above), for how long, and how will you be alerted if retries run out?
5. Is `phone_number` always E.164 (`+` and country code)?
6. Do the recording links use HTTPS, and are they reachable from the browsers of the people who will use the dashboard (VPN included)?
