/**
 * `npm run seed`: loads the 20 demo calls into the dashboard's database, on
 * demand. (In development the worker already does this when the database is
 * empty; see SEED_DEMO_DATA.) If the web server is running, open dashboards
 * update live.
 */
import { getDb } from "@/db/client";
import { HttpEventPublisher } from "@/events/httpPublisher";
import { noopPublisher, type EventPublisher } from "@/events/types";
import { getConfig } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { createWebhookNormalizer } from "@/providers/webhook/normalizer";
import { DEMO_CALLS } from "./calls";
import { seedDemoCalls } from "./seedDemoCalls";

const log = createLogger("seed");

/** Broadcast only when the web server is up, so the seed also works on its own. */
async function choosePublisher(appUrl: string, secret: string): Promise<EventPublisher> {
  try {
    const response = await fetch(new URL("/api/status", appUrl), {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) return new HttpEventPublisher(appUrl, secret);
  } catch {
    // Not running: the dashboard shows the calls when it is opened.
  }
  log.info("Web server not reachable; seeding without live updates", { appUrl });
  return noopPublisher;
}

async function main(): Promise<void> {
  const config = getConfig();
  const db = getDb();
  const counts = await seedDemoCalls({
    db,
    normalizer: createWebhookNormalizer({
      defaultPhoneRegion: config.DEFAULT_PHONE_REGION,
      recordingBaseUrl: config.RECORDING_BASE_URL,
    }),
    publisher: await choosePublisher(config.APP_URL, config.INTERNAL_EVENTS_SECRET),
    processingTimeoutMs: config.PROCESSING_TIMEOUT_MINUTES * 60_000,
    logger: log,
    appUrl: config.APP_URL,
  });
  log.info(`Seeded ${DEMO_CALLS.length} demo calls`, counts);
  db.$client.close();
}

main().catch((error) => {
  log.error("Seeding failed", { error });
  process.exit(1);
});
