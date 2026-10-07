import { createDb, type Db } from "@/db/client";
import { NormalizedCallInputSchema, type NormalizedCallInput } from "@/domain/call";
import { buildCallWrite, type CallWrite } from "@/domain/mergeCall";

export const TIMEOUT_MS = 30 * 60 * 1000;

export function memoryDb(): Db {
  return createDb(":memory:");
}

export function makeInput(overrides: Partial<NormalizedCallInput> = {}): NormalizedCallInput {
  return {
    conversationId: "conv-1",
    phoneNumber: "+14155550123",
    startedAt: new Date("2026-01-01T10:00:00Z"),
    endedAt: new Date("2026-01-01T10:05:00Z"),
    recordingUrl: "https://minio.example.com/rec/conv-1.mp3",
    transcript: [{ speaker: "Agent", text: "Hello" }],
    failed: false,
    rawPayload: { id: "conv-1" },
    ...overrides,
  };
}

/** Validate + merge exactly like ingestion will, for use as an `upsertCall` builder. */
export function builderFor(
  overrides: Partial<NormalizedCallInput>,
  now = new Date("2026-01-01T10:06:00Z"),
): (existing: Parameters<typeof buildCallWrite>[0]["existing"]) => CallWrite {
  const input = NormalizedCallInputSchema.parse(makeInput(overrides));
  return (existing) =>
    buildCallWrite({ existing, input, provider: "fake", now, processingTimeoutMs: TIMEOUT_MS });
}
