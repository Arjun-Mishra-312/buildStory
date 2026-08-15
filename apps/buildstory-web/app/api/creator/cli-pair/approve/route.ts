import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { cliApiBaseUrl, readBoundedJson } from "@/lib/ingestion/local-api";
import { approveCliPairing, ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function POST(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);
    await checkRateLimit("cli_pair_approve", creator.creatorId, 20, 60, request);
    const { value } = await readBoundedJson(request, 16 * 1024);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => key !== "userCode") ||
      typeof (value as { userCode?: unknown }).userCode !== "string"
    ) {
      return jsonError("invalid_request", "Only userCode may be provided.", 422);
    }
    const user = await ensureUser(creator);
    const pairing = await approveCliPairing(
      creator.creatorId,
      user.id,
      (value as { userCode: string }).userCode,
      cliApiBaseUrl(request),
    );
    return Response.json({ pairing });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
