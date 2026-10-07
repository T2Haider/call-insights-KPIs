import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CallsToolbarProps {
  search: string;
  fromDate: string;
  toDate: string;
  rangeInvalid: boolean;
  filtersActive: boolean;
  onSearchChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear: () => void;
}

export function CallsToolbar(props: CallsToolbarProps) {
  const { search, fromDate, toDate, rangeInvalid, filtersActive } = props;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label htmlFor="call-search" className="sr-only">
            Search by phone number or conversation ID
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="call-search"
            type="search"
            value={search}
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder="Search phone or conversation ID"
            className="pl-8"
            maxLength={100}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="date-from" className="block text-xs text-muted-foreground">
              From
            </label>
            <Input
              id="date-from"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => props.onFromChange(e.target.value)}
              aria-invalid={rangeInvalid}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="date-to" className="block text-xs text-muted-foreground">
              To
            </label>
            <Input
              id="date-to"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => props.onToChange(e.target.value)}
              aria-invalid={rangeInvalid}
            />
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={props.onClear}>
              <X aria-hidden data-icon="inline-start" /> Clear
            </Button>
          )}
        </div>
      </div>
      {rangeInvalid && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          The end date is before the start date, so the date range is not applied.
        </p>
      )}
    </div>
  );
}
