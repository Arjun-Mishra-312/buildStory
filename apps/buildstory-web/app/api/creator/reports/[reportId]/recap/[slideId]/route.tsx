import { jsonError, requireApiCreator, ingestionErrorResponse } from "@/lib/api/responses";
import { getReport } from "@/lib/ingestion/store";
import { buildStoryFromSnapshot, normalizeReportStoryPack } from "@/lib/build-story";
import { buildRecapScript, findRecapSlide, recapShowsArt } from "@/lib/report/recap";
import { illustrationForSignal } from "@/lib/report/poster-art";
import { buildRecapShareCard, buildSignalShareCard } from "@/lib/share-card/recap-card";
import { buildReceiptShareCard } from "@/lib/share-card/receipt-card";
import { loadShareAssetDataUri } from "@/lib/share-card/background";
import { renderShareCard } from "@/lib/share-card/render";

type RouteContext = { params: Promise<{ reportId: string; slideId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    const { reportId, slideId } = await context.params;
    const report = await getReport(creator.creatorId, reportId);
    const story = buildStoryFromSnapshot(report.snapshot);
    const pack = normalizeReportStoryPack(report.narrative?.storyPack ?? report.snapshot.narrative?.storyPack ?? null);
    if (slideId === "receipt") {
      return await renderShareCard(buildReceiptShareCard(story), {
        width: 1080,
        height: 1350,
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": 'attachment; filename="buildstory-receipt.png"',
        },
      });
    }
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
    if (slideId.startsWith("poster-")) {
      const signalId = slideId.slice("poster-".length);
      const signal = story.signals.find((item) => item.id === signalId);
      if (!signal) return jsonError("not_found", "That fact card is not available.", 404);
      const visualDataUri = await loadShareAssetDataUri(request, illustrationForSignal(signal));
      return await renderShareCard(buildSignalShareCard(signal, story.owner.handle, visualDataUri), {
        width: 1080,
        height: 1350,
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename="buildstory-fact-${signal.id}.png"`,
        },
      });
    }

    const slide = findRecapSlide(script, slideId);
    if (!slide) return jsonError("not_found", "That recap card is not available.", 404);
    const filename = `buildstory-recap-${slide.id}.png`;
    const visualDataUri = recapShowsArt(slide) ? await loadShareAssetDataUri(request, slide.visual) : null;
    const image = buildRecapShareCard(slide, story.name, story.owner.handle, { audience: "creator", visualDataUri });
    return await renderShareCard(image, {
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
