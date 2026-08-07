import { getPublishedStory } from "@/lib/ingestion/store";
import { formatShareCardData } from "@/lib/share-card/format";
import { SHARE_CARD_PALETTE } from "@/lib/share-card/palette";
import { renderShareCard } from "@/lib/share-card/render";
import { buildStoryOgCard } from "@/lib/share-card/story-card";

type RouteContext = { params: Promise<{ handle: string; slug: string }> };

function fallbackCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        backgroundColor: SHARE_CARD_PALETTE.surface,
        color: SHARE_CARD_PALETTE.ink,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>Buildstory</div>
      <div style={{ display: "flex", fontSize: 26, color: SHARE_CARD_PALETTE.muted, marginTop: 12 }}>Every build has a story.</div>
    </div>
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const { handle, slug } = await context.params;
  const story = await getPublishedStory(handle, slug).catch(() => null);

  if (!story) {
    return renderShareCard(fallbackCard(), {
      width: 1200,
      height: 630,
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const image = buildStoryOgCard(formatShareCardData(story));

  return renderShareCard(image, {
    width: 1200,
    height: 630,
    headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
