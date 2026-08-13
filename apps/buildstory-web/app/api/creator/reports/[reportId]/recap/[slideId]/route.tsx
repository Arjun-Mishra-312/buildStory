import { jsonError, requireApiCreator, ingestionErrorResponse } from "@/lib/api/responses";
import { getReport } from "@/lib/ingestion/store";
import { buildStoryFromSnapshot, normalizeReportStoryPack } from "@/lib/build-story";
import { buildRecapScript, findRecapSlide } from "@/lib/report/recap";
import { buildRecapShareCard } from "@/lib/share-card/recap-card";
import { renderShareCard } from "@/lib/share-card/render";

type RouteContext = { params: Promise<{ reportId: string; slideId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    const { reportId, slideId } = await context.params;
    const report = await getReport(creator.creatorId, reportId);
    const story = buildStoryFromSnapshot(report.snapshot);
    const pack = normalizeReportStoryPack(report.narrative?.storyPack ?? report.snapshot.narrative?.storyPack ?? null);
    const script = buildRecapScript({
      projectName: story.name,
      sessionCount: story.sessionCount,
      activeDays: story.activeDays,
      commits: story.git.commits,
      buildHours: story.buildHours,
      filesTouched: story.git.filesTouched,
      costMicroUsd: story.cost?.totalMicroUsd ?? null,
      status: story.status,
      archetypeName: story.profile?.archetype?.name ?? null,
      pack,
      signals: story.signals,
      sessions: story.sessions,
      models: story.models,
      peakHours: story.profile?.workPatterns?.peakHours,
      utcOffsetMinutes: story.utcOffsetMinutes,
    });
    const slide = findRecapSlide(script, slideId);
    if (!slide) return jsonError("not_found", "That recap card is not available.", 404);
    const filename = `buildstory-recap-${slide.id}.png`;
    return await renderShareCard(buildRecapShareCard(slide, story.name, story.owner.handle), {
      width: 1080,
      height: 1350,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
