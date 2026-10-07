import { getDb } from "@/db/client";
import { getHub } from "@/events/hub";
import { HubEventPublisher } from "@/events/hubPublisher";
import { handleCallEndedWebhook } from "@/ingestion/webhookHandler";
import { getConfig } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { createWebhookNormalizer } from "@/providers/webhook/normalizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logger = createLogger("webhook");

/** Call-ended webhook: see docs/WEBHOOK_SPEC.md. All logic lives in `handleCallEndedWebhook`. */
export async function POST(request: Request): Promise<Response> {
  const config = getConfig();
  return handleCallEndedWebhook(request, {
    db: getDb(),
    secret: config.WEBHOOK_SECRET,
    maxBodyBytes: config.WEBHOOK_MAX_BODY_BYTES,
    normalizer: createWebhookNormalizer({
      defaultPhoneRegion: config.DEFAULT_PHONE_REGION,
      recordingBaseUrl: config.RECORDING_BASE_URL,
    }),
    publisher: new HubEventPublisher(getHub()),
    processingTimeoutMs: config.PROCESSING_TIMEOUT_MINUTES * 60_000,
    logger,
  });
}
