import { upsertCall } from "@/db/callRepository";
import type { Db } from "@/db/client";
import { NormalizedCallInputSchema } from "@/domain/call";
import { buildCallWrite } from "@/domain/mergeCall";
import type { EventPublisher } from "@/events/types";
import { ConfigurationError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import type { CallNormalizer } from "@/providers/types";
import { ZodError } from "zod";

/**
 * Save + broadcast for ONE call, independent of how it arrived. The webhook
 * handler calls this today; any other ingestion path (a second webhook format,
 * a backfill script) can call it with its own normalizer and get identical
 * validation, idempotency, merge rules and live updates.
 */
export interface IngestDeps {
  db: Db;
  normalizer: CallNormalizer;
  publisher: EventPublisher;
  processingTimeoutMs: number;
  logger: Logger;
  now?: () => Date;
}

export type IngestResult =
  | { outcome: "created" | "updated" | "unchanged"; callId: string; conversationId: string }
  | { outcome: "invalid"; reason: string };

function describeError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Normalizes, validates, saves (idempotent by conversationId) and broadcasts.
 * Bad data returns `{ outcome: "invalid" }`; our own misconfiguration
 * (`ConfigurationError`) and database failures throw, so callers answer 5xx.
 */
export async function ingestCall(deps: IngestDeps, raw: unknown): Promise<IngestResult> {
  const { db, normalizer, publisher, processingTimeoutMs, logger } = deps;
  const now = deps.now?.() ?? new Date();

  let validated;
  try {
    const parsed = NormalizedCallInputSchema.safeParse(normalizer.normalize(raw));
    if (!parsed.success) return { outcome: "invalid", reason: describeError(parsed.error) };
    validated = parsed.data;
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    return { outcome: "invalid", reason: describeError(error) };
  }

  const { call, change } = upsertCall(
    db,
    validated.conversationId,
    (existing) =>
      buildCallWrite({
        existing,
        input: validated,
        provider: normalizer.name,
        now,
        processingTimeoutMs,
      }),
    now,
  );

  if (change === "unchanged") {
    logger.debug("Duplicate call ignored", { conversationId: call.conversationId });
  } else {
    await publisher.publish([
      {
        type: change === "created" ? "call.created" : "call.updated",
        callId: call.id,
        conversationId: call.conversationId,
      },
    ]);
  }
  return { outcome: change, callId: call.id, conversationId: call.conversationId };
}
