import Link from "next/link";
import type { ChapterDelta } from "@/lib/story/chapter-delta";
import { GuideTooltip } from "./guidance/studio-guide";

export type ChapterSummary = {
  reportId: string;
  chapterIndex: number;
  publishedAt: string | null;
  tagline: string;
  commits: number;
  activeDays: number;
  costMicroUsd: number | null;
  /** The stored, gated ChapterDelta's own change - null for chapter 1. See lib/story/chapter-delta.ts. */
  commitsDelta: number | null;
  activeDaysDelta: number | null;
  /** The full, already-gated delta against the previous chapter - null for chapter 1. Powers the project changelog. */
  chapterDelta: ChapterDelta | null;
};

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

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
      <span className="section-index">( {chapters.length} CHAPTERS ) <GuideTooltip label="chapters">Each chapter is a published version of the project after a reviewed scan.</GuideTooltip></span>
      <ol>
        {chapters.map((chapter) => {
          const isCurrent = chapter.chapterIndex === currentChapterIndex;
          const href = chapter.chapterIndex === latestChapterIndex ? `/u/${handle}/${slug}` : `/u/${handle}/${slug}/${chapter.chapterIndex}`;
          return (
            <li key={chapter.reportId} className={isCurrent ? "is-current" : undefined}>
              <Link href={href} aria-current={isCurrent ? "page" : undefined}>
                <span className="chapter-timeline__index">Ch. {chapter.chapterIndex}</span>
                <span className="chapter-timeline__date">{chapter.publishedAt ? dateFormat.format(new Date(chapter.publishedAt)) : "Unpublished"}</span>
                <span className="chapter-timeline__tagline">{chapter.tagline}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
