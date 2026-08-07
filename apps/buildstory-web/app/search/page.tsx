import type { Metadata } from "next";
import Link from "next/link";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { searchPublishedStories } from "@/lib/ingestion/store";
import { searchProfiles } from "@/lib/social/store";

export const metadata: Metadata = { title: "Search build stories" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string; type?: string }> };

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const tab = params.type === "people" ? "people" : "stories";
  const results = tab === "stories" && query.length >= 2 ? await searchPublishedStories(query, 20).catch(() => []) : [];
  const people = tab === "people" && query.length >= 2 ? await searchProfiles(query, 20).catch(() => []) : [];
  return (
    <section className="search-page section-wrap">
      <span className="section-index">( SEARCH BUILDSTORY )</span>
      <h1>Find the work behind the work.</h1>
      <form className="search-page__form" method="get">
        <input type="hidden" name="type" value={tab} />
        <label htmlFor="story-search">{tab === "people" ? "Search builders by handle or name" : "Search projects, makers, or tools"}</label>
        <div>
          <input id="story-search" name="q" defaultValue={query} minLength={2} placeholder={tab === "people" ? "Try a handle or a name" : "Try “Claude”, “Orbit”, or a maker name"} />
          <button className="button button--primary" type="submit">Search</button>
        </div>
      </form>
      <div className="search-page__tabs" role="tablist">
        <Link href={`/search?type=stories${query ? `&q=${encodeURIComponent(query)}` : ""}`} aria-current={tab === "stories" ? "page" : undefined}>Stories</Link>
        <Link href={`/search?type=people${query ? `&q=${encodeURIComponent(query)}` : ""}`} aria-current={tab === "people" ? "page" : undefined}>People</Link>
      </div>
      {query && query.length < 2 ? (
        <p role="status">Enter at least two characters.</p>
      ) : tab === "people" ? (
        people.length ? (
          <div className="feed-list">
            {people.map((person) => (
              <Link className="feed-list__item" href={`/u/${person.handle}`} key={person.handle}>
                <strong>{person.displayName}</strong>
                <span>{person.bio || "AI-assisted software builder."}</span>
                <small>@{person.handle} · {person.followerCount} followers</small>
              </Link>
            ))}
          </div>
        ) : query ? (
          <div className="search-empty" role="status">
            <div className="search-empty__art"><EditorialIllustration kind="search-no-results" /></div>
            <p>No builders matched “{query}”.</p>
          </div>
        ) : (
          <p>Search for builders by handle or display name.</p>
        )
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
        <div className="search-empty" role="status">
          <div className="search-empty__art"><EditorialIllustration kind="search-no-results" /></div>
          <p>No public stories matched “{query}”.</p>
        </div>
      ) : (
        <p>Search the public story archive.</p>
      )}
    </section>
  );
}
