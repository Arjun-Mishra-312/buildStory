import Link from "next/link";

export type ChapterSummary = {
  reportId: string;
  chapterIndex: number;
  publishedAt: string | null;
  tagline: string;
  commits: number;
  activeDays: number;
  costMicroUsd: number | null;
};

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const usdFormat = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function delta(current: number, previous: number, unit = ""): string | null {
  const diff = current - previous;
  if (diff === 0) return null;
  return `${diff > 0 ? "+" : ""}${diff}${unit}`;
}

export function ChapterTimeline({
  chapters,
  handle,
  slug,
  currentChapterIndex,
}: {
  chapters: ChapterSummary[];
  handle: string;
  slug: string;
  currentChapterIndex: number;
}) {
  if (chapters.length < 2) return null;
  const latestChapterIndex = chapters[chapters.length - 1]!.chapterIndex;

  return (
    <nav className="chapter-timeline section-wrap" aria-label="Build chapters">
      <span className="section-index">( {chapters.length} CHAPTERS )</span>
      <ol>
        {chapters.map((chapter, index) => {
          const previous = index > 0 ? chapters[index - 1] : null;
          const commitDelta = previous ? delta(chapter.commits, previous.commits, " commits") : null;
          const dayDelta = previous ? delta(chapter.activeDays, previous.activeDays, "d") : null;
          const isCurrent = chapter.chapterIndex === currentChapterIndex;
          const href = chapter.chapterIndex === latestChapterIndex ? `/u/${handle}/${slug}` : `/u/${handle}/${slug}/${chapter.chapterIndex}`;
          return (
            <li key={chapter.reportId} className={isCurrent ? "is-current" : undefined}>
              <Link href={href} aria-current={isCurrent ? "page" : undefined}>
                <span className="chapter-timeline__index">Ch. {chapter.chapterIndex}</span>
                <span className="chapter-timeline__date">{chapter.publishedAt ? dateFormat.format(new Date(chapter.publishedAt)) : "Unpublished"}</span>
                <span className="chapter-timeline__tagline">{chapter.tagline}</span>
                {commitDelta || dayDelta ? (
                  <span className="chapter-timeline__delta">
                    {commitDelta ? <span>{commitDelta}</span> : null}
                    {dayDelta ? <span>{dayDelta} active</span> : null}
                  </span>
                ) : null}
                {chapter.costMicroUsd != null ? <span className="chapter-timeline__cost">{usdFormat.format(chapter.costMicroUsd / 1_000_000)}</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
