import type { Call, CallStatus } from "./call";
import type { Transcript } from "./transcript";

/**
 * What crosses the API boundary (JSON-safe: dates are ISO strings). Shared by
 * route handlers and client code. `rawPayload` is deliberately never exposed.
 */
export interface CallSummaryDto {
  id: string;
  conversationId: string;
  provider: string;
  phoneNumber: string;
  startedAt: string;
  /** Null when the sender does not report an end time. */
  endedAt: string | null;
  /** Null when unknown. */
  durationSeconds: number | null;
  recordingUrl: string | null;
  hasTranscript: boolean;
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CallDetailDto extends CallSummaryDto {
  transcript: Transcript | null;
}

export function toCallSummaryDto(call: Call): CallSummaryDto {
  return {
    id: call.id,
    conversationId: call.conversationId,
    provider: call.provider,
    phoneNumber: call.phoneNumber,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds,
    recordingUrl: call.recordingUrl,
    hasTranscript: call.transcript !== null,
    status: call.status,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  };
}

export function toCallDetailDto(call: Call): CallDetailDto {
  return { ...toCallSummaryDto(call), transcript: call.transcript };
}

/** Drops the transcript so list state stays small. */
export function detailToSummary(detail: CallDetailDto): CallSummaryDto {
  const { transcript: _transcript, ...summary } = detail;
  return summary;
}

export interface CallsPageDto {
  items: CallSummaryDto[];
  nextCursor: string | null;
}
