import type { SseHub } from "./hub";
import type { CallEvent, EventPublisher } from "./types";

/**
 * Publishes straight into the in-process SSE hub. Used where ingestion runs in
 * the web server itself (the webhook), so there is no network hop. The worker
 * process, which is separate, uses `HttpEventPublisher` instead.
 */
export class HubEventPublisher implements EventPublisher {
  constructor(private readonly hub: SseHub) {}

  async publish(events: CallEvent[]): Promise<void> {
    for (const event of events) this.hub.broadcast(event);
  }
}
