import { createLogger } from "@/lib/logger";
import type { CallEvent, EventPublisher } from "./types";

const log = createLogger("events");

export const INTERNAL_EVENTS_PATH = "/api/internal/events";
export const INTERNAL_SECRET_HEADER = "x-internal-secret";

/**
 * Publishes from the worker process to the Next server, which owns the open
 * SSE connections. Errors are logged and swallowed: the data is already saved,
 * and browsers refetch on reconnect, so a missed push is self-healing.
 */
export class HttpEventPublisher implements EventPublisher {
  constructor(
    private readonly appUrl: string,
    private readonly secret: string,
    private readonly timeoutMs = 2000,
  ) {}

  async publish(events: CallEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      const response = await fetch(new URL(INTERNAL_EVENTS_PATH, this.appUrl), {
        method: "POST",
        headers: { "content-type": "application/json", [INTERNAL_SECRET_HEADER]: this.secret },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) log.warn("Event broadcast rejected", { status: response.status });
    } catch (error) {
      log.warn("Event broadcast failed (is the web server running?)", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
