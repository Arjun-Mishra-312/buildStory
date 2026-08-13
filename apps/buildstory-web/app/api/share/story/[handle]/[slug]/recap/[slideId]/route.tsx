import { socialErrorResponse } from "@/lib/api/responses";
import { getPublishedStory } from "@/lib/ingestion/store";
import { buildRecapScript, findRecapSlide } from "@/lib/report/recap";
import { buildRecapShareCard } from "@/lib/share-card/recap-card";
import { renderShareCard } from "@/lib/share-card/render";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

type RouteContext = { params: Promise<{ handle: string; slug: string; slideId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { handle, slug, slideId } = await context.params;
    await checkRateLimit("share_card_download", `${handle}/${slug}/recap`, 30, 60, request);
    const story = await getPublishedStory(handle, slug).catch(() => null);
    if (!story || !story.recapEnabled) {
      return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    }
    const pack = story.storyPack;
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
      models: story.models,
      peakHours: story.profile?.workPatterns?.peakHours,
    });
    const slide = findRecapSlide(script, slideId);
    if (!slide) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    const filename = `buildstory-${handle}-${slug}-${slide.id}.png`;
    return await renderShareCard(buildRecapShareCard(slide, story.name, handle), {
      width: 1080,
      height: 1350,
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
