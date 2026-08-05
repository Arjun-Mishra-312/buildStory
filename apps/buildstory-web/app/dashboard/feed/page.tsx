import type { Metadata } from "next";
import Link from "next/link";
import { requireCreator } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";
import { getActivityFeed } from "@/lib/social/store";

export const metadata: Metadata = { title: "Feed" };
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const creator = await requireCreator("/dashboard/feed");
  const user = await ensureUser(creator);
  const feed = await getActivityFeed(user.id);

  return (
    <main className="creator-page">
      <span className="section-index">( FEED )</span>
      <h1>Build stories from people you follow.</h1>
      {feed.length === 0 ? (
        <p>
          Nothing here yet. Follow other builders from their public story pages to see their published
          build stories here.
        </p>
      ) : (
        <div className="feed-list">
          {feed.map((entry) => (
            <article key={entry.reportId} className="feed-list__item">
              <div>
                <strong>{entry.author.displayName}</strong>
                <small>@{entry.author.handle}</small>
              </div>
              <Link href={`/p/${entry.slug}`}>{entry.tagline}</Link>
              <div className="feed-list__meta">
                <span>{entry.reactionTotal} reactions</span>
                <span>{entry.commentCount} comments</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
