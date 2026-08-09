import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { ensureUser, listGuidance } from "@/lib/ingestion/store";

export async function GET() {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    const user = await ensureUser(creator);
    return Response.json({ guides: await listGuidance(user.id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
