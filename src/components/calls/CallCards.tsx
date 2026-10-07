import type { CallSummaryDto } from "@/domain/callDto";
import { formatCallDuration, formatDateTime } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { ConversationId } from "./ConversationId";
import { RecordingStatus } from "./RecordingStatus";
import { StatusBadge } from "./StatusBadge";

interface CallsViewProps {
  calls: CallSummaryDto[];
  highlighted: string[];
  selectedId: string | null;
  onSelect: (call: CallSummaryDto) => void;
}

/** Phone layout: one stacked card per call. */
export function CallCards({ calls, highlighted, selectedId, onSelect }: CallsViewProps) {
  return (
    <ul className="divide-y">
      {calls.map((call) => (
        <li
          key={call.id}
          onClick={() => onSelect(call)}
          className={cn(
            "cursor-pointer space-y-2 px-4 py-3",
            selectedId === call.id && "bg-muted/50",
            highlighted.includes(call.id) && "call-highlight",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <button
                type="button"
                className="rounded-sm text-left font-medium tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`Open call with ${formatPhoneForDisplay(call.phoneNumber)}`}
              >
                {formatPhoneForDisplay(call.phoneNumber)}
              </button>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(call.startedAt)} · {formatCallDuration(call.durationSeconds)}
              </p>
            </div>
            <StatusBadge status={call.status} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConversationId id={call.conversationId} />
            <RecordingStatus call={call} />
          </div>
        </li>
      ))}
    </ul>
  );
}
