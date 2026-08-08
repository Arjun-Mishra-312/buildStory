"use client";

import Link from "next/link";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { STORY_CATEGORIES, type StoryCategory } from "@/lib/ingestion/contracts";
import { initialsFrom } from "@/lib/identity/initials";
import { StoryVisual } from "@/components/story-visual";

export type ExploreStory = PublicBuildStoryViewModel & { publishedAt: string | null; reportId?: string };
type SortMode = "newest" | "trending";
type Facets = {
  categories: Array<{ value: string; label: string; count: number }>;
  tools: Array<{ value: string; label: string; count: number }>;
  models: Array<{ value: string; label: string; requestShare: number }>;
  liveDemoCount: number;
};

const categoryLabel = (value: string) => ({
  saas: "SaaS",
  "ai-ml": "AI / ML",
  "web-apps": "Web apps",
  "developer-tools": "Developer tools",
  "design-tools": "Design tools",
  automation: "Automation",
  "data-analytics": "Data & analytics",
  productivity: "Productivity",
  games: "Games",
  other: "Other",
}[value] ?? value.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "));
const statusClass: Record<ExploreStory["status"], string> = { shipped: "shipped", building: "building", prototype: "experiment" };

function formatBuildTime(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

function StoryStats({ story }: { story: ExploreStory }) {
  const model = story.models[0]?.label ?? "Not shared";
  return (
    <div className="explore-story-stats" aria-label="Build statistics">
      <span><small>Build time</small><strong>{formatBuildTime(story.buildHours)}</strong></span>
      <span><small>Primary model</small><strong>{model}</strong></span>
      <span><small>Active</small><strong>{story.activeDays}d</strong></span>
      <span><small>Sessions</small><strong>{story.sessionCount}</strong></span>
      <span><small>Commits</small><strong>{story.git.commits}</strong></span>
    </div>
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ready, setReady] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterCloseRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!drawerOpen) return;
    const frame = window.requestAnimationFrame(() => filterCloseRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) => setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const activeCount = Number(Boolean(category)) + tools.length + models.length + Number(hasDemo);
  const clear = () => { setQ(""); setCategory(""); setTools([]); setModels([]); setHasDemo(false); };
  const closeDrawer = () => {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => filterTriggerRef.current?.focus());
  };

  return (
    <div className="explore-browser">
      <div className="explore-toolbar">
        <label className="explore-search">
          <span className="sr-only">Search projects, tools, or topics</span>
          <span aria-hidden="true">⌕</span>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search projects, tools, or topics" />
          <kbd>⌘ K</kbd>
        </label>
        <div className="explore-toolbar__actions">
          <label className="explore-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="newest">Newest</option><option value="trending">Trending</option></select></label>
          <button ref={filterTriggerRef} type="button" className="button button--secondary explore-filter-trigger" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen} aria-controls="explore-filters">Filters{activeCount ? ` · ${activeCount}` : ""}</button>
        </div>
      </div>

      {activeCount ? <div className="explore-active-filters" aria-label="Selected filters">
        {category ? <button type="button" onClick={() => setCategory("")}>{categoryLabel(category)} <span aria-hidden="true">×</span></button> : null}
        {tools.map((value) => <button type="button" key={`tool-${value}`} onClick={() => toggle(tools, value, setTools)}>{facets.tools.find((item) => item.value.toLocaleLowerCase("en-US") === value)?.label ?? value} <span aria-hidden="true">×</span></button>)}
        {models.map((value) => <button type="button" key={`model-${value}`} onClick={() => toggle(models, value, setModels)}>{facets.models.find((item) => item.value.toLocaleLowerCase("en-US") === value)?.label ?? value} <span aria-hidden="true">×</span></button>)}
        {hasDemo ? <button type="button" onClick={() => setHasDemo(false)}>Live demo <span aria-hidden="true">×</span></button> : null}
      </div> : null}

      <div className="explore-browser__grid">
        {drawerOpen ? <div className="explore-facet-backdrop" onClick={closeDrawer} aria-hidden="true" /> : null}
        <aside id="explore-filters" className={`explore-facet-rail${drawerOpen ? " is-open" : ""}`} onKeyDown={(event) => { if (event.key === "Escape") closeDrawer(); }}>
          <div className="explore-facet-rail__head"><strong>Refine</strong><button ref={filterCloseRef} type="button" className="explore-facet-close" onClick={closeDrawer}>Close</button></div>
          <fieldset><legend>Category</legend><label className="facet-option"><input type="radio" name="category" checked={!category} onChange={() => setCategory("")} /><span>All projects</span><em>{resultTotal}</em></label>{STORY_CATEGORIES.map((value: StoryCategory) => { const item = facets.categories.find((facet) => facet.value === value); return <label className="facet-option" key={value}><input type="radio" name="category" checked={category === value} onChange={() => setCategory(value)} /><span>{categoryLabel(value)}</span><em>{item?.count ?? 0}</em></label>; })}</fieldset>
          <fieldset><legend>Tools & stack</legend>{facets.tools.slice(0, 8).map((item) => <label className="facet-option" key={item.value}><input type="checkbox" checked={tools.includes(item.value.toLocaleLowerCase())} onChange={() => toggle(tools, item.value.toLocaleLowerCase(), setTools)} /><span>{item.label}</span><em>{item.count}</em></label>)}</fieldset>
          <fieldset><legend>Models</legend>{facets.models.length ? facets.models.slice(0, 6).map((item) => <label className="facet-option" key={item.value}><input type="checkbox" checked={models.includes(item.value.toLocaleLowerCase())} onChange={() => toggle(models, item.value.toLocaleLowerCase(), setModels)} /><span>{item.label}</span><em>{item.requestShare}%</em></label>) : <p className="facet-empty">No public model data yet.</p>}</fieldset>
          <label className="facet-option facet-option--demo"><input type="checkbox" checked={hasDemo} onChange={(event) => setHasDemo(event.target.checked)} /><span>Has live demo</span><em>{facets.liveDemoCount}</em></label>
          {activeCount ? <button type="button" className="button button--text" onClick={clear}>Clear all filters</button> : null}
        </aside>

        <main className="explore-results" aria-live="polite">
          <div className="explore-results__heading"><div><span className="section-index">{sort === "trending" ? "( TRENDING NOW )" : "( LATEST STORIES )"}</span><h2>{resultTotal} build stories</h2></div><span className="explore-results__count">{activeCount ? `${activeCount} filters active` : "Public process receipts"}</span></div>
          {loading ? <div className="explore-skeleton-list" aria-label="Loading stories">{[1, 2, 3].map((key) => <div className="explore-skeleton-row" key={key}><i /><span /><span /><b /></div>)}</div> : unavailable ? <div className="explore-empty explore-empty--error" role="alert"><span>( TEMPORARILY UNAVAILABLE )</span><h2>The story trail is taking a breather.</h2><p>Published stories did not load. Try again in a moment.</p><button className="button button--secondary" type="button" onClick={() => void load(false)}>Try again</button></div> : !items.length ? <div className="explore-empty" role="status">{activeCount || q ? <EmptyStateArt /> : null}<span>{activeCount || q ? "NO MATCHES" : "0 STORIES"}</span><h2>{activeCount || q ? "Nothing matches those filters." : "No published build stories yet."}</h2><p>{activeCount || q ? "Try a broader search or clear a facet." : "Publish one from your dashboard and it will show up here."}</p>{activeCount || q ? <button type="button" onClick={clear}>Clear filters</button> : null}</div> : <>
            <div className="explore-lead"><Link href={`/u/${items[0].owner.handle}/${items[0].slug}`}><div className="explore-lead__media"><StoryVisual story={items[0]} /><span className="explore-lead__badge">{sort === "trending" ? "Trending now" : "Latest story"}</span></div><div className="explore-lead__copy"><span className={`status-pill status-pill--${statusClass[items[0].status]}`}>{items[0].status}</span><span className="explore-lead__category">{categoryLabel(items[0].category)}</span><h3>{items[0].name}</h3><p>{items[0].tagline || items[0].description}</p><StoryStats story={items[0]} /><div className="story-byline"><span className="avatar">{initialsFrom(items[0].owner.name)}</span><span><strong>{items[0].owner.name}</strong><small>@{items[0].owner.handle}</small></span><span className="story-arrow" aria-hidden="true">↗</span></div></div></Link></div>
            <div className="explore-story-list">{items.slice(1).map((story) => <Link className="explore-story-card" href={`/u/${story.owner.handle}/${story.slug}`} key={story.slug}><div className="explore-story-card__visual"><StoryVisual story={story} /></div><div className="explore-story-card__body"><div className="story-row__topline"><span className={`status-dot status-dot--${statusClass[story.status]}`} />{story.status}<span>·</span><span>{categoryLabel(story.category)}</span></div><h3>{story.name}</h3><p>{story.tagline || story.description}</p><div className="explore-story-card__chips">{[...story.stack, ...story.tools.slice(0, 2).map((tool) => tool.label)].slice(0, 4).map((value) => <span key={value}>{value}</span>)}</div><div className="story-row__footer"><span className="avatar avatar--small">{initialsFrom(story.owner.name)}</span><span>{story.owner.name}</span><span className="story-row__stats">{story.activeDays}d · {story.sessionCount} sessions · {story.git.commits} commits</span></div></div><div className="explore-story-card__aside"><small>Build time</small><strong>{formatBuildTime(story.buildHours)}</strong><small>Primary model</small><span>{story.models[0]?.label ?? "Not shared"}</span><small>Activity</small><span>{story.activeDays} active days · {story.sessionCount} sessions</span></div></Link>)}</div>
            {cursor ? <div className="explore-load-more"><button type="button" className="button button--secondary" onClick={() => void load(true)} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more stories"}</button></div> : <p className="explore-end">You’re caught up · all matching stories are shown.</p>}
          </>}
        </main>
      </div>
    </div>
  );
}
