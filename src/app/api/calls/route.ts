import { z } from "zod";
import { getDb } from "@/db/client";
import { jsonError } from "@/lib/http";
import { MAX_SEARCH_LENGTH } from "@/domain/callFilters";
import { InvalidCursorError, listCalls, MAX_PAGE_SIZE } from "@/services/callQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
  search: z.string().max(MAX_SEARCH_LENGTH).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = QuerySchema.safeParse(params);
  if (!query.success) return jsonError(400, "Invalid query parameters");

  try {
    return Response.json(
      listCalls(getDb(), {
        limit: query.data.limit,
        cursor: query.data.cursor,
        filters: { search: query.data.search, from: query.data.from, to: query.data.to },
      }),
    );
  } catch (error) {
    if (error instanceof InvalidCursorError) return jsonError(400, error.message);
    throw error;
  }
}
