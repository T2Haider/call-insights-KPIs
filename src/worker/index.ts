/**
 * Background worker: `npm run worker` (started automatically by `npm run dev`).
 * Calls arrive by webhook, so there is nothing to poll. This process only:
 *   - deletes calls past RETENTION_DAYS (at startup, then daily), and
 *   - marks calls stuck in "processing" as failed after the timeout.
 * It needs an always-on host; see the README.
 */
import { getDb } from "@/db/client";
import { HttpEventPublisher } from "@/events/httpPublisher";
import { getConfig } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { runProcessingTimeoutCheck } from "./maintenance";
import { startRetentionJob } from "./retention";
import { startScheduler } from "./scheduler";

const log = createLogger("worker");

async function main(): Promise<void> {
  const config = getConfig();
  const db = getDb();
  const publisher = new HttpEventPublisher(config.APP_URL, config.INTERNAL_EVENTS_SECRET);

  log.info("Worker starting", {
    retentionDays: config.RETENTION_DAYS,
    processingTimeoutMinutes: config.PROCESSING_TIMEOUT_MINUTES,
    intervalSeconds: config.WORKER_INTERVAL_SECONDS,
  });

  const retention = startRetentionJob({ db, retentionDays: config.RETENTION_DAYS, logger: log });
  if (shouldSeedDemoData(config)) await seedIfEmpty(db, config);
  const scheduler = startScheduler({
    task: async () => {
      await runProcessingTimeoutCheck({
        db,
        publisher,
        processingTimeoutMs: config.PROCESSING_TIMEOUT_MINUTES * 60_000,
        logger: log,
      });
    },
    intervalMs: config.WORKER_INTERVAL_SECONDS * 1000,
    logger: log,
  });

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down`);
    retention.stop();
    await scheduler.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// Last-resort guards: log and keep running instead of crashing the process.
process.on("unhandledRejection", (reason) => log.error("Unhandled rejection", { reason }));
process.on("uncaughtException", (error) => log.error("Uncaught exception", { error }));

main().catch((error) => {
  log.error("Worker failed to start", { error });
  process.exit(1);
});
