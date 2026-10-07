import { getDb } from "@/db/client";
import { formatSse, getHub } from "@/events/hub";
import { WEBHOOK_PROVIDER_NAME } from "@/providers/webhook/normalizer";
import { getIngestionStatus } from "@/services/ingestionStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ingestion status is re-sent this often; it doubles as the keep-alive heartbeat. */
const STATUS_INTERVAL_MS = 5000;
/** Tells the browser how long to wait before auto-reconnecting. */
const RETRY_MS = 3000;

/**
 * Server-Sent Events stream:
 *   event: call    data: { type, callId, conversationId }   (something changed)
 *   event: status  data: IngestionStatusDto                 (last call received, every 5 s)
 * Events carry ids only; clients fetch the call, so payloads never go stale.
 */
export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatSse(event, data)));
        } catch {
          cleanup();
        }
      };
      const sendStatus = () =>
        send("status", getIngestionStatus(db, { provider: WEBHOOK_PROVIDER_NAME }));

      controller.enqueue(encoder.encode(`retry: ${RETRY_MS}\n\n`));
      const unsubscribe = getHub().subscribe((event) => send("call", event));
      sendStatus();
      const timer = setInterval(sendStatus, STATUS_INTERVAL_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // stop nginx-style proxies from buffering the stream
    },
  });
}
