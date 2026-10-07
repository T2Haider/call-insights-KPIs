import { describe, expect, it } from "vitest";
import { upsertCall } from "@/db/callRepository";
import { buildCallsQuery } from "@/lib/api";
import { formatCallDuration, formatOptionalDateTime, startOfLocalWeek } from "@/lib/format";
import { AGENT_LABEL, CALLER_LABEL, speakerKind, speakerLabel } from "@/lib/speaker";
import { listCalls } from "@/services/callQueries";
import { FAKE_CONVERSATION_ID, FAKE_PHONE } from "./fixtures";
import { builderFor, memoryDb } from "./helpers";

describe("speaker labels (display only; stored roles are untouched)", () => {
  it("shows agent as Amelia (AI Agent) and user as Caller, case-insensitively", () => {
    expect(speakerLabel("agent")).toBe(AGENT_LABEL);
    expect(speakerLabel("AGENT")).toBe("Amelia (AI Agent)");
    expect(speakerLabel(" user ")).toBe(CALLER_LABEL);
    expect(speakerLabel("user")).toBe("Caller");
  });

  it("shows unknown roles exactly as received", () => {
    expect(speakerLabel("supervisor")).toBe("supervisor");
    expect(speakerLabel("Unknown")).toBe("Unknown");
    expect(speakerKind("supervisor")).toBe("other");
    expect(speakerKind("agent")).toBe("agent");
    expect(speakerKind("user")).toBe("caller");
  });
});

describe("missing end time and duration", () => {
  it("shows a dash when unknown, and the value when known", () => {
    expect(formatCallDuration(null)).toBe("—");
    expect(formatCallDuration(0)).toBe("0s");
    expect(formatCallDuration(272)).toBe("4m 32s");
    expect(formatOptionalDateTime(null)).toBe("—");
    expect(formatOptionalDateTime("2026-10-06T17:56:51Z")).not.toBe("—");
  });
});

describe("startOfLocalWeek (Monday-based)", () => {
  it("returns local Monday 00:00 for any day of the week", () => {
    const monday = new Date(2026, 0, 5); // Mon 5 Jan 2026
    for (let day = 0; day < 7; day++) {
      const d = new Date(2026, 0, 5 + day, 15, 30);
      expect(startOfLocalWeek(d).getTime()).toBe(monday.getTime());
    }
    expect(startOfLocalWeek(new Date(2026, 0, 11, 23, 59)).getTime()).toBe(monday.getTime()); // Sunday
    expect(startOfLocalWeek(new Date(2026, 0, 12, 0, 0)).getTime()).toBe(
      new Date(2026, 0, 12).getTime(),
    ); // next Monday
  });
});

describe("conversation ids containing '+' and '_' in URLs and search", () => {
  it("percent-encodes the id in the search query, so '+' is not turned into a space", () => {
    const query = buildCallsQuery({ filters: { search: FAKE_CONVERSATION_ID } });
    expect(query).toBe("search=call-_%2B13125550123_AbCdEf123456");
    expect(query).not.toContain("+");
    // What the server sees after decoding:
    expect(new URLSearchParams(query).get("search")).toBe(FAKE_CONVERSATION_ID);
  });

  it("round-trips through a real URL the way the API route reads it", () => {
    const url = new URL(
      `http://localhost/api/calls?${buildCallsQuery({ filters: { search: FAKE_CONVERSATION_ID } })}`,
    );
    expect(url.searchParams.get("search")).toBe(FAKE_CONVERSATION_ID);
  });

  it("encodes ids placed in a path segment", () => {
    expect(encodeURIComponent(FAKE_CONVERSATION_ID)).toBe("call-_%2B13125550123_AbCdEf123456");
  });

  it("finds a call by its full conversation id, and by a fragment of it", () => {
    const db = memoryDb();
    upsertCall(
      db,
      FAKE_CONVERSATION_ID,
      builderFor({ conversationId: FAKE_CONVERSATION_ID, phoneNumber: FAKE_PHONE }),
    );
    upsertCall(
      db,
      "call-_+14155550101_Zzzzzzzzzzzz",
      builderFor({
        conversationId: "call-_+14155550101_Zzzzzzzzzzzz",
        phoneNumber: "+14155550101",
      }),
    );

    const found = (search: string) =>
      listCalls(db, { filters: { search } }).items.map((c) => c.conversationId);

    expect(found(FAKE_CONVERSATION_ID)).toEqual([FAKE_CONVERSATION_ID]);
    expect(found("AbCdEf123456")).toEqual([FAKE_CONVERSATION_ID]);
    expect(found("call-_+1312")).toEqual([FAKE_CONVERSATION_ID]);
    expect(found("_+1312555")).toEqual([FAKE_CONVERSATION_ID]);
    expect(found("call-_")).toHaveLength(2); // "_" is literal here, not a wildcard
    expect(found("call-x")).toEqual([]);
  });
});
