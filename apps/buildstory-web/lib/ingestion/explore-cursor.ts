export type ExploreCursor = {
  version: 1;
  sort: "newest" | "trending";
  publishedAt: string;
  reportId: string;
  trendScore: number;
};

export function encodeExploreCursor(cursor: ExploreCursor) {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodeExploreCursor(value: string | undefined): ExploreCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ExploreCursor>;
    if (
      parsed.version !== 1 ||
      (parsed.sort !== "newest" && parsed.sort !== "trending") ||
      typeof parsed.publishedAt !== "string" ||
      typeof parsed.reportId !== "string" ||
      typeof parsed.trendScore !== "number"
    ) return null;
    return parsed as ExploreCursor;
  } catch {
    return null;
  }
}

export function compareExploreRows(
  left: { publishedAt: string | null; reportId: string; trendScore: number },
  right: { publishedAt: string | null; reportId: string; trendScore: number },
  sort: "newest" | "trending",
) {
  if (sort === "trending" && left.trendScore !== right.trendScore) return right.trendScore - left.trendScore;
  const publicationOrder = (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
  return publicationOrder || left.reportId.localeCompare(right.reportId);
}

export function isAfterExploreCursor(
  row: { publishedAt: string | null; reportId: string; trendScore: number },
  cursor: ExploreCursor | null,
  sort: "newest" | "trending",
) {
  if (!cursor || cursor.sort !== sort) return true;
  return compareExploreRows(row, cursor, sort) > 0;
}
