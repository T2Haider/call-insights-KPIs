import { CopyButton } from "@/components/common/CopyButton";
import { truncateMiddle } from "@/lib/format";

/** Truncated id (full value on hover / to assistive tech) with a copy button. */
export function ConversationId({ id }: { id: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono text-xs text-muted-foreground" title={id}>
        {truncateMiddle(id)}
      </code>
      <CopyButton value={id} label="conversation ID" />
    </span>
  );
}
