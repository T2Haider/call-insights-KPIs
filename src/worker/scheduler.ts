import type { Logger } from "@/lib/logger";

export interface Scheduler {
  /** Stops scheduling and resolves once any in-flight run has finished. */
  stop(): Promise<void>;
}

/**
 * Runs `task` forever, waiting `intervalMs` AFTER each run finishes (chained,
 * not setInterval), so runs never overlap even when one is slow. A failing
 * task is logged and retried on the next tick; the loop never dies.
 */
export function startScheduler(params: {
  task: () => Promise<void>;
  intervalMs: number;
  logger: Logger;
}): Scheduler {
  const { task, intervalMs, logger } = params;
  const abort = new AbortController();

  const loop = (async () => {
    while (!abort.signal.aborted) {
      try {
        await task();
      } catch (error) {
        logger.error("Scheduled task failed", { error });
      }
      await sleep(intervalMs, abort.signal);
    }
  })();

  return {
    async stop() {
      abort.abort();
      await loop;
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
