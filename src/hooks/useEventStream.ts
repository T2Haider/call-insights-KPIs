"use client";

import { useEffect, useRef, useState } from "react";
import type { CallEvent } from "@/events/types";
import type { IngestionStatusDto } from "@/services/ingestionStatus";

export type ConnectionState = "connecting" | "live" | "reconnecting";

interface Handlers {
  onCall: (event: CallEvent) => void;
  onStatus: (status: IngestionStatusDto) => void;
  /** Fired when the stream is re-established after a drop: refetch anything missed. */
  onReconnect: () => void;
}

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 15_000;

/**
 * Subscribes to the SSE stream and keeps it alive. The browser reconnects by
 * itself after network drops, but gives up for good if the server answers with
 * an error, so we also reconnect manually with backoff in that case.
 */
export function useEventStream(url: string, handlers: Handlers): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = MIN_RETRY_MS;
    let hadConnection = false;
    let disposed = false;

    const connect = () => {
      source = new EventSource(url);

      source.onopen = () => {
        retryMs = MIN_RETRY_MS;
        setConnection("live");
        if (hadConnection) handlersRef.current.onReconnect();
        hadConnection = true;
      };

      source.addEventListener("call", (e) => {
        handlersRef.current.onCall(JSON.parse((e as MessageEvent<string>).data) as CallEvent);
      });
      source.addEventListener("status", (e) => {
        handlersRef.current.onStatus(
          JSON.parse((e as MessageEvent<string>).data) as IngestionStatusDto,
        );
      });

      source.onerror = () => {
        if (disposed) return;
        setConnection("reconnecting");
        // readyState CLOSED: the browser will not retry on its own.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          hadConnection = true; // anything after this is a reconnect
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [url]);

  return connection;
}
