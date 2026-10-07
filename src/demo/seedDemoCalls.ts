import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/db/client";
import type { EventPublisher } from "@/events/types";
import { ingestCall } from "@/ingestion/ingestCall";
import type { Logger } from "@/lib/logger";
import type { CallNormalizer } from "@/providers/types";
import { DEMO_CALLS } from "./calls";
import { buildDemoPayload, DEMO_RECORDINGS_PATH, demoRecordingFile } from "./payloads";
import { wavDurationSeconds } from "./wav";

const RECORDINGS_DIR = path.join(process.cwd(), "public", DEMO_RECORDINGS_PATH);

export interface SeedDeps {
  db: Db;
  normalizer: CallNormalizer;
  publisher: EventPublisher;
  processingTimeoutMs: number;
  logger: Logger;
  /** Base URL of this dashboard (APP_URL); recording links point at its static files. */
  appUrl: string;
  now?: Date;
}

async function recordingDuration(file: string, logger: Logger): Promise<number | null> {
  try {
    return wavDurationSeconds(await readFile(path.join(RECORDINGS_DIR, file)));
  } catch {
    logger.warn("Demo recording missing; run `npm run demo:recordings`", { file });
    return null;
  }
}

/**
 * Loads the demo calls through `ingestCall`, exactly like calls arriving by
 * webhook. Idempotent: calls are keyed by conversation id, so a re-run updates
 * them in place (their start times move forward to stay recent).
 * Returns how many calls were created / updated / unchanged.
 */
export async function seedDemoCalls(deps: SeedDeps): Promise<Record<string, number>> {
  const { db, normalizer, publisher, processingTimeoutMs, logger, appUrl } = deps;
  const now = deps.now ?? new Date();
  const counts: Record<string, number> = {};

  for (const call of DEMO_CALLS) {
    const payload = buildDemoPayload(call, {
      now,
      appUrl,
      durationSeconds: await recordingDuration(demoRecordingFile(call), logger),
    });
    const result = await ingestCall(
      { db, normalizer, publisher, processingTimeoutMs, logger, now: () => now },
      payload,
    );
    if (result.outcome === "invalid") throw new Error(`Demo call ${call.slug}: ${result.reason}`);
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
  }
  return counts;
}
