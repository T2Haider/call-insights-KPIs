import { AlertCircle, PhoneOff, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function Message({
  icon,
  title,
  children,
  role,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground" aria-hidden>
        {icon}
      </div>
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}

export function CallsEmpty() {
  return (
    <Message role="status" icon={<PhoneOff className="size-5" />} title="No calls yet.">
      <p className="text-sm text-muted-foreground">Waiting for the first call...</p>
    </Message>
  );
}

export function CallsNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <Message
      role="status"
      icon={<SearchX className="size-5" />}
      title="No calls match your filters."
    >
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </Message>
  );
}

export function CallsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Message role="alert" icon={<AlertCircle className="size-5" />} title="Couldn't load calls">
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Message>
  );
}

export function CallsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading calls" className="divide-y">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="hidden h-4 w-14 sm:block" />
          <Skeleton className="hidden h-4 w-36 md:block" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
