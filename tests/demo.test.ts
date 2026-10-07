import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findCallById } from "@/db/callRepository";
import { DEMO_CALLS } from "@/demo/calls";
import { buildDemoPayload, demoConversationId, demoRecordingFile } from "@/demo/payloads";
import { wavDurationSeconds } from "@/demo/wav";
import { noopPublisher } from "@/events/types";
import { ingestCall } from "@/ingestion/ingestCall";
import { createLogger } from "@/lib/logger";
import { WebhookPayloadSchema } from "@/providers/webhook/payload";
import { createWebhookNormalizer } from "@/providers/webhook/normalizer";
import { memoryDb, TIMEOUT_MS } from "./helpers";

const NOW = new Date("2026-10-07T12:00:00Z");
const APP_URL = "http://localhost:3000";
const normalizer = createWebhookNormalizer({ defaultPhoneRegion: "US" });

/** A minimal PCM WAV: 8 kHz, 16-bit mono, with an extra chunk before "data". */
function wav(seconds: number): Uint8Array {
  const dataSize = 16_000 * seconds;
  const buffer = Buffer.alloc(12 + 24 + 10 + 8 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(8000, 24); // sample rate
  buffer.writeUInt32LE(16_000, 28); // byte rate
  buffer.write("LIST", 36);
  buffer.writeUInt32LE(2, 40);
  buffer.write("data", 46);
  buffer.writeUInt32LE(dataSize, 50);
  return buffer;
}

describe("demo calls", () => {
  it("has 20 calls with unique ids and fictional phone numbers", () => {
    expect(DEMO_CALLS).toHaveLength(20);
    expect(new Set(DEMO_CALLS.map(demoConversationId)).size).toBe(20);
    for (const call of DEMO_CALLS) {
      expect(call.phoneNumber).toMatch(/^\+1\d{3}55501\d{2}$|^\+4420794600\d{2}$/);
    }
  });

  it("is a conversation between Amelia (agent) and a caller (user)", () => {
    for (const call of DEMO_CALLS) {
      expect(call.transcript[0]).toMatchObject({ role: "agent" });
      expect(call.transcript[0]?.message).toContain("Amelia");
      expect(call.transcript.some((m) => m.role === "user")).toBe(true);
    }
  });

  it("builds valid webhook payloads that ingest as completed calls", async () => {
    const db = memoryDb();
    const deps = {
      db,
      normalizer,
      publisher: noopPublisher,
      processingTimeoutMs: TIMEOUT_MS,
      logger: createLogger("test"),
      now: () => NOW,
    };
    for (const demo of DEMO_CALLS) {
      const payload = buildDemoPayload(demo, { now: NOW, appUrl: APP_URL, durationSeconds: 42.4 });
      expect(WebhookPayloadSchema.safeParse(payload).success).toBe(true);

      const result = await ingestCall(deps, payload);
      expect(result.outcome).toBe("created");
      if (result.outcome !== "created") continue;

      const call = findCallById(db, result.callId);
      expect(call).toMatchObject({
        status: "completed",
        durationSeconds: 42,
        recordingUrl: `${APP_URL}/recordings/${demoRecordingFile(demo)}`,
        startedAt: new Date(NOW.getTime() - demo.minutesAgo * 60_000),
      });
      expect(call?.transcript).toHaveLength(demo.transcript.length);
    }
    db.$client.close();
  });

  it("leaves the end time and duration empty when the recording length is unknown", () => {
    const payload = buildDemoPayload(DEMO_CALLS[0]!, {
      now: NOW,
      appUrl: APP_URL,
      durationSeconds: null,
    });
    expect(payload).not.toHaveProperty("duration_seconds");
    expect(payload).not.toHaveProperty("ended_at");
  });

  it("has a committed recording for every call", () => {
    for (const call of DEMO_CALLS) {
      const file = path.join(process.cwd(), "public", "recordings", demoRecordingFile(call));
      expect(wavDurationSeconds(readFileSync(file))).toBeGreaterThan(3);
    }
  });
});

describe("wavDurationSeconds", () => {
  it("reads the length from the header, skipping unrelated chunks", () => {
    expect(wavDurationSeconds(wav(3))).toBe(3);
  });

  it("returns null for anything that is not a WAV file", () => {
    expect(wavDurationSeconds(new Uint8Array())).toBeNull();
    expect(wavDurationSeconds(Buffer.from("not a wav file at all"))).toBeNull();
    expect(wavDurationSeconds(wav(1).subarray(0, 30))).toBeNull();
  });
});
