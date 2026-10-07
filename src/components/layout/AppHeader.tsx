import { PhoneCall } from "lucide-react";
import { LastReceived } from "@/components/status/LastReceived";
import { LiveIndicator } from "@/components/status/LiveIndicator";
import { WebhookAlert } from "@/components/status/WebhookAlert";
import type { IngestionStatusView } from "@/hooks/useCalls";
import type { ConnectionState } from "@/hooks/useEventStream";
import { ThemeToggle } from "./ThemeToggle";

interface AppHeaderProps {
  connection: ConnectionState;
  ingestion: IngestionStatusView | null;
}

export function AppHeader({ connection, ingestion }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <PhoneCall className="size-5" aria-hidden />
          <h1 className="text-base font-semibold tracking-tight">Call Insights</h1>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <WebhookAlert status={ingestion?.status} />
          <LiveIndicator connection={connection} />
          <span className="hidden sm:inline">
            <LastReceived ingestion={ingestion} />
          </span>
          <ThemeToggle />
        </div>

        <div className="w-full sm:hidden">
          <LastReceived ingestion={ingestion} />
        </div>
      </div>
    </header>
  );
}
