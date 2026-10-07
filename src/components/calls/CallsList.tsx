import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CallSummaryDto } from "@/domain/callDto";
import type { CallsState } from "@/hooks/callsReducer";
import { CallCards } from "./CallCards";
import { CallsTable } from "./CallsTable";
import { CallsEmpty, CallsError, CallsNoMatches, CallsSkeleton } from "./CallsStates";

interface CallsListProps {
  state: CallsState;
  filtersActive: boolean;
  onLoadMore: () => void;
  onReload: () => void;
  onClearFilters: () => void;
  selectedId: string | null;
  onSelect: (call: CallSummaryDto) => void;
}

/** Chooses between loading / error / empty / list, and renders pagination. */
export function CallsList({
  state,
  filtersActive,
  onLoadMore,
  onReload,
  onClearFilters,
  selectedId,
  onSelect,
}: CallsListProps) {
  const { items, highlighted, status, error, nextCursor, loadingMore } = state;

  let body;
  if (status === "loading") body = <CallsSkeleton />;
  else if (status === "error")
    body = <CallsError message={error ?? "Unknown error"} onRetry={onReload} />;
  else if (items.length === 0) {
    body = filtersActive ? <CallsNoMatches onClear={onClearFilters} /> : <CallsEmpty />;
  } else {
    body = (
      <>
        <div className="hidden md:block">
          <CallsTable
            calls={items}
            highlighted={highlighted}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
        <div className="md:hidden">
          <CallCards
            calls={items}
            highlighted={highlighted}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      </>
    );
  }

  const showFooter = status === "ready" && items.length > 0;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {status === "ready" && error && items.length > 0 && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b bg-red-500/5 px-4 py-2 text-sm text-red-700 dark:text-red-400"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={nextCursor ? onLoadMore : onReload}>
            Retry
          </Button>
        </div>
      )}
      {body}
      {showFooter && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
          <span aria-live="polite">
            {items.length} {items.length === 1 ? "call" : "calls"}
            {nextCursor ? " shown" : ""}
          </span>
          {nextCursor && (
            <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
              Load more
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
