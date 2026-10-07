import { describe, expect, it } from "vitest";
import { NormalizedCallInputSchema } from "@/domain/call";
import { deriveStatus } from "@/domain/status";
import { transcriptFromPlainText } from "@/domain/transcript";
import { formatPhoneForDisplay, toE164 } from "@/lib/phone";
import { loadConfig } from "@/lib/config";
import { TIMEOUT_MS, makeInput } from "./helpers";

describe("NormalizedCallInputSchema (validation)", () => {
  it("accepts a valid call and coerces ISO date strings", () => {
    const parsed = NormalizedCallInputSchema.parse(
      makeInput({ startedAt: "2026-01-01T10:00:00Z" as unknown as Date }),
    );
    expect(parsed.startedAt).toBeInstanceOf(Date);
    expect(parsed.failed).toBe(false);
  });

  it.each([
    ["empty conversationId", { conversationId: "" }],
    ["non-E.164 phone", { phoneNumber: "415-555-0123" }],
    ["invalid recording URL", { recordingUrl: "not a url" }],
    ["end before start", { endedAt: new Date("2026-01-01T09:00:00Z") }],
    ["negative duration", { durationSeconds: -1 }],
    ["transcript segment without speaker", { transcript: [{ speaker: "", text: "hi" }] }],
  ])("rejects %s", (_label, overrides) => {
    expect(NormalizedCallInputSchema.safeParse(makeInput(overrides)).success).toBe(false);
  });

  it("allows null recording and transcript (still processing)", () => {
    expect(
      NormalizedCallInputSchema.safeParse(makeInput({ recordingUrl: null, transcript: null }))
        .success,
    ).toBe(true);
  });
});

describe("deriveStatus", () => {
  const since = new Date("2026-01-01T10:00:00Z");
  const soon = new Date(since.getTime() + 60_000);
  const late = new Date(since.getTime() + TIMEOUT_MS + 1);
  const transcript = [{ speaker: "A", text: "x" }];

  it("is completed only when both recording and transcript exist", () => {
    const base = { failed: false, since };
    expect(
      deriveStatus({ ...base, recordingUrl: "https://x.y/a", transcript }, soon, TIMEOUT_MS),
    ).toBe("completed");
    expect(deriveStatus({ ...base, recordingUrl: null, transcript }, soon, TIMEOUT_MS)).toBe(
      "processing",
    );
    expect(
      deriveStatus({ ...base, recordingUrl: "https://x.y/a", transcript: null }, soon, TIMEOUT_MS),
    ).toBe("processing");
  });

  it("is failed when the provider says so or the timeout passes", () => {
    expect(
      deriveStatus(
        { failed: true, recordingUrl: "https://x.y/a", transcript, since },
        soon,
        TIMEOUT_MS,
      ),
    ).toBe("failed");
    expect(
      deriveStatus(
        { failed: false, recordingUrl: null, transcript: null, since },
        late,
        TIMEOUT_MS,
      ),
    ).toBe("failed");
  });
});

describe("transcriptFromPlainText", () => {
  it("wraps plain text in a single segment", () => {
    expect(transcriptFromPlainText("  Hello there  ")).toEqual([
      { speaker: "Unknown", text: "Hello there" },
    ]);
  });
  it("returns null for blank text", () => {
    expect(transcriptFromPlainText("   ")).toBeNull();
  });
});

describe("phone helpers", () => {
  it("normalizes to E.164 using the default region", () => {
    expect(toE164("(415) 555-2671", "US")).toBe("+14155552671");
    expect(toE164("+44 20 7946 0958", "US")).toBe("+442079460958");
  });
  it("returns null for invalid numbers", () => {
    expect(toE164("12345", "US")).toBeNull();
  });
  it("formats for display", () => {
    expect(formatPhoneForDisplay("+14155552671")).toBe("(415) 555-2671");
    expect(formatPhoneForDisplay("+442079460958")).toBe("+44 20 7946 0958");
  });
});

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig({});
    expect(c.RETENTION_DAYS).toBe(30);
    expect(c.PROCESSING_TIMEOUT_MINUTES).toBe(120);
    expect(c.WEBHOOK_MAX_BODY_BYTES).toBe(5_242_880);
    expect(c.RECORDING_BASE_URL).toBeUndefined();
  });
  it("allows RETENTION_DAYS=0 to disable cleanup", () => {
    expect(loadConfig({ RETENTION_DAYS: "0" }).RETENTION_DAYS).toBe(0);
  });
  it("fails fast with a readable message on bad values", () => {
    expect(() => loadConfig({ WORKER_INTERVAL_SECONDS: "abc" })).toThrow(/WORKER_INTERVAL_SECONDS/);
    expect(() => loadConfig({ WEBHOOK_SECRET: "short" })).toThrow(/WEBHOOK_SECRET/);
  });
  it("refuses the default webhook and internal secrets in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/WEBHOOK_SECRET/);
    expect(() =>
      loadConfig({ NODE_ENV: "production", WEBHOOK_SECRET: "a-real-secret-value-123" }),
    ).toThrow(/INTERNAL_EVENTS_SECRET/);
    expect(
      loadConfig({
        NODE_ENV: "production",
        WEBHOOK_SECRET: "a-real-secret-value-123",
        INTERNAL_EVENTS_SECRET: "another-real-secret-456",
      }).NODE_ENV,
    ).toBe("production");
  });
  it("allows the dev defaults outside production", () => {
    expect(loadConfig({ NODE_ENV: "development" }).WEBHOOK_SECRET).toBe("dev-only-webhook-secret");
  });
});
