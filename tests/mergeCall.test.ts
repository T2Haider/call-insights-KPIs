import { describe, expect, it } from "vitest";
import { findCallByConversationId, upsertCall } from "@/db/callRepository";
import { builderFor, memoryDb } from "./helpers";

describe("buildCallWrite recording-link merge rule", () => {
  const url = (n: number) => `https://minio.example.com/rec/conv-1-v${n}.mp3`;

  it("replaces an existing recording link with a newer non-null one", () => {
    const db = memoryDb();
    upsertCall(db, "conv-1", builderFor({ recordingUrl: url(1) }));

    const result = upsertCall(db, "conv-1", builderFor({ recordingUrl: url(2) }));

    expect(result.change).toBe("updated");
    expect(findCallByConversationId(db, "conv-1")?.recordingUrl).toBe(url(2));
  });

  it("refuses to overwrite an existing link with null", () => {
    const db = memoryDb();
    upsertCall(db, "conv-1", builderFor({ recordingUrl: url(1) }));

    const result = upsertCall(db, "conv-1", builderFor({ recordingUrl: null }));

    expect(result.change).toBe("unchanged");
    expect(findCallByConversationId(db, "conv-1")?.recordingUrl).toBe(url(1));
  });

  it("applies the same rule to transcripts", () => {
    const db = memoryDb();
    upsertCall(db, "conv-1", builderFor({ transcript: [{ speaker: "A", text: "old" }] }));
    upsertCall(db, "conv-1", builderFor({ transcript: [{ speaker: "A", text: "new" }] }));
    expect(findCallByConversationId(db, "conv-1")?.transcript?.[0]?.text).toBe("new");
    upsertCall(db, "conv-1", builderFor({ transcript: null }));
    expect(findCallByConversationId(db, "conv-1")?.transcript?.[0]?.text).toBe("new");
  });
});

describe("buildCallWrite: data only moves forward", () => {
  it("keeps the richer raw payload when a poorer copy arrives later", () => {
    const db = memoryDb();
    upsertCall(db, "conv-1", builderFor({ rawPayload: { full: true } }));
    const result = upsertCall(
      db,
      "conv-1",
      builderFor({ recordingUrl: null, transcript: null, rawPayload: { full: false } }),
    );
    expect(result.change).toBe("unchanged");
    expect(findCallByConversationId(db, "conv-1")?.rawPayload).toEqual({ full: true });
  });

  it("replaces the raw payload when the new copy adds information", () => {
    const db = memoryDb();
    upsertCall(
      db,
      "conv-1",
      builderFor({ recordingUrl: null, transcript: null, rawPayload: { early: true } }),
    );
    upsertCall(db, "conv-1", builderFor({ rawPayload: { complete: true } }));
    expect(findCallByConversationId(db, "conv-1")?.rawPayload).toEqual({ complete: true });
  });

  it("does not erase a known duration when a later copy reports none", () => {
    const db = memoryDb();
    upsertCall(db, "conv-1", builderFor({ durationSeconds: 300 }));
    // A later copy with no end time and no duration.
    const noDuration = builderFor({ durationSeconds: undefined, endedAt: null });
    const result = upsertCall(db, "conv-1", noDuration);
    expect(result.change).toBe("unchanged");
    expect(findCallByConversationId(db, "conv-1")).toMatchObject({
      durationSeconds: 300,
      endedAt: new Date("2026-01-01T10:05:00Z"),
    });
  });
});
