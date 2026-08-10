import Link from "next/link";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { FeedTile } from "@/components/feed-tile";
import type { FeedEntry } from "@/lib/social/contracts";

export function HomeFeed({ entries, unavailable }: { entries: FeedEntry[]; unavailable: boolean }) {
  return (
    <section className="creator-page home-feed section-wrap">
      <header className="creator-page__heading">
        <div>
          <span className="section-index">( YOUR FEED )</span>
          <h1>Build stories from your community, and beyond.</h1>
          <p>The latest work from people you follow, plus well-received stories from across Buildstory.</p>
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
            <p>Nobody&apos;s published a story yet. Follow builders from their public profile pages, or check back once the community starts shipping.</p>
            <Link className="button button--secondary" href="/explore">Find builders to follow <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      ) : (
        <div className="feed-grid">
          {entries.map((entry) => (
            <FeedTile key={entry.reportId} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
