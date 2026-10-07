import type { CallEvent } from "./types";

type Listener = (event: CallEvent) => void;

/**
 * In-memory fan-out inside the web server process: every open SSE connection
 * subscribes here, and the internal publish endpoint broadcasts into it.
 * To scale past one web instance, back this with Redis / Postgres NOTIFY;
 * callers only use subscribe/broadcast.
 */
export class SseHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Returns how many connections received the event. One bad listener never blocks others. */
  broadcast(event: CallEvent): number {
    let delivered = 0;
    for (const listener of this.listeners) {
      try {
        listener(event);
        delivered += 1;
      } catch {
        this.listeners.delete(listener);
      }
    }
    return delivered;
  }

  get size(): number {
    return this.listeners.size;
  }
}

// Next.js may load route modules separately and re-evaluate them on hot reload;
// pinning the hub to globalThis guarantees a single instance per process.
const globalForHub = globalThis as unknown as { __sseHub?: SseHub };

export function getHub(): SseHub {
  globalForHub.__sseHub ??= new SseHub();
  return globalForHub.__sseHub;
}

/** Formats one Server-Sent Event frame. */
export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
