import { getDb } from "@/db/client";
import { WEBHOOK_PROVIDER_NAME } from "@/providers/webhook/normalizer";
import { getIngestionStatus } from "@/services/ingestionStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(getIngestionStatus(getDb(), { provider: WEBHOOK_PROVIDER_NAME }));
}
