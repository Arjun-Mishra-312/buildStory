import { jsonError, socialErrorResponse } from "@/lib/api/responses";
import { searchPublishedStories } from "@/lib/ingestion/store";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (!query.trim()) {
      return jsonError("query_required", "Pass a non-empty ?q= search term.", 422);
    }
    const results = await searchPublishedStories(query);
    return Response.json(
      { query, results },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
