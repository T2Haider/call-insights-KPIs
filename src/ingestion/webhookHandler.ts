import { recordCallReceived, recordRequestRejected } from "@/db/ingestionStateRepository";
import type { Db } from "@/db/client";
import type { EventPublisher } from "@/events/types";
import { jsonError } from "@/lib/http";
import { secretsMatch } from "@/lib/internalAuth";
import type { Logger } from "@/lib/logger";
import { WebhookPayloadSchema } from "@/providers/webhook/payload";
import type { CallNormalizer } from "@/providers/types";
import { ingestCall } from "./ingestCall";

export interface WebhookDeps {
  db: Db;
  /** Expected bearer token. */
  secret: string;
  maxBodyBytes: number;
  normalizer: CallNormalizer;
  publisher: EventPublisher;
  processingTimeoutMs: number;
  logger: Logger;
  now?: () => Date;
}

const TOO_LARGE = Symbol("too-large");

/** Rejections are recorded for the header status, at most once per reason per interval. */
const REJECT_RECORD_INTERVAL_MS = 5000;
const lastRecordedRejection = new WeakMap<Db, Map<string, number>>();

/**
 * Reads the request body as text, giving up as soon as it exceeds `maxBytes`
 * (so an oversized upload is never fully buffered). Route handlers have no
 * built-in body limit, so this is enforced here.
 */
async function readBodyLimited(request: Request, maxBytes: number): Promise<string | symbol> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return TOO_LARGE;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function extractBearerToken(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1]?.trim() || null;
}

/**
 * POST /api/webhooks/call-ended
 *   401 missing/wrong bearer token   413 body too large   400 invalid JSON/payload
 *   200 accepted (created / updated / unchanged duplicate)   500 our fault: sender should retry
 * The secret is checked BEFORE the body is read.
 */
export async function handleCallEndedWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Response> {
  const { db, normalizer, logger } = deps;
  const now = deps.now?.() ?? new Date();

  const reject = (status: number, message: string, kind: string): Response => {
    logger.warn("Webhook request rejected", { status, reason: message });
    const recorded = lastRecordedRejection.get(db) ?? new Map<string, number>();
    lastRecordedRejection.set(db, recorded);
    if (now.getTime() - (recorded.get(kind) ?? 0) >= REJECT_RECORD_INTERVAL_MS) {
      recorded.set(kind, now.getTime());
      try {
        recordRequestRejected(db, normalizer.name, `${status} ${message}`, now);
      } catch (error) {
        logger.error("Could not record rejected webhook", { error });
      }
    }
    const response = jsonError(status, message);
    if (status === 401) response.headers.set("www-authenticate", "Bearer");
    return response;
  };

  try {
    if (!secretsMatch(extractBearerToken(request), deps.secret)) {
      return reject(401, "Missing or invalid bearer token", "401");
    }

    const body = await readBodyLimited(request, deps.maxBodyBytes);
    if (body === TOO_LARGE) {
      return reject(413, `Body exceeds ${deps.maxBodyBytes} bytes`, "413");
    }

    let json: unknown;
    try {
      json = JSON.parse(body as string);
    } catch {
      return reject(400, "Body must be valid JSON", "400-json");
    }

    const payload = WebhookPayloadSchema.safeParse(json);
    if (!payload.success) {
      const issues = payload.error.issues
        .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
        .join("; ");
      return reject(400, `Invalid payload: ${issues}`, "400-payload");
    }

    const result = await ingestCall(
      {
        db,
        normalizer,
        publisher: deps.publisher,
        processingTimeoutMs: deps.processingTimeoutMs,
        logger,
        now: deps.now,
      },
      json,
    );
    if (result.outcome === "invalid") {
      return reject(400, `Invalid payload: ${result.reason}`, "400-normalize");
    }

    recordCallReceived(db, normalizer.name, now);
    if (result.outcome !== "unchanged") {
      logger.info(`Call ${result.outcome}`, { conversationId: result.conversationId });
    }
    return Response.json({
      status: result.outcome,
      id: result.callId,
      conversationId: result.conversationId,
    });
  } catch (error) {
    logger.error("Webhook failed", { error });
    return jsonError(500, "Internal server error");
  }
}
