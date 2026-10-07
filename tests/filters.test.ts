import { describe, expect, it } from "vitest";
import { upsertCall } from "@/db/callRepository";
import { toCallSummaryDto, type CallSummaryDto } from "@/domain/callDto";
import { callMatchesFilters, hasActiveFilters, parseSearch } from "@/domain/callFilters";
import {
  dateInputsToRange,
  formatAge,
  formatDuration,
  startOfLocalDay,
  truncateMiddle,
} from "@/lib/format";
import { listCalls } from "@/services/callQueries";
import { getSummary } from "@/services/summaryService";
import { builderFor, memoryDb } from "./helpers";

function seedDb() {
  const db = memoryDb();
  const add = (id: string, phone: string, startIso: string, minutes = 5) => {
    const startedAt = new Date(startIso);
    upsertCall(
      db,
      id,
      builderFor({
        conversationId: id,
        phoneNumber: phone,
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * 60_000),
      }),
    );
  };
  add("conv_alpha", "+14155550101", "2026-01-01T10:00:00Z");
  add("conv_beta", "+12125550102", "2026-01-02T10:00:00Z");
  add("conv_100%_real", "+442079460958", "2026-01-03T10:00:00Z");
  return db;
}

const ids = (
  db: ReturnType<typeof memoryDb>,
  filters: Parameters<typeof listCalls>[1]["filters"],
) => listCalls(db, { filters }).items.map((c) => c.conversationId);

describe("listCalls filters (SQL)", () => {
  const db = seedDb();

  it("finds by phone number in any formatting", () => {
    expect(ids(db, { search: "(415) 555-0101" })).toEqual(["conv_alpha"]);
    expect(ids(db, { search: "+1 212" })).toEqual(["conv_beta"]);
    expect(ids(db, { search: "5550102" })).toEqual(["conv_beta"]);
  });

  it("finds by conversation ID, case-insensitively and by fragment", () => {
    expect(ids(db, { search: "ALPHA" })).toEqual(["conv_alpha"]);
    expect(ids(db, { search: "conv_" })).toHaveLength(3);
  });

  it("treats LIKE wildcards literally", () => {
    expect(ids(db, { search: "100%" })).toEqual(["conv_100%_real"]);
    expect(ids(db, { search: "%" })).toEqual(["conv_100%_real"]);
    expect(ids(db, { search: "_" })).toHaveLength(3); // each id contains a literal underscore
    expect(ids(db, { search: "conv_a_pha" })).toEqual([]); // "_" is not a single-char wildcard
  });

  it("filters by date range: from inclusive, to exclusive", () => {
    expect(ids(db, { from: "2026-01-02T00:00:00Z" })).toEqual(["conv_100%_real", "conv_beta"]);
    expect(ids(db, { to: "2026-01-02T10:00:00Z" })).toEqual(["conv_alpha"]);
    expect(ids(db, { from: "2026-01-02T00:00:00Z", to: "2026-01-03T00:00:00Z" })).toEqual([
      "conv_beta",
    ]);
  });

  it("combines search, dates and pagination", () => {
    const page1 = listCalls(db, { limit: 1, filters: { search: "conv_" } });
    const page2 = listCalls(db, {
      limit: 1,
      cursor: page1.nextCursor,
      filters: { search: "conv_" },
    });
    expect(page1.items[0]?.conversationId).toBe("conv_100%_real");
    expect(page2.items[0]?.conversationId).toBe("conv_beta");
  });
});

describe("callMatchesFilters (browser-side, mirrors SQL)", () => {
  const db = seedDb();
  const all: CallSummaryDto[] = listCalls(db, {}).items;
  const matching = (filters: Parameters<typeof callMatchesFilters>[1]) =>
    all.filter((c) => callMatchesFilters(c, filters)).map((c) => c.conversationId);

  it("agrees with the SQL results for the same filters", () => {
    for (const filters of [
      { search: "(415) 555-0101" },
      { search: "ALPHA" },
      { search: "100%" },
      { search: "conv_" },
      { from: "2026-01-02T00:00:00Z" },
      { to: "2026-01-02T10:00:00Z" },
      { search: "conv_", from: "2026-01-02T00:00:00Z", to: "2026-01-03T00:00:00Z" },
      {},
    ]) {
      expect(matching(filters).sort()).toEqual(ids(db, filters).sort());
    }
  });

  it("reports whether any filter is active", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ search: "   " })).toBe(false);
    expect(hasActiveFilters({ search: "a" })).toBe(true);
    expect(hasActiveFilters({ from: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(parseSearch(" Ab1 ")).toEqual({ text: "ab1", digits: "1" });
  });
});

describe("getSummary", () => {
  // Wednesday 2026-01-07 12:00 UTC
  const now = new Date("2026-01-07T12:00:00Z");
  const db = memoryDb();
  const add = (id: string, minutesAgo: number) =>
    upsertCall(
      db,
      id,
      builderFor({
        conversationId: id,
        startedAt: new Date(now.getTime() - minutesAgo * 60_000),
        endedAt: null,
      }),
    );
  add("last-week", 6 * 24 * 60); // Thursday before: outside this week
  add("monday", 2 * 24 * 60 + 60); // Monday morning
  add("this-morning", 200);
  add("recent", 30);

  const todayStart = new Date("2026-01-07T06:00:00Z");
  const weekStart = new Date("2026-01-05T00:00:00Z"); // Monday

  it("counts by call start: today, this week, and the last hour", () => {
    expect(getSummary(db, { todayStart, weekStart, now })).toEqual({
      callsToday: 2,
      callsThisWeek: 3,
      callsLastHour: 1,
    });
  });

  it("returns zeros when nothing falls in a range", () => {
    const future = new Date(now.getTime() + 1000);
    expect(getSummary(db, { todayStart: future, weekStart: future, now })).toEqual({
      callsToday: 0,
      callsThisWeek: 0,
      callsLastHour: 1,
    });
  });
});

describe("format helpers", () => {
  it("formats durations", () => {
    expect([0, 45, 60, 272, 3599, 3720].map(formatDuration)).toEqual([
      "0s",
      "45s",
      "1m 00s",
      "4m 32s",
      "59m 59s",
      "1h 02m",
    ]);
  });

  it("formats ages", () => {
    expect([0, 12, 59, 180, 7300].map(formatAge)).toEqual([
      "just now",
      "12s ago",
      "59s ago",
      "3m ago",
      "2h ago",
    ]);
  });

  it("truncates long ids but leaves short ones alone", () => {
    expect(truncateMiddle("conv_c815f38858504aa9")).toBe("conv_c815f…4aa9");
    expect(truncateMiddle("short")).toBe("short");
  });

  it("turns date inputs into a half-open local-day range", () => {
    const { from, to } = dateInputsToRange("2026-03-10", "2026-03-12");
    expect(new Date(from!).getTime()).toBe(new Date(2026, 2, 10).getTime());
    expect(new Date(to!).getTime()).toBe(new Date(2026, 2, 13).getTime()); // end date included
    expect(dateInputsToRange("", "")).toEqual({ from: undefined, to: undefined });
    expect(startOfLocalDay(new Date(2026, 2, 10, 15, 30)).getHours()).toBe(0);
  });

  it("summary dto round-trips through toCallSummaryDto", () => {
    const db = seedDb();
    const first = listCalls(db, {}).items[0]!;
    expect(Object.keys(first)).not.toContain("rawPayload");
    expect(toCallSummaryDto).toBeTypeOf("function");
  });
});

describe("list ordering", () => {
  const add = (db: ReturnType<typeof memoryDb>, id: string, start: string) =>
    upsertCall(
      db,
      id,
      builderFor({ conversationId: id, startedAt: new Date(start), endedAt: null }),
    );

  it("orders by call start, newest first, including calls with no end time or duration", () => {
    const db = memoryDb();
    add(db, "older", "2026-01-01T10:00:00Z");
    add(db, "newer", "2026-01-01T10:50:00Z");

    const page1 = listCalls(db, { limit: 1 });
    expect(page1.items[0]).toMatchObject({
      conversationId: "newer",
      endedAt: null,
      durationSeconds: null,
    });
    const page2 = listCalls(db, { limit: 1, cursor: page1.nextCursor });
    expect(page2.items[0]?.conversationId).toBe("older");
  });

  it("applies date filters to the call start", () => {
    const db = memoryDb();
    add(db, "before", "2026-01-01T23:55:00Z");
    add(db, "after", "2026-01-02T00:05:00Z");
    expect(listCalls(db, { filters: { from: "2026-01-02T00:00:00Z" } }).items).toHaveLength(1);
    expect(listCalls(db, { filters: { to: "2026-01-02T00:00:00Z" } }).items).toHaveLength(1);
    expect(
      listCalls(db, { filters: { from: "2026-01-02T00:00:00Z" } }).items[0]?.conversationId,
    ).toBe("after");
  });
});
