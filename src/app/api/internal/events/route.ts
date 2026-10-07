import { z } from "zod";
import { INTERNAL_SECRET_HEADER } from "@/events/httpPublisher";
import { getHub } from "@/events/hub";
import { getConfig } from "@/lib/config";
import { jsonError } from "@/lib/http";
import { secretsMatch } from "@/lib/internalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(["call.created", "call.updated"]),
        callId: z.string().min(1),
        conversationId: z.string().min(1),
      }),
    )
    .max(1000),
});

/**
 * Receives change notifications from the worker process and fans them out to
 * connected browsers. Not for browsers: protected by a shared secret.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get(INTERNAL_SECRET_HEADER);
  if (!secretsMatch(secret, getConfig().INTERNAL_EVENTS_SECRET)) {
    return jsonError(401, "Unauthorized");
  }

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Invalid body");

  const hub = getHub();
  for (const event of body.data.events) hub.broadcast(event);
  return Response.json({ received: body.data.events.length, listeners: hub.size });
}
