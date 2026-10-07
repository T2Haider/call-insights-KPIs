"use client";

import { AlertTriangle, ExternalLink, Loader2, MicOff } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/common/CopyButton";
import { buttonVariants } from "@/components/ui/button";
import type { CallStatus } from "@/domain/call";
import { cn } from "@/lib/utils";

interface RecordingSectionProps {
  /** Presigned link to the recording; opaque, never fetched by the server. Null until available. */
  recordingUrl: string | null;
  status: CallStatus;
}

/**
 * The recording link only: it is opened in a new tab, copied, or played
 * straight from the link by the browser. The app never downloads, proxies or
 * stores audio. Presigned links expire, so a failed load gets a friendly
 * message while Open and Copy keep working (the link itself may still be
 * fine, e.g. a codec the browser cannot play).
 */
export function RecordingSection({ recordingUrl, status }: RecordingSectionProps) {
  // Remember WHICH link failed, so a new link for the same call gets a fresh chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const loadFailed = recordingUrl !== null && failedUrl === recordingUrl;

  return (
    <section aria-labelledby="recording-heading" className="space-y-3">
      <h3 id="recording-heading" className="text-sm font-medium">
        Recording
      </h3>

      {recordingUrl === null ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
        >
          {status === "failed" ? (
            <>
              <MicOff className="size-4" aria-hidden /> Recording unavailable
            </>
          ) : (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> Recording
              processing...
            </>
          )}
        </p>
      ) : (
        <>
          {loadFailed ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Recording link may have expired. You can still try opening it in a new tab.
            </p>
          ) : (
            <audio
              // key: switch cleanly when the link changes (e.g. a refreshed link arrives)
              key={recordingUrl}
              controls
              preload="metadata"
              src={recordingUrl}
              onError={() => setFailedUrl(recordingUrl)}
              className="w-full"
              aria-label="Call recording"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <ExternalLink aria-hidden />
              Open recording
            </a>
            <CopyButton value={recordingUrl} label="recording link" text="Copy link" />
          </div>
        </>
      )}
    </section>
  );
}
