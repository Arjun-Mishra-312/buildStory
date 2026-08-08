import { formatChapterDeltaHighlights, publicChapterDelta, type ChapterDelta } from "@/lib/story/chapter-delta";
import type { PublicFieldKey } from "@/lib/ingestion/contracts";

const windowNote: Record<ChapterDelta["windowRelation"], string | null> = {
  cumulative: null,
  incremental: "This chapter covers only the work done since the last scan, not a delta against project totals.",
  overlapping: "This scan's window overlaps the previous chapter's, so these are this chapter's own totals, not a clean delta.",
};

export function ChapterDeltaSummary({
  delta,
  compact = false,
  selectedFields,
}: {
  delta: ChapterDelta;
  compact?: boolean;
  /**
   * When provided, renders every highlight from the full delta - including ones the
   * current field selection would hide - marking the hidden ones "not published".
   * This is the creator's own pre-publish preview, so it deliberately shows more than
   * a reader ever would; omit this prop anywhere the delta is already gated (the
   * public band, the project changelog, the project detail page).
   */
  selectedFields?: PublicFieldKey[];
}) {
  const highlights = formatChapterDeltaHighlights(delta);
  const publishedHighlights = selectedFields ? new Set(formatChapterDeltaHighlights(publicChapterDelta(delta, selectedFields))) : null;
  const note = windowNote[delta.windowRelation];
  if (!highlights.length && !delta.narrativeReplaced) return null;
  return (
    <div className={`chapter-delta ${compact ? "chapter-delta--compact" : ""}`}>
      <header>
        <span>WHAT CHANGED · CHAPTER {delta.fromChapterIndex} → {delta.toChapterIndex}</span>
      </header>
      {highlights.length ? (
        <ul className="chapter-delta__list">
          {highlights.map((line) => {
            const isHidden = publishedHighlights !== null && !publishedHighlights.has(line);
            return (
              <li key={line} className={isHidden ? "is-not-published" : undefined}>
                {line}
                {isHidden ? <small> · not published</small> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="chapter-delta__empty">No published numbers changed since the last chapter.</p>
      )}
      {delta.narrativeReplaced ? <p className="chapter-delta__note">Story text was regenerated for this chapter, not diffed line by line.</p> : null}
      {note ? <p className="chapter-delta__note">{note}</p> : null}
    </div>
  );
}
