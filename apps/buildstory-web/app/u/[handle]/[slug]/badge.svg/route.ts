import { getPublishedStory } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ handle: string; slug: string }> };

const LABEL_BG = "#191a17";
const VALUE_BG = "#f36f56";
const TEXT_COLOR = "#faf7ef";
const CHAR_WIDTH = 6.6;
const PADDING = 10;
const HEIGHT = 20;

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      default: return "&apos;";
    }
  });
}

function badgeSvg(label: string, value: string): string {
  const labelWidth = Math.round(label.length * CHAR_WIDTH + PADDING * 2);
  const valueWidth = Math.round(value.length * CHAR_WIDTH + PADDING * 2);
  const totalWidth = labelWidth + valueWidth;
  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(value);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}" role="img" aria-label="${safeLabel}: ${safeValue}">
  <title>${safeLabel}: ${safeValue}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".05"/>
    <stop offset="1" stop-opacity=".05"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${HEIGHT}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_BG}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${VALUE_BG}"/>
    <rect width="${totalWidth}" height="${HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="${TEXT_COLOR}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${safeLabel}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${safeValue}</text>
  </g>
</svg>`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { handle, slug } = await context.params;
  const story = await getPublishedStory(handle, slug).catch(() => null);

  const svg = story
    ? badgeSvg("buildstory", `${story.git.commits} commits / ${story.activeDays}d`)
    : badgeSvg("buildstory", "not found");

  return new Response(svg, {
    status: story ? 200 : 404,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": story ? "public, max-age=3600, stale-while-revalidate=86400" : "no-store",
    },
  });
}
