export type CallEventType = "call.created" | "call.updated";

/** Small on purpose: clients refetch the call by id, so payloads never go stale. */
export interface CallEvent {
  type: CallEventType;
  callId: string;
  conversationId: string;
}

/**
 * How ingestion tells the world something changed. Implementations must be
 * best-effort: a failed broadcast must never fail or roll back an ingest.
 * Swap the implementation (HTTP today; Redis / Postgres NOTIFY later) without
 * touching ingestion.
 */
export interface EventPublisher {
  publish(events: CallEvent[]): Promise<void>;
}

export const noopPublisher: EventPublisher = { publish: async () => {} };
