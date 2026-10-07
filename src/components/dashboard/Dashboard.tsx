"use client";

import { useEffect, useMemo, useState } from "react";
import { CallsList } from "@/components/calls/CallsList";
import { CallsToolbar } from "@/components/calls/CallsToolbar";
import { CallDetailSheet } from "@/components/detail/CallDetailSheet";
import { AppHeader } from "@/components/layout/AppHeader";
import { SummaryCards } from "@/components/summary/SummaryCards";
import { hasActiveFilters, type CallFilters } from "@/domain/callFilters";
import { useCalls } from "@/hooks/useCalls";
import { useQueryParam } from "@/hooks/useQueryParam";
import { useSummary } from "@/hooks/useSummary";
import { dateInputsToRange } from "@/lib/format";

const SEARCH_DEBOUNCE_MS = 300;

export function Dashboard() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const rangeInvalid = Boolean(fromDate && toDate && toDate < fromDate);

  const filters = useMemo<CallFilters>(() => {
    const range = rangeInvalid ? {} : dateInputsToRange(fromDate, toDate);
    return { search: debouncedSearch, ...range };
  }, [debouncedSearch, fromDate, toDate, rangeInvalid]);

  // The open call lives in the URL (?call=<internal id>): linkable, and Back closes the panel.
  const [selectedId, setSelectedId] = useQueryParam("call");

  const calls = useCalls(filters);
  const summary = useSummary(calls.changeVersion);

  const filtersActive = hasActiveFilters({ search, from: fromDate, to: toDate });
  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFromDate("");
    setToDate("");
  };

  return (
    <>
      <AppHeader connection={calls.connection} ingestion={calls.ingestionStatus} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <SummaryCards data={summary.data} error={summary.error} onRetry={summary.retry} />
        <section aria-label="Calls" className="space-y-4">
          <CallsToolbar
            search={search}
            fromDate={fromDate}
            toDate={toDate}
            rangeInvalid={rangeInvalid}
            filtersActive={filtersActive}
            onSearchChange={setSearch}
            onFromChange={setFromDate}
            onToChange={setToDate}
            onClear={clearFilters}
          />
          <CallsList
            state={calls}
            filtersActive={filtersActive}
            onLoadMore={calls.loadMore}
            onReload={calls.reload}
            onClearFilters={clearFilters}
            selectedId={selectedId}
            onSelect={(call) => setSelectedId(call.id, "push")}
          />
        </section>
      </main>
      <CallDetailSheet
        callId={selectedId}
        onClose={() => setSelectedId(null, "replace")}
        refreshKey={calls.changeVersion}
      />
    </>
  );
}
