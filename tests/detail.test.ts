import { describe, expect, it } from "vitest";
import type { Transcript } from "@/domain/transcript";
import { readParam, withParam } from "@/lib/urlParams";
import {
  countMatches,
  matchingMessageIndices,
  splitByQuery,
  totalMatches,
} from "@/lib/transcriptSearch";
import { FAKE_CONVERSATION_ID } from "./fixtures";

const transcript: Transcript = [
  { speaker: "agent", text: "Thank you for calling. Are you calling about your billing today?" },
  { speaker: "user", text: "Yes, I'd like to update my BILLING address." },
  { speaker: "agent", text: "I can help with that.\n\nCould you share your account number?" },
  { speaker: "user", text: "Sure. And I also wanted to ask whether" },
];

describe("splitByQuery (transcript highlighting)", () => {
  it("cuts text into plain and matching parts, ignoring case, without altering the text", () => {
    const parts = splitByQuery("Yes, I'd like to update my BILLING address.", "billing");
    expect(parts).toEqual([
      { text: "Yes, I'd like to update my ", match: false },
      { text: "BILLING", match: true },
      { text: " address.", match: false },
    ]);
    expect(parts.map((p) => p.text).join("")).toBe("Yes, I'd like to update my BILLING address.");
  });

  it("finds every occurrence", () => {
    expect(splitByQuery("aXbxc", "x").filter((p) => p.match)).toHaveLength(2);
    expect(countMatches("billing billing billing", "billing")).toBe(3);
  });

  it("returns the text whole when there is no query or no match", () => {
    expect(splitByQuery("hello", "")).toEqual([{ text: "hello", match: false }]);
    expect(splitByQuery("hello", "   ")).toEqual([{ text: "hello", match: false }]);
    expect(splitByQuery("hello", "zzz")).toEqual([{ text: "hello", match: false }]);
    expect(splitByQuery("", "a")).toEqual([{ text: "", match: false }]);
  });

  it("treats the query literally, never as a pattern", () => {
    expect(countMatches("a.c abc", ".")).toBe(1);
    expect(countMatches("(555) 0123", "(555)")).toBe(1);
    expect(countMatches("what? why", "?")).toBe(1);
    expect(countMatches("a+b", "+")).toBe(1);
    expect(() => splitByQuery("x", "[")).not.toThrow();
  });

  it("preserves line breaks inside matched and unmatched parts", () => {
    const text = "I can help with that.\n\nCould you share your account number?";
    const parts = splitByQuery(text, "help with that.\n\nCould");
    expect(parts.some((p) => p.match)).toBe(true);
    expect(parts.map((p) => p.text).join("")).toBe(text);
  });

  it("never treats message text as HTML (it only returns strings)", () => {
    const parts = splitByQuery("<script>alert(1)</script> hello", "hello");
    expect(parts.map((p) => p.text).join("")).toBe("<script>alert(1)</script> hello");
  });
});

describe("transcript search across messages", () => {
  it("lists which messages match, in order, and counts occurrences", () => {
    expect(matchingMessageIndices(transcript, "billing")).toEqual([0, 1]);
    expect(matchingMessageIndices(transcript, "ACCOUNT NUMBER")).toEqual([2]);
    expect(matchingMessageIndices(transcript, "whether")).toEqual([3]);
    expect(matchingMessageIndices(transcript, "nothing like this")).toEqual([]);
    expect(totalMatches(transcript, "billing")).toBe(2);
    expect(totalMatches(transcript, "a")).toBeGreaterThan(5);
  });

  it("matches across a line break in a single message and finds nothing for an empty query", () => {
    expect(matchingMessageIndices(transcript, "that.\n\nCould")).toEqual([2]);
    expect(matchingMessageIndices(transcript, "")).toEqual([]);
    expect(totalMatches(transcript, "  ")).toBe(0);
  });
});

describe("?call= URL parameter", () => {
  const location = { pathname: "/", search: "", hash: "" };

  it("reads the parameter, treating empty as absent", () => {
    expect(readParam("?call=abc", "call")).toBe("abc");
    expect(readParam("?call=", "call")).toBeNull();
    expect(readParam("", "call")).toBeNull();
    expect(readParam("?other=1", "call")).toBeNull();
  });

  it("sets the parameter and keeps the others", () => {
    expect(withParam(location, "call", "abc-123")).toBe("/?call=abc-123");
    expect(withParam({ ...location, search: "?x=1" }, "call", "abc")).toBe("/?x=1&call=abc");
    expect(withParam({ ...location, search: "?call=old&x=1", hash: "#h" }, "call", "new")).toBe(
      "/?call=new&x=1#h",
    );
  });

  it("removes the parameter, leaving a clean URL", () => {
    expect(withParam({ ...location, search: "?call=abc" }, "call", null)).toBe("/");
    expect(withParam({ ...location, search: "?call=abc&x=1" }, "call", null)).toBe("/?x=1");
  });

  it("percent-encodes values, so an id with + or _ round-trips safely", () => {
    const url = withParam(location, "call", FAKE_CONVERSATION_ID);
    expect(url).toBe("/?call=call-_%2B13125550123_AbCdEf123456");
    expect(readParam(url.slice(1), "call")).toBe(FAKE_CONVERSATION_ID);
  });
});
