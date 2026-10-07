import { getDb } from "@/db/client";
import { jsonError } from "@/lib/http";
import { getCallDetail } from "@/services/callQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const call = getCallDetail(getDb(), id);
  return call ? Response.json(call) : jsonError(404, "Call not found");
}
