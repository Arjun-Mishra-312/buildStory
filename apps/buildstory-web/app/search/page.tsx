import type { Metadata } from "next";
import Link from "next/link";
import { searchPublishedStories } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Search build stories" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: PageProps) {
  const query = (await searchParams).q?.trim() ?? "";
  const results = query.length >= 2 ? await searchPublishedStories(query, 20).catch(() => []) : [];
  return (
    <section className="search-page section-wrap">
      <span className="section-index">( SEARCH BUILD STORIES )</span>
      <h1>Find the work behind the work.</h1>
      <form className="search-page__form" method="get">
        <label htmlFor="story-search">Search projects, makers, or tools</label>
        <div>
          <input id="story-search" name="q" defaultValue={query} minLength={2} placeholder="Try “Claude”, “Orbit”, or a maker name" />
          <button className="button button--primary" type="submit">Search</button>
        </div>
      </form>
      {query && query.length < 2 ? (
        <p role="status">Enter at least two characters.</p>
      ) : results.length ? (
        <div className="feed-list">
          {results.map((story) => (
            <Link className="feed-list__item" href={`/u/${story.owner.handle}/${story.slug}`} key={story.slug}>
              <strong>{story.name}</strong>
              <span>{story.tagline}</span>
              <small>@{story.owner.handle}</small>
            </Link>
          ))}
        </div>
      ) : query ? (
        <p role="status">No public stories matched “{query}”.</p>
      ) : (
        <p>Search the public story archive.</p>
      )}
    </section>
  );
}
