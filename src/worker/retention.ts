import { deleteCallsStartedBefore } from "@/db/callRepository";
import type { Db } from "@/db/client";
import type { Logger } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes calls older than `retentionDays` from THIS dashboard's database
 * (call details, transcript, stored recording link).
 *
 * It never contacts MinIO and never deletes recording files: the recording
 * link is just a column in our own table.
 *
 * `retentionDays <= 0` disables cleanup. Returns the number of calls removed.
 */
export function runRetentionCleanup(params: {
  db: Db;
  retentionDays: number;
  logger: Logger;
  now?: Date;
}): number {
  const { db, retentionDays, logger, now = new Date() } = params;
  if (retentionDays <= 0) {
    logger.debug("Retention cleanup disabled (RETENTION_DAYS=0)");
    return 0;
  }
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const removed = deleteCallsStartedBefore(db, cutoff);
  logger.info(`Retention cleanup removed ${removed} call(s)`, {
    retentionDays,
    olderThan: cutoff.toISOString(),
  });
  return removed;
}

/** Runs cleanup once now, then once a day. Failures are logged, never thrown. */
export function startRetentionJob(params: { db: Db; retentionDays: number; logger: Logger }): {
  stop(): void;
} {
  const run = () => {
    try {
      runRetentionCleanup(params);
    } catch (error) {
      params.logger.error("Retention cleanup failed", { error });
    }
  };
  run();
  if (params.retentionDays <= 0) return { stop() {} };
  const timer = setInterval(run, DAY_MS);
  return { stop: () => clearInterval(timer) };
}
