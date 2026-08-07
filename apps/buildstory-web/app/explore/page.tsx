import type { Metadata } from "next";
import { ExploreFeed } from "@/components/explore-feed";
import { explorePublishedStories } from "@/lib/ingestion/store";

export const metadata: Metadata = {
  title: "Explore build stories",
  description:
    "Discover the process, turning points, and AI build receipts behind software made by independent builders.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

async function loadStories() {
  try {
    const result = await explorePublishedStories({ limit: PAGE_SIZE, sort: "newest" });
    return { ...result, unavailable: false };
  } catch {
    // A durable-store outage should degrade the feed to empty, not crash
    // the whole page; the rest of Buildstory (nav, marketing chrome) still
    // has nothing to do with story storage and should keep working.
    return { stories: [], nextCursor: null, resultCount: 0, facets: { categories: [], tools: [], models: [], liveDemoCount: 0 }, unavailable: true };
  }
}

export default async function ExplorePage() {
  const { stories, nextCursor, unavailable, resultCount, facets } = await loadStories();
  return (
    <section className="explore-page section-wrap">
        <header className="explore-heading">
          <div>
            <span className="section-index">( EXPLORE / {String(stories.length).padStart(2, "0")} STORIES )</span>
            <h1>What are people<br />actually building?</h1>
          </div>
          <p>
            Finished products, earnest experiments, and work in progress — with
            enough process left in to learn from.
          </p>
        </header>
        <ExploreFeed projects={stories} initialCursor={nextCursor} resultCount={resultCount} initialFacets={facets} unavailable={unavailable} />
    </section>
  );
}
