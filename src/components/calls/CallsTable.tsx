import type { CallSummaryDto } from "@/domain/callDto";
import { formatCallDuration, formatDateTime } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConversationId } from "./ConversationId";
import { RecordingStatus } from "./RecordingStatus";
import { StatusBadge } from "./StatusBadge";

interface CallsViewProps {
  calls: CallSummaryDto[];
  highlighted: string[];
  selectedId: string | null;
  onSelect: (call: CallSummaryDto) => void;
}

/** Desktop / tablet layout. Phones get `CallCards` instead. */
export function CallsTable({ calls, highlighted, selectedId, onSelect }: CallsViewProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Phone number</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Conversation ID</TableHead>
          <TableHead>Recording</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {calls.map((call) => (
          <TableRow
            key={call.id}
            onClick={() => onSelect(call)}
            data-state={selectedId === call.id ? "selected" : undefined}
            className={cn("cursor-pointer", highlighted.includes(call.id) && "call-highlight")}
          >
            <TableCell className="whitespace-nowrap">{formatDateTime(call.startedAt)}</TableCell>
            <TableCell className="whitespace-nowrap">
              {/* A real button, so keyboard users can open the call; the click bubbles to the row. */}
              <button
                type="button"
                className="rounded-sm font-medium tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`Open call with ${formatPhoneForDisplay(call.phoneNumber)}`}
              >
                {formatPhoneForDisplay(call.phoneNumber)}
              </button>
            </TableCell>
            <TableCell className="tabular-nums">
              {formatCallDuration(call.durationSeconds)}
            </TableCell>
            <TableCell>
              <ConversationId id={call.conversationId} />
            </TableCell>
            <TableCell>
              <RecordingStatus call={call} />
            </TableCell>
            <TableCell>
              <StatusBadge status={call.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
