import type { ReactNode } from "react";
import { CopyButton } from "@/components/common/CopyButton";
import { StatusBadge } from "@/components/calls/StatusBadge";
import type { CallDetailDto } from "@/domain/callDto";
import { formatCallDuration, formatFullDateTime, formatOptionalDateTime } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/phone";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Every stored fact about the call, with copy buttons for the phone number and conversation ID. */
export function CallMetadata({ call }: { call: CallDetailDto }) {
  return (
    <section aria-labelledby="metadata-heading">
      <h3 id="metadata-heading" className="mb-1 text-sm font-medium">
        Details
      </h3>
      <dl className="divide-y text-sm">
        <Row label="Phone number">
          <span className="inline-flex items-center gap-1">
            <span className="font-medium tabular-nums">
              {formatPhoneForDisplay(call.phoneNumber)}
            </span>
            <CopyButton value={call.phoneNumber} label="phone number" />
          </span>
        </Row>
        <Row label="Conversation ID">
          <span className="inline-flex items-start gap-1">
            <code className="font-mono text-xs break-all">{call.conversationId}</code>
            <CopyButton value={call.conversationId} label="conversation ID" />
          </span>
        </Row>
        <Row label="Started">
          <span className="tabular-nums">{formatFullDateTime(call.startedAt)}</span>
        </Row>
        <Row label="Ended">
          <span className="tabular-nums">{formatOptionalDateTime(call.endedAt)}</span>
        </Row>
        <Row label="Duration">
          <span className="tabular-nums">{formatCallDuration(call.durationSeconds)}</span>
        </Row>
        <Row label="Status">
          <StatusBadge status={call.status} />
        </Row>
        <Row label="Received">
          <span className="tabular-nums">{formatFullDateTime(call.createdAt)}</span>
        </Row>
      </dl>
    </section>
  );
}
