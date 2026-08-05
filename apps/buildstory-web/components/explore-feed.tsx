"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicBuildStoryViewModel } from "@/lib/build-story";

export type ExploreStory = PublicBuildStoryViewModel & { publishedAt: string | null };

type StatusFilter = "All" | ExploreStory["status"];
type PreviewMode = "receipt" | "images";

const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: "All", label: "All" },
  { value: "building", label: "Building" },
  { value: "shipped", label: "Shipped" },
  { value: "prototype", label: "Prototype" },
];

const statusCssClass: Record<ExploreStory["status"], string> = {
  shipped: "shipped",
  building: "building",
  prototype: "experiment",
};

const accentRotation = ["cobalt", "coral", "ink"] as const;

function accentFor(slug: string) {
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) >>> 0;
  }
  return accentRotation[hash % accentRotation.length];
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

function turningPoint(story: ExploreStory) {
  return story.milestones[0]?.title ?? null;
}

function modelNames(story: ExploreStory) {
  return story.models.slice(0, 3).map((model) => model.label);
}

export function ExploreFeed({ projects, unavailable = false }: { projects: ExploreStory[]; unavailable?: boolean }) {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [query, setQuery] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("receipt");

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesFilter = filter === "All" || project.status === filter;
      const matchesQuery =
        !normalized ||
        [
          project.name,
          project.tagline,
          project.owner.name,
          project.stack.join(" "),
          project.models.map((model) => model.label).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [filter, projects, query]);

  const featured = visible[0];
  const rest = visible.slice(1);

  return (
    <>
      <div className="explore-controls">
        <div className="filter-tabs" role="group" aria-label="Filter build stories">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              className={filter === item.value ? "is-active" : undefined}
              onClick={() => setFilter(item.value)}
              aria-pressed={filter === item.value}
            >
              {item.label}
              <span>
                {item.value === "All"
                  ? projects.length
                  : projects.filter((project) => project.status === item.value).length}
              </span>
            </button>
          ))}
        </div>
        <label className="explore-search">
          <span className="sr-only">Search stories</span>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, makers, tools"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="explore-preview-toggle" role="group" aria-label="Featured story preview">
          <span>Preview</span>
          {(["receipt", "images"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={previewMode === mode ? "is-active" : undefined}
              onClick={() => setPreviewMode(mode)}
              aria-pressed={previewMode === mode}
            >
              {mode === "receipt" ? "Receipt" : "Images"}
            </button>
          ))}
        </div>
      </div>

      {unavailable ? (
        <div className="explore-empty explore-empty--error" role="alert">
          <span>( TEMPORARILY UNAVAILABLE )</span>
          <h2>The story trail is taking a breather.</h2>
          <p>Published stories did not load. Try again in a moment.</p>
          <a className="button button--secondary" href="/explore">Try again</a>
        </div>
      ) : !featured ? (
        <div className="explore-empty" role="status">
          <span>0 stories</span>
          <h2>
            {projects.length === 0
              ? "No published build stories yet."
              : "Nothing matches that trail yet."}
          </h2>
          {projects.length === 0 ? (
            <p>Publish one from your dashboard and it will show up here.</p>
          ) : (
            <button type="button" onClick={() => { setFilter("All"); setQuery(""); }}>
              Clear the filters
            </button>
          )}
        </div>
      ) : (
        <div className="explore-layout">
          <Link className="featured-story" href={`/p/${featured.slug}`}>
            <div className={`featured-story__visual featured-story__visual--${previewMode}`}>
              <div className="featured-story__grid" aria-hidden="true">
                <span /><span /><span /><span /><span /><span /><span /><span />
              </div>
              {previewMode === "receipt" ? (
                <div className="featured-story__receipt">
                  <div><span>BUILD /</span><strong>{featured.name.toUpperCase()}</strong></div>
                  <dl>
                    <div><dt>WINDOW</dt><dd>{featured.activeDays} DAYS</dd></div>
                    <div><dt>SESSIONS</dt><dd>{String(featured.sessionCount).padStart(2, "0")}</dd></div>
                    <div><dt>COMMITS</dt><dd>{featured.git.commits}</dd></div>
                  </dl>
                  <div className="featured-story__receipt-rule" />
                  <small>PROCESS RECEIPT · LOCALLY REDACTED</small>
                </div>
              ) : (
                <div className="featured-story__image-board" aria-label={`Process preview for ${featured.name}`}>
                  <div className="featured-story__image-card featured-story__image-card--main">
                    <span>PROCESS / {String(featured.sessionCount).padStart(2, "0")}</span>
                    <strong>{featured.name}</strong>
                    <i />
                    <small>{featured.stack.slice(0, 2).join(" · ") || "BUILD STORY"}</small>
                  </div>
                  <div className="featured-story__image-card featured-story__image-card--small">
                    <span>AI MIX</span>
                    <strong>{featured.models[0]?.label ?? "Private"}</strong>
                    <small>{featured.models.length ? `${featured.models.length} models` : "Not shared"}</small>
                  </div>
                  <div className="featured-story__image-card featured-story__image-card--stamp">
                    <strong>{featured.git.commits}</strong>
                    <small>COMMITS</small>
                  </div>
                </div>
              )}
              <span className="featured-story__flag">EDITOR’S PICK</span>
            </div>
            <div className="featured-story__body">
              <div className="story-meta">
                <span className={`status-dot status-dot--${statusCssClass[featured.status]}`} />
                {featured.status}
                {featured.stack.length ? ` · ${featured.stack[0]}` : ""}
              </div>
              <h2>{featured.name}</h2>
              <p className="featured-story__tagline">{featured.tagline}</p>
              <p>{featured.description}</p>
              {modelNames(featured).length ? (
                <div className="story-model-chips" aria-label="Models used">
                  {modelNames(featured).map((model) => <span key={model}>{model}</span>)}
                </div>
              ) : null}
              {turningPoint(featured) ? (
                <div className="turning-point">
                  <small>THE TURNING POINT</small>
                  <strong>“{turningPoint(featured)}”</strong>
                </div>
              ) : null}
              <div className="story-byline">
                <span className="avatar">{initialsFor(featured.owner.name)}</span>
                <span>
                  <strong>{featured.owner.name}</strong>
                  <small>@{featured.owner.handle}</small>
                </span>
                <span className="story-arrow" aria-hidden="true">↗</span>
              </div>
            </div>
          </Link>

          <div className="story-list" aria-live="polite">
            {rest.map((project, index) => (
              <Link className="story-row" href={`/p/${project.slug}`} key={project.slug}>
                <div className={`story-row__index story-row__index--${accentFor(project.slug)}`}>
                  {String(index + 2).padStart(2, "0")}
                </div>
                <div className="story-row__content">
                  <div className="story-row__topline">
                    <span className={`status-dot status-dot--${statusCssClass[project.status]}`} />
                    {project.status}
                    <span>{project.dateRange}</span>
                  </div>
                  <h3>{project.name}</h3>
                  <p className="story-row__tagline">{project.tagline}</p>
                  <p>{project.description}</p>
                  {turningPoint(project) ? <blockquote>“{turningPoint(project)}”</blockquote> : null}
                  <div className="story-row__footer">
                    <span className="avatar avatar--small">{initialsFor(project.owner.name)}</span>
                    <span>{project.owner.name}</span>
                    <span className="story-row__stats">
                      {project.activeDays}d · {project.sessionCount} sessions · {project.git.commits} commits
                    </span>
                    {project.models.length ? (
                      <span className="story-model-chips" aria-label="Models used">
                        {modelNames(project).map((model) => <span key={model}>{model}</span>)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
