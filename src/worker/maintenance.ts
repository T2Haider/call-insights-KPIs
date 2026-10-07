import { listProcessingCalls, markCallFailed } from "@/db/callRepository";
import type { Db } from "@/db/client";
import type { CallEvent, EventPublisher } from "@/events/types";
import type { Logger } from "@/lib/logger";

const MAX_CALLS_PER_RUN = 500;

/**
 * Marks calls that are still waiting for a recording or transcript as "failed"
 * once we have been waiting longer than the timeout (counted from when we first received the call). Calls normally arrive complete, so this
 * is a safety net: it stops a half-delivered call from showing "Processing"
 * forever. Changes are broadcast so open dashboards update. Returns how many
 * calls were marked.
 */
export async function runProcessingTimeoutCheck(params: {
  db: Db;
  publisher: EventPublisher;
  processingTimeoutMs: number;
  logger: Logger;
  now?: Date;
}): Promise<number> {
  const { db, publisher, processingTimeoutMs, logger, now = new Date() } = params;

  const events: CallEvent[] = [];
  for (const call of listProcessingCalls(db, MAX_CALLS_PER_RUN)) {
    if (now.getTime() - call.createdAt.getTime() <= processingTimeoutMs) continue;
    const failed = markCallFailed(db, call.id, now);
    if (failed) {
      events.push({
        type: "call.updated",
        callId: failed.id,
        conversationId: failed.conversationId,
      });
    }
  }

  if (events.length > 0) {
    logger.info(`Marked ${events.length} stuck call(s) as failed`);
    await publisher.publish(events);
  }
  return events.length;
}
