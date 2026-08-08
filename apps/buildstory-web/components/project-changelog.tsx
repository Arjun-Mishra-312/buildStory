import { ChapterDeltaSummary } from "./chapter-delta-summary";
import type { ChapterSummary } from "./chapter-timeline";

const dateFormat = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Every published chapter's own delta, newest first - the project-as-living-thing surface, distinct from the single "UPDATED" band for the current chapter. */
export function ProjectChangelog({ chapters }: { chapters: ChapterSummary[] }) {
  if (chapters.length < 2) return null;
  const newestFirst = [...chapters].sort((left, right) => right.chapterIndex - left.chapterIndex);
  return (
    <section className="project-changelog section-wrap" aria-label="Project changelog">
      <span className="section-index">( PROJECT CHANGELOG )</span>
      <h2>How this project got here.</h2>
      <ol className="project-changelog__list">
        {newestFirst.map((chapter) => (
          <li key={chapter.reportId}>
            <header>
              <strong>Chapter {chapter.chapterIndex}</strong>
              <span>{chapter.publishedAt ? dateFormat.format(new Date(chapter.publishedAt)) : "Unpublished"}</span>
            </header>
            <p>{chapter.tagline}</p>
            {chapter.chapterDelta ? (
              <ChapterDeltaSummary delta={chapter.chapterDelta} compact />
            ) : (
              <p className="project-changelog__origin">Where the project started.</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
