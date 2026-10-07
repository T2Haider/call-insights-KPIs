import { CalendarDays, Clock, PhoneIncoming } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SummaryDto } from "@/services/summaryService";

interface SummaryCardsProps {
  data: SummaryDto | null;
  error: string | null;
  onRetry: () => void;
}

function StatCard({ label, icon, value }: { label: string; icon: ReactNode; value: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground" aria-hidden>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ data, error, onRetry }: SummaryCardsProps) {
  const loading = data === null && error === null;
  const failed = data === null && error !== null;
  const show = (render: (d: SummaryDto) => ReactNode): ReactNode => {
    if (loading) return <Skeleton className="h-8 w-16" />;
    if (failed || data === null) return "—";
    return render(data);
  };

  return (
    <section aria-label="Summary" className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Calls today"
          icon={<PhoneIncoming className="size-4" />}
          value={show((d) => d.callsToday)}
        />
        <StatCard
          label="Calls this week"
          icon={<CalendarDays className="size-4" />}
          value={show((d) => d.callsThisWeek)}
        />
        <StatCard
          label="Calls in the last hour"
          icon={<Clock className="size-4" />}
          value={show((d) => d.callsLastHour)}
        />
      </div>
      {failed && (
        <p role="alert" className="text-sm text-muted-foreground">
          Couldn&apos;t load the summary ({error}).{" "}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
            Retry
          </Button>
        </p>
      )}
    </section>
  );
}
