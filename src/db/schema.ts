import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { CALL_STATUSES } from "@/domain/call";
import type { Transcript } from "@/domain/transcript";

/**
 * Only portable column types are used (text / integer / JSON-as-text) so a
 * move to Postgres is a mechanical schema translation, not a redesign.
 * Timestamps are stored as epoch milliseconds (UTC).
 */
export const calls = sqliteTable(
  "calls",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().unique(),
    provider: text("provider").notNull(),
    phoneNumber: text("phone_number").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    durationSeconds: integer("duration_seconds"),
    recordingUrl: text("recording_url"),
    transcript: text("transcript", { mode: "json" }).$type<Transcript>(),
    status: text("status", { enum: CALL_STATUSES }).notNull(),
    rawPayload: text("raw_payload", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("calls_started_at_idx").on(t.startedAt),
    index("calls_status_idx").on(t.status),
    index("calls_phone_number_idx").on(t.phoneNumber),
  ],
);

/**
 * One row per call source: when we last accepted a call and when we last turned
 * a request away (bad secret, malformed body). Drives the header status.
 */
export const ingestionState = sqliteTable("ingestion_state", {
  provider: text("provider").primaryKey(),
  lastReceivedAt: integer("last_received_at", { mode: "timestamp_ms" }),
  lastRejectedAt: integer("last_rejected_at", { mode: "timestamp_ms" }),
  lastRejectReason: text("last_reject_reason"),
});
