import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { exportAccountData } from "@/lib/account/store";
import { ensureUser } from "@/lib/ingestion/store";

export async function GET() {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    const user = await ensureUser(creator);
    const data = await exportAccountData(user.id);
    return Response.json(data, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": "attachment; filename=\"buildstory-account-export.json\"",
      },
    });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
