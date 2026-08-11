import { socialErrorResponse } from "@/lib/api/responses";
import { getPublishedStory, getPublishedStoryChapter } from "@/lib/ingestion/store";
import { formatShareCardData } from "@/lib/share-card/format";
import { renderShareCard } from "@/lib/share-card/render";
import { buildProjectStoryFrameCard, buildStoryShareCard } from "@/lib/share-card/story-card";
import { manifestForPublishedStory, type PublishedStoryWithManifest } from "@/lib/story/project-story";
import { isBackgroundTheme, isShareBackgroundId, shareRenderBackgroundAsset } from "@/lib/background-options";
import { loadShareBackgroundDataUri } from "@/lib/share-card/background";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

type RouteContext = { params: Promise<{ handle: string; slug: string }> };

/** The public story is already unauthenticated read access - same trust boundary as the OG routes. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { handle, slug } = await context.params;

    await checkRateLimit("share_card_download", `${handle}/${slug}`, 30, 60, request);

    const params = new URL(request.url).searchParams;
    const requestedChapter = params.get("chapter");
    const chapterIndex = requestedChapter && /^[1-9]\d*$/.test(requestedChapter) ? Number(requestedChapter) : null;
    const story = chapterIndex
      ? await getPublishedStoryChapter(handle, slug, chapterIndex).catch(() => null)
      : await getPublishedStory(handle, slug).catch(() => null);
    if (!story) {
      return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    }

    const canonicalUrl = `${new URL(request.url).origin}/u/${handle}/${slug}${chapterIndex ? `/${chapterIndex}` : ""}`;
    const requestedBackground = params.get("background");
    const backgroundId = isShareBackgroundId(requestedBackground)
      ? requestedBackground
      : isShareBackgroundId(story.storyBackgroundId) ? story.storyBackgroundId : "repository-topography";
    const requestedTheme = params.get("theme");
    const theme = isBackgroundTheme(requestedTheme) ? requestedTheme : "dark";
    const backgroundDataUri = await loadShareBackgroundDataUri(request, shareRenderBackgroundAsset(backgroundId, theme));
    const frameId = params.get("frame");
    const manifest = manifestForPublishedStory(story as PublishedStoryWithManifest, `/u/${handle}/${slug}${chapterIndex ? `/${chapterIndex}` : ""}`);
    const frame = frameId ? manifest.frames.find((candidate) => candidate.id === frameId) : null;
    const image = frame
      ? buildProjectStoryFrameCard(frame, story.name, story.owner.handle, canonicalUrl, { backgroundDataUri, theme })
      : buildStoryShareCard(formatShareCardData(story), canonicalUrl, { backgroundDataUri, theme });
    const filename = frame
      ? `buildstory-${handle}-${slug}-${frame.id}-${backgroundId}-${theme}.png`
      : `buildstory-${handle}-${slug}-${backgroundId}-${theme}.png`;

    return await renderShareCard(image, {
      width: 1080,
      height: 1350,
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-buildstory-background": backgroundDataUri ? "loaded" : "missing",
      },
    });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
