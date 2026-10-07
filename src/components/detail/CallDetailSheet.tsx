"use client";

import { AlertCircle, SearchX } from "lucide-react";
import { StatusBadge } from "@/components/calls/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallDetail } from "@/hooks/useCallDetail";
import { formatPhoneForDisplay } from "@/lib/phone";
import { CallMetadata } from "./CallMetadata";
import { RecordingSection } from "./RecordingSection";
import { TranscriptSection } from "./TranscriptSection";

interface CallDetailSheetProps {
  /** Internal call id from `?call=`; null closes the panel. */
  callId: string | null;
  onClose: () => void;
  /** Changes whenever something changed live; the open call is then refetched. */
  refreshKey: number;
}

function PanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading call" className="space-y-6 p-4">
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="ml-auto h-10 w-2/3" />
        <Skeleton className="h-16 w-4/5" />
      </div>
    </div>
  );
}

/** Side panel with everything about one call: details, recording, transcript. */
export function CallDetailSheet({ callId, onClose, refreshKey }: CallDetailSheetProps) {
  const { call, error, loading, retry } = useCallDetail(callId, refreshKey);

  let body;
  if (loading) {
    body = <PanelSkeleton />;
  } else if (error) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground" aria-hidden>
          {error.notFound ? <SearchX className="size-5" /> : <AlertCircle className="size-5" />}
        </div>
        <p className="font-medium">
          {error.notFound ? "This call is no longer available" : "Couldn't load this call"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error.notFound
            ? "It may have been removed by the data-retention policy, or the link is wrong."
            : error.message}
        </p>
        {error.notFound ? (
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    );
  } else if (call) {
    body = (
      <div className="space-y-6 p-4">
        <CallMetadata call={call} />
        <RecordingSection
          key={`rec-${call.id}`}
          recordingUrl={call.recordingUrl}
          status={call.status}
        />
        <TranscriptSection
          key={`tr-${call.id}`}
          transcript={call.transcript}
          status={call.status}
        />
      </div>
    );
  }

  return (
    <Sheet open={callId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b p-4 pr-14">
          <SheetTitle className="flex items-center gap-2">
            {call && !loading ? formatPhoneForDisplay(call.phoneNumber) : "Call details"}
            {call && !loading && <StatusBadge status={call.status} />}
          </SheetTitle>
          <SheetDescription>Details, recording and transcript for this call.</SheetDescription>
        </SheetHeader>
        {/* One scroll area for the whole body: comfortable for transcripts with 30+ messages. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
