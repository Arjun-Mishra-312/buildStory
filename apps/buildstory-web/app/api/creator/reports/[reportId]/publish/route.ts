import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { ensureUser, getReport, publishReport, unpublishReport } from "@/lib/ingestion/store";
import { listUserAwards, summarizeAwards } from "@/lib/badges/store";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { PUBLIC_FIELD_KEYS, type PublicFieldKey } from "@/lib/ingestion/contracts";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const { reportId } = await context.params;
    const { value } = await readBoundedJson(request, 8 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonError("publication_review_required", "Review the public data summary before publishing.", 422);
    }
    const body = value as Record<string, unknown>;
    if (body.confirmation !== "publish-reviewed-v1"
      || !Array.isArray(body.selectedPublicFields)
      || body.selectedPublicFields.some((field) => typeof field !== "string" || !PUBLIC_FIELD_KEYS.includes(field as PublicFieldKey))) {
      return jsonError("publication_review_required", "Review the public data summary before publishing.", 422);
    }
    const reportBeforePublish = await getReport(creator.creatorId, reportId);
    const reviewed = [...new Set(body.selectedPublicFields as PublicFieldKey[])].sort();
    const saved = [...new Set(reportBeforePublish.selectedPublicFields)].sort();
    if (reviewed.length !== saved.length || reviewed.some((field, index) => field !== saved[index])) {
      return jsonError("publication_review_stale", "The saved public-field selection changed. Review it again before publishing.", 409);
    }
    const user = await ensureUser(creator);
    const before = new Set((await listUserAwards(user.id)).map((award) => award.badgeId));
    const report = await publishReport(creator.creatorId, reportId);
    const earnedBadges = summarizeAwards((await listUserAwards(user.id)).filter((award) => !before.has(award.badgeId)));
    return Response.json(
      { publication: report.publication, earnedBadges },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const { reportId } = await context.params;
    const report = await unpublishReport(creator.creatorId, reportId);
    return Response.json({ publication: report.publication }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
