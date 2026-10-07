"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readParam, withParam } from "@/lib/urlParams";

const CHANGE_EVENT = "query-param-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * One URL query parameter as state, kept in the address bar so the view is
 * linkable and the browser Back button works. Uses the native History API,
 * which the Next.js router integrates with.
 */
export function useQueryParam(name: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => readParam(window.location.search, name),
    () => null, // the server never sees the query string for this client-only state
  );

  const set = useCallback(
    (next: string | null, mode: "push" | "replace" = "push") => {
      const url = withParam(window.location, name, next);
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [name],
  );

  return [value, set] as const;
}
