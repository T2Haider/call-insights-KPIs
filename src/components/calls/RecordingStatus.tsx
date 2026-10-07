import { Loader2, Mic, MicOff } from "lucide-react";
import type { CallSummaryDto } from "@/domain/callDto";

/** One short phrase for the recording column: Available / Processing… / Unavailable. */
export function RecordingStatus({
  call,
}: {
  call: Pick<CallSummaryDto, "recordingUrl" | "status">;
}) {
  if (call.recordingUrl) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Mic className="size-3.5 text-muted-foreground" aria-hidden /> Available
      </span>
    );
  }
  if (call.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <MicOff className="size-3.5" aria-hidden /> Unavailable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> Processing…
    </span>
  );
}
