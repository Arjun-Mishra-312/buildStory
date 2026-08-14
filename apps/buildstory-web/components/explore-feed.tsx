"use client";

import Link from "next/link";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { GenerateCommand } from "@/components/marketing/generate-command";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { STORY_CATEGORIES, type StoryCategory } from "@/lib/ingestion/contracts";
import { initialsFrom } from "@/lib/identity/initials";
import { StoryVisual } from "@/components/story-visual";
import { excerptStatsFromStory } from "@/lib/story/explore-facts";
import { categoryLabel, formatBuildTime, statusClass } from "@/lib/story/display-labels";
import { ModelName } from "@/components/model-mark";

export type ExploreStory = PublicBuildStoryViewModel & { publishedAt: string | null; reportId?: string };
type SortMode = "newest" | "trending";
type Facets = {
  categories: Array<{ value: string; label: string; count: number }>;
  tools: Array<{ value: string; label: string; count: number }>;
  models: Array<{ value: string; label: string; requestShare: number }>;
  liveDemoCount: number;
};

function storyHref(story: ExploreStory) {
  return `/u/${story.owner.handle}/${story.slug}`;
}

function ExploreExcerpt({ story, badge }: { story: ExploreStory; badge: string }) {
  const facts = excerptStatsFromStory(story);
  const archetype = story.profile?.archetype?.name;
  return (
    <article className="explore-excerpt">
      <Link href={storyHref(story)}>
        <div className="explore-excerpt__media">
          <StoryVisual story={story} />
          <span className="explore-excerpt__badge">{badge}</span>
        </div>
        <div className="explore-excerpt__copy">
          <div className="explore-excerpt__meta">
            <span className={`status-pill status-pill--${statusClass[story.status]}`}>{story.status}</span>
            <span className="explore-excerpt__category">{categoryLabel(story.category)}</span>
            {archetype ? <span className="explore-excerpt__archetype">{archetype}</span> : null}
          </div>
          <h3>{story.name}</h3>
          {story.tagline || story.description ? <p>{story.tagline || story.description}</p> : null}
          {facts.length ? (
            <div className="explore-excerpt__facts" aria-label="From this report">
              {facts.map((fact) => (
                <span key={fact.label}>
                  <small>{fact.label}</small>
                  <strong>{fact.value}</strong>
                </span>
              ))}
            </div>
          ) : null}
          {story.headlineFact ? (
            <blockquote className="explore-excerpt__finding">
              <small>Key finding</small>
              <strong>{story.headlineFact}</strong>
            </blockquote>
          ) : null}
          <div className="story-byline">
            <span className="avatar">{initialsFrom(story.owner.name)}</span>
            <span>
              <strong>{story.owner.name}</strong>
              <small>@{story.owner.handle}</small>
            </span>
            <span className="story-arrow" aria-hidden="true">↗</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function ExploreTile({ story }: { story: ExploreStory }) {
  const chips = [...story.stack, ...story.tools.slice(0, 2).map((tool) => tool.label)].slice(0, 3);
  const liveDemo = Boolean(story.artifactLinks?.projectUrl);
  const model = story.models[0];
  return (
    <article className="explore-tile">
      <Link href={storyHref(story)}>
        <div className="explore-tile__media">
          <StoryVisual story={story} variant="compact" />
          <span className="explore-tile__status">
            <span className={`status-dot status-dot--${statusClass[story.status]}`} aria-hidden="true" />
            {story.status}
          </span>
          <span className="explore-tile__category">{categoryLabel(story.category)}</span>
        </div>
        <div className="explore-tile__body">
          <h3>{story.name}</h3>
          {story.headlineFact ? (
            <p className="explore-tile__finding">{story.headlineFact}</p>
          ) : story.tagline || story.description ? (
            <p className="explore-tile__tagline">{story.tagline || story.description}</p>
          ) : null}
          <div className="explore-tile__stats" aria-label="Build statistics">
            <span><small>Sessions</small><strong>{story.sessionCount}</strong></span>
            <span><small>Commits</small><strong>{story.git.commits}</strong></span>
            <span><small>Build time</small><strong>{formatBuildTime(story.buildHours)}</strong></span>
            <span><small>Model</small><strong>{model ? <ModelName id={model.id} label={model.label} provider={model.provider} /> : "Not shared"}</strong></span>
          </div>
          {chips.length || liveDemo ? (
            <div className="explore-tile__chips">
              {liveDemo ? <span className="explore-tile__chip explore-tile__chip--demo">Live demo</span> : null}
              {chips.map((value) => <span className="explore-tile__chip" key={value}>{value}</span>)}
            </div>
          ) : null}
          <div className="story-byline explore-tile__byline">
            <span className="avatar avatar--small">{initialsFrom(story.owner.name)}</span>
            <span>
              <strong>{story.owner.name}</strong>
              <small>@{story.owner.handle} · {story.activeDays}d active</small>
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function queryString(state: { q: string; category: string; tools: string[]; models: string[]; hasDemo: boolean; sort: SortMode; cursor?: string | null }) {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.category) params.set("category", state.category);
  state.tools.forEach((value) => params.append("tool", value));
  state.models.forEach((value) => params.append("model", value));
  if (state.hasDemo) params.set("hasDemo", "true");
  if (state.sort !== "newest") params.set("sort", state.sort);
  if (state.cursor) params.set("cursor", state.cursor);
  params.set("limit", "30");
  return params.toString();
}

function EmptyStateArt() {
  return <EditorialIllustration kind="search-no-results" className="explore-empty__art" />;
}

export function ExploreFeed({
  projects,
  initialCursor = null,
  resultCount = projects.length,
  initialFacets,
  unavailable = false,
}: {
  projects: ExploreStory[];
  initialCursor?: string | null;
  resultCount?: number;
  initialFacets?: Facets;
  unavailable?: boolean;
}) {
  const [items, setItems] = useState(projects);
  const [facets, setFacets] = useState<Facets>(initialFacets ?? { categories: [], tools: [], models: [], liveDemoCount: 0 });
  const [resultTotal, setResultTotal] = useState(resultCount);
  const [cursor, setCursor] = useState(initialCursor);
  const cursorRef = useRef(initialCursor);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [hasDemo, setHasDemo] = useState(false);
  const [sort, setSort] = useState<SortMode>("newest");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const frame = window.requestAnimationFrame(() => {
      setQ(params.get("q") ?? "");
      setCategory(params.get("category") ?? "");
      setTools(params.getAll("tool"));
      setModels(params.getAll("model"));
      setHasDemo(params.get("hasDemo") === "true");
      setSort(params.get("sort") === "trending" ? "trending" : "newest");
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const state = useMemo(() => ({ q, category, tools, models, hasDemo, sort }), [q, category, tools, models, hasDemo, sort]);
  const load = useCallback(async (append = false) => {
    if (append && !cursorRef.current) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = queryString({ ...state, cursor: append ? cursorRef.current : null });
      const response = await fetch(`/api/stories?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const data = (await response.json()) as { stories: ExploreStory[]; nextCursor: string | null; resultCount: number; facets: Facets };
      setItems((current) => append ? [...current, ...data.stories] : data.stories);
      cursorRef.current = data.nextCursor;
      setCursor(data.nextCursor);
      setResultTotal(data.resultCount);
      setFacets(data.facets);
      window.history.replaceState(null, "", `/explore?${queryString({ ...state, cursor: null })}`);
    } catch {
      // Keep the previous list visible; the inline message gives the user a focused retry path.
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [state]);

  useEffect(() => {
    // The load callback owns the loading state; this effect only bridges URL state to the request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) void load(false);
  }, [ready, load]);

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) => setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const activeCount = Number(Boolean(category)) + tools.length + models.length + Number(hasDemo);
  const clear = () => { setQ(""); setCategory(""); setTools([]); setModels([]); setHasDemo(false); };

  return (
    <div className="explore-browser">
      <div className="explore-toolbar">
        <label className="explore-search">
          <span className="sr-only">Search projects, tools, or topics</span>
          <span aria-hidden="true">⌕</span>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search projects, tools, or topics" />
        </label>
        <div className="explore-sort" role="group" aria-label="Sort stories">
          <button type="button" className={sort === "newest" ? "is-active" : undefined} aria-pressed={sort === "newest"} onClick={() => setSort("newest")}>Newest</button>
          <button type="button" className={sort === "trending" ? "is-active" : undefined} aria-pressed={sort === "trending"} onClick={() => setSort("trending")}>Trending</button>
        </div>
      </div>

      <div className="explore-browser__grid">
        <aside className="explore-facet-rail" aria-label="Refine stories">
          <div className="explore-facet-rail__head"><strong>Refine</strong></div>
          <fieldset>
            <legend>Category</legend>
            <div className="explore-facet-chips" role="group" aria-label="Category">
              <button type="button" className={!category ? "is-active" : undefined} aria-pressed={!category} onClick={() => setCategory("")}>
                All <em>{resultTotal}</em>
              </button>
              {STORY_CATEGORIES.map((value: StoryCategory) => {
                const item = facets.categories.find((facet) => facet.value === value);
                return (
                  <button type="button" className={category === value ? "is-active" : undefined} aria-pressed={category === value} key={value} onClick={() => setCategory(value)}>
                    {categoryLabel(value)} <em>{item?.count ?? 0}</em>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend>Tools & stack</legend>
            {facets.tools.slice(0, 8).map((item) => (
              <label className="facet-option" key={item.value}>
                <input type="checkbox" checked={tools.includes(item.value.toLocaleLowerCase())} onChange={() => toggle(tools, item.value.toLocaleLowerCase(), setTools)} />
                <span>{item.label}</span>
                <em>{item.count}</em>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Models</legend>
            {facets.models.length ? facets.models.slice(0, 6).map((item) => (
              <label className="facet-option" key={item.value}>
                <input type="checkbox" checked={models.includes(item.value.toLocaleLowerCase())} onChange={() => toggle(models, item.value.toLocaleLowerCase(), setModels)} />
                <span><ModelName id={item.value} label={item.label} /></span>
                <em>{item.requestShare}%</em>
              </label>
            )) : <p className="facet-empty">No public model data yet.</p>}
          </fieldset>
          <label className="facet-option facet-option--demo">
            <input type="checkbox" checked={hasDemo} onChange={(event) => setHasDemo(event.target.checked)} />
            <span>Has live demo</span>
            <em>{facets.liveDemoCount}</em>
          </label>
          {activeCount ? <button type="button" className="button button--text" onClick={clear}>Clear all filters</button> : null}
        </aside>

        <main className="explore-results" aria-live="polite">
          <div className="explore-results__heading">
            <span className="section-index">{sort === "trending" ? "( TRENDING NOW )" : "( LATEST STORIES )"}</span>
            <span className="explore-results__count">{resultTotal} {resultTotal === 1 ? "build story" : "build stories"}{activeCount ? ` · ${activeCount} filters` : ""}</span>
          </div>
          {loading ? (
            <div className="explore-skeleton-list" aria-label="Loading stories">
              {[1, 2, 3, 4].map((key) => <div className="explore-skeleton-card" key={key}><i /><span /><span /><b /></div>)}
            </div>
          ) : unavailable ? (
            <div className="explore-empty explore-empty--error" role="alert">
              <span>( TEMPORARILY UNAVAILABLE )</span>
              <h2>The story trail is taking a breather.</h2>
              <p>Published stories did not load. Try again in a moment.</p>
              <button className="button button--secondary" type="button" onClick={() => void load(false)}>Try again</button>
            </div>
          ) : !items.length ? (
            <div className="explore-empty" role="status">
              {activeCount || q ? <EmptyStateArt /> : null}
              <span>{activeCount || q ? "NO MATCHES" : "0 STORIES"}</span>
              <h2>{activeCount || q ? "Nothing matches those filters." : "No published build stories yet."}</h2>
              <p>{activeCount || q ? "Try a broader search or clear a facet." : "Publish one from Studio and it will show up here."}</p>
              {activeCount || q ? <button type="button" className="button button--secondary" onClick={clear}>Clear filters</button> : null}
            </div>
          ) : (
            <>
              <ExploreExcerpt story={items[0]!} badge={sort === "trending" ? "Trending now" : "Latest story"} />
              {items.length > 1 ? (
                <div className="explore-story-grid">
                  {items.slice(1).map((story) => (
                    <ExploreTile key={story.reportId ?? story.slug} story={story} />
                  ))}
                </div>
              ) : null}
              {cursor ? (
                <div className="explore-load-more">
                  <button type="button" className="button button--secondary" onClick={() => void load(true)} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more stories"}</button>
                </div>
              ) : (
                <p className="explore-end">You’re caught up · all matching stories are shown.</p>
              )}
            </>
          )}
        </main>
      </div>

      <aside className="explore-close">
        <span className="section-index">( YOUR BUILD )</span>
        <p>Your build has more to say.</p>
        <GenerateCommand className="explore-command" />
      </aside>
    </div>
  );
}
