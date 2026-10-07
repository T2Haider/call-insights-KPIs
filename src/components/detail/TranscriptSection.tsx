"use client";

import { ChevronDown, ChevronUp, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CallStatus } from "@/domain/call";
import type { Transcript } from "@/domain/transcript";
import { speakerKind, speakerLabel, type SpeakerKind } from "@/lib/speaker";
import { matchingMessageIndices, splitByQuery, totalMatches } from "@/lib/transcriptSearch";
import { cn } from "@/lib/utils";

interface TranscriptSectionProps {
  transcript: Transcript | null;
  status: CallStatus;
}

const BUBBLE: Record<SpeakerKind, string> = {
  agent: "bg-muted",
  caller: "border border-primary/20 bg-primary/10",
  other: "border border-dashed",
};

function Highlighted({ text, query }: { text: string; query: string }) {
  return splitByQuery(text, query).map((part, i) =>
    part.match ? (
      <mark
        key={i}
        className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40"
      >
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

/**
 * Chat-style transcript. Message text is rendered exactly as received (line
 * breaks kept, nothing trimmed, merged or edited) and only ever as text, never
 * as HTML. There are no per-message timestamps, so no click-to-seek.
 */
export function TranscriptSection({ transcript, status }: TranscriptSectionProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const messageRefs = useRef(new Map<number, HTMLLIElement>());

  const matches = useMemo(
    () => (transcript ? matchingMessageIndices(transcript, query) : []),
    [transcript, query],
  );
  const occurrences = transcript ? totalMatches(transcript, query) : 0;
  const activeMatch =
    matches.length > 0 ? matches[Math.min(active, matches.length - 1)] : undefined;

  // Scroll the current match into view when the search or the selection changes.
  useEffect(() => {
    if (activeMatch === undefined) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messageRefs.current
      .get(activeMatch)
      ?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeMatch, query]);

  const step = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    setActive((current) => (current + direction + matches.length) % matches.length);
  };

  return (
    <section aria-labelledby="transcript-heading">
      <h3 id="transcript-heading" className="mb-2 text-sm font-medium">
        Transcript
      </h3>

      {transcript === null ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
        >
          {status === "failed" ? (
            "Transcript unavailable"
          ) : (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> Transcript
              processing...
            </>
          )}
        </p>
      ) : (
        <>
          {/* Sticky so the search stays reachable while scrolling a long transcript. */}
          <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b bg-popover px-4 py-2">
            <div className="relative flex-1">
              <label htmlFor="transcript-search" className="sr-only">
                Search this transcript
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="transcript-search"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    step(e.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="Search transcript"
                className="pl-8"
                autoComplete="off"
              />
            </div>
            {query.trim() && (
              <>
                <span
                  className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                  aria-live="polite"
                >
                  {matches.length === 0
                    ? "No matches"
                    : `${Math.min(active, matches.length - 1) + 1} of ${matches.length} messages`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => step(-1)}
                  disabled={matches.length === 0}
                  aria-label="Previous match"
                >
                  <ChevronUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => step(1)}
                  disabled={matches.length === 0}
                  aria-label="Next match"
                >
                  <ChevronDown aria-hidden />
                </Button>
              </>
            )}
          </div>
          {query.trim() && occurrences > 0 && (
            <p className="sr-only">{occurrences} matches in total</p>
          )}

          <ol aria-label={`Transcript, ${transcript.length} messages`} className="space-y-3 pt-3">
            {transcript.map((message, index) => {
              const kind = speakerKind(message.speaker);
              return (
                <li
                  key={index}
                  ref={(node) => {
                    if (node) messageRefs.current.set(index, node);
                    else messageRefs.current.delete(index);
                  }}
                  className={cn(
                    "flex flex-col gap-1",
                    kind === "caller" ? "items-end" : "items-start",
                  )}
                >
                  <span className="px-1 text-xs font-medium text-muted-foreground">
                    {speakerLabel(message.speaker)}
                  </span>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                      BUBBLE[kind],
                      activeMatch === index && "ring-2 ring-ring",
                    )}
                  >
                    {message.text === "" ? (
                      <span className="text-muted-foreground italic">(empty message)</span>
                    ) : (
                      <Highlighted text={message.text} query={query} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
