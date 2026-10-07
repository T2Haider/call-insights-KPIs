import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CallStatus } from "@/domain/call";
import { cn } from "@/lib/utils";

const STATUS: Record<CallStatus, { label: string; className: string; icon: typeof Loader2 }> = {
  completed: {
    label: "Completed",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  processing: {
    label: "Processing",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: Loader2,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/10 text-red-700 dark:text-red-400",
    icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: CallStatus }) {
  const { label, className, icon: Icon } = STATUS[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      <Icon
        aria-hidden
        data-icon="inline-start"
        className={status === "processing" ? "motion-safe:animate-spin" : undefined}
      />
      {label}
    </Badge>
  );
}
