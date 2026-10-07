import type { ConnectionState } from "@/hooks/useEventStream";
import { cn } from "@/lib/utils";

const COPY: Record<ConnectionState, { label: string; dot: string }> = {
  live: { label: "Live", dot: "bg-emerald-500" },
  reconnecting: { label: "Reconnecting…", dot: "bg-amber-500" },
  connecting: { label: "Connecting…", dot: "bg-muted-foreground" },
};

/** Connection state of the live stream. Text + color, never color alone. */
export function LiveIndicator({ connection }: { connection: ConnectionState }) {
  const { label, dot } = COPY[connection];
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm font-medium">
      <span className="relative flex size-2">
        {connection === "live" && (
          <span
            className={cn(
              "absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping",
              dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      {label}
    </span>
  );
}
