import { z } from "zod";
import { getDb } from "@/db/client";
import { jsonError } from "@/lib/http";
import { getSummary } from "@/services/summaryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  todayStart: z.iso.datetime({ offset: true }),
  weekStart: z.iso.datetime({ offset: true }),
});

export async function GET(request: Request): Promise<Response> {
  const query = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) {
    return jsonError(400, "todayStart and weekStart (ISO date-times) are required");
  }
  return Response.json(
    getSummary(getDb(), {
      todayStart: new Date(query.data.todayStart),
      weekStart: new Date(query.data.weekStart),
    }),
  );
}
