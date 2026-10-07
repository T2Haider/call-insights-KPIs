"use client";

import { useCallback, useEffect, useState } from "react";
import type { CallDetailDto } from "@/domain/callDto";
import { ApiError, fetchCall } from "@/lib/api";

interface DetailResult {
  id: string;
  call: CallDetailDto | null;
  error: { message: string; notFound: boolean } | null;
}

/**
 * Loads one call (with its transcript) and keeps it fresh: `refreshKey` is
 * bumped on every live change notification, so a call that is still processing
 * fills in while the panel is open. A failed refresh never wipes what is shown.
 * The last result stays available after `id` becomes null, so the panel does
 * not go blank during its closing animation.
 */
export function useCallDetail(id: string | null, refreshKey: number) {
  const [result, setResult] = useState<DetailResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    fetchCall(id, controller.signal)
      .then((call) => setResult({ id, call, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = {
          message: error instanceof Error ? error.message : "Failed to load the call",
          notFound: error instanceof ApiError && error.status === 404,
        };
        // Keep showing what we already have for this call; only report if there is nothing.
        setResult((previous) =>
          previous?.id === id && previous.call ? previous : { id, call: null, error: failure },
        );
      });

    return () => controller.abort();
  }, [id, refreshKey, retryCount]);

  const loading = id !== null && result?.id !== id;
  return {
    call: result?.call ?? null,
    error: result?.error ?? null,
    loading,
    retry: useCallback(() => setRetryCount((n) => n + 1), []),
  };
}
