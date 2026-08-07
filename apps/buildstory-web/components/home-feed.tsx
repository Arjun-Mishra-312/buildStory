import Link from "next/link";
import { EditorialIllustration } from "@/components/editorial-illustration";
import type { FeedEntry } from "@/lib/social/contracts";

export function HomeFeed({ entries, unavailable }: { entries: FeedEntry[]; unavailable: boolean }) {
  return (
    <section className="creator-page home-feed section-wrap">
      <header className="creator-page__heading">
        <div>
          <span className="section-index">( YOUR FEED )</span>
          <h1>Build stories from people you follow.</h1>
          <p>The latest published work from your corner of the Buildstory community.</p>
        </div>
        <Link className="button button--primary" href="/explore">
          Explore stories <span aria-hidden="true">→</span>
        </Link>
      </header>
      {unavailable ? (
        <div className="leaderboard-empty leaderboard-empty--error" role="alert">
          <strong>Your feed is temporarily unavailable.</strong>
          <p>Try again in a moment.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="feed-empty" role="status">
          <div className="feed-empty__art" aria-hidden="true">
            <EditorialIllustration kind="feed-quiet" />
          </div>
          <div className="feed-empty__copy">
            <span className="section-index">( YOUR NEXT THREAD )</span>
            <strong>Your feed is quiet.</strong>
            <p>Follow builders from their public profile pages to see their stories here.</p>
            <Link className="button button--secondary" href="/explore">Find builders to follow <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      ) : (
        <div className="feed-list">
          {entries.map((entry) => (
            <article key={entry.reportId} className="feed-list__item">
              <div>
                <strong>{entry.author.displayName}</strong>
                <small>@{entry.author.handle}</small>
              </div>
              <Link href={`/u/${entry.author.handle}/${entry.slug}/${entry.chapterIndex}`}>{entry.tagline}</Link>
              <div className="feed-list__meta">
                <span>{entry.reactionTotal} reactions</span>
                <span>{entry.commentCount} comments</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
