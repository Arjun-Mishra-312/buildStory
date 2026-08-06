import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { exportAccountData } from "@/lib/account/store";
import { ensureUser } from "@/lib/ingestion/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function GET(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    const user = await ensureUser(creator);
    await checkRateLimit("account_export", user.id, 3, 3_600, request);
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
