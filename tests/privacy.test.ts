import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/logger";
import { maskPhone, redactUrl, sanitizeForLog, scrubString } from "@/lib/redact";
import { FAKE_CONVERSATION_ID, FAKE_PHONE, FAKE_RECORDING_URL, FAKE_TRANSCRIPT } from "./fixtures";

describe("maskPhone", () => {
  it("keeps the start and the last four digits", () => {
    expect(maskPhone("+13125550123")).toBe("+1312***0123");
    expect(maskPhone("+442079460958")).toBe("+4420***0958");
    expect(maskPhone("3125550123")).toBe("3125***0123");
  });
  it("leaves short numbers alone", () => {
    expect(maskPhone("12345")).toBe("12345");
  });
});

describe("redactUrl: never log the presigned credential", () => {
  it("strips the query string and fragment", () => {
    const clean = redactUrl(FAKE_RECORDING_URL);
    expect(clean).toBe(
      "https://minio.example.com/bucket/recordings/2026/10/06/13125550123_20261006_180045.wav",
    );
    expect(clean).not.toContain("X-Amz");
    expect(redactUrl("https://a.example.com/x#frag")).toBe("https://a.example.com/x");
    expect(redactUrl("https://a.example.com/plain.wav")).toBe("https://a.example.com/plain.wav");
  });
});

describe("scrubString", () => {
  it("removes URL queries and masks phone numbers wherever they appear", () => {
    const text = `uploaded ${FAKE_RECORDING_URL} for ${FAKE_PHONE}`;
    const out = scrubString(text);
    expect(out).not.toContain("X-Amz-Signature");
    expect(out).not.toContain("5550123");
    expect(out).toContain("+1312***0123");
  });

  it("masks the phone number hidden inside a conversation id and a recording file name", () => {
    expect(scrubString(FAKE_CONVERSATION_ID)).toBe("call-_+1312***0123_AbCdEf123456");
    expect(scrubString("13125550123_20261006_180045.wav")).toBe("1312***0123_20261006_180045.wav");
  });
});

describe("sanitizeForLog", () => {
  it("redacts anything that may hold transcript text, whatever it is called", () => {
    const out = sanitizeForLog({
      transcript: FAKE_TRANSCRIPT,
      message: "I can help with that",
      Text: "x",
      rawPayload: { transcript: FAKE_TRANSCRIPT },
      payload: { a: 1 },
      body: "{}",
      status: 400,
    }) as Record<string, unknown>;

    expect(out).toEqual({
      transcript: "[redacted]",
      message: "[redacted]",
      Text: "[redacted]",
      rawPayload: "[redacted]",
      payload: "[redacted]",
      body: "[redacted]",
      status: 400,
    });
  });

  it("sanitizes nested values and caps deep or huge structures", () => {
    const out = JSON.stringify(
      sanitizeForLog({ a: { b: { url: FAKE_RECORDING_URL, who: [FAKE_PHONE] } } }),
    );
    expect(out).not.toContain("X-Amz");
    expect(out).toContain("+1312***0123");
    expect(JSON.stringify(sanitizeForLog({ list: Array.from({ length: 500 }, (_, i) => i) }))).toBe(
      JSON.stringify({ list: Array.from({ length: 20 }, (_, i) => i) }),
    );
  });
});

describe("logger output (what actually reaches the console)", () => {
  const lines: string[] = [];
  beforeEach(() => {
    lines.length = 0;
    vi.spyOn(console, "log").mockImplementation((l: string) => void lines.push(l));
    vi.spyOn(console, "warn").mockImplementation((l: string) => void lines.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void lines.push(l));
  });
  afterEach(() => vi.restoreAllMocks());

  it("never contains transcript text, recording credentials, or full phone numbers", () => {
    const log = createLogger("test");
    log.info(`Call created for ${FAKE_PHONE}`, {
      conversationId: FAKE_CONVERSATION_ID,
      recordingUrl: FAKE_RECORDING_URL,
      transcript: FAKE_TRANSCRIPT,
      rawPayload: { transcript: FAKE_TRANSCRIPT, call_recording_path: FAKE_RECORDING_URL },
    });
    log.error("Webhook failed", {
      error: new Error(`could not fetch ${FAKE_RECORDING_URL} for ${FAKE_PHONE}`),
    });

    const output = lines.join("\n");
    expect(output).toContain("+1312***0123");
    for (const secret of [
      "X-Amz-Signature",
      "0123456789abcdef",
      "your AI assistant",
      "account number",
      FAKE_PHONE,
      "13125550123",
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
