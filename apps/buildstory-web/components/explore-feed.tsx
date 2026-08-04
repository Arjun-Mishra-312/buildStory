"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExploreProject } from "@/lib/mock-projects";

type Filter = "All" | ExploreProject["status"];

const filters: Filter[] = ["All", "Building", "Shipped", "Experiment"];

export function ExploreFeed({ projects }: { projects: ExploreProject[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesFilter = filter === "All" || project.status === filter;
      const matchesQuery =
        !normalized ||
        [
          project.name,
          project.tagline,
          project.maker,
          project.category,
          project.models.join(" "),
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
              key={item}
              type="button"
              className={filter === item ? "is-active" : undefined}
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
            >
              {item}
              <span>
                {item === "All"
                  ? projects.length
                  : projects.filter((project) => project.status === item).length}
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
      </div>

      {!featured ? (
        <div className="explore-empty" role="status">
          <span>0 stories</span>
          <h2>Nothing matches that trail yet.</h2>
          <button type="button" onClick={() => { setFilter("All"); setQuery(""); }}>
            Clear the filters
          </button>
        </div>
      ) : (
        <div className="explore-layout">
          <Link className="featured-story" href={`/p/${featured.slug}`}>
            <div className="featured-story__visual">
              <div className="featured-story__grid" aria-hidden="true">
                <span /><span /><span /><span /><span /><span /><span /><span />
              </div>
              <div className="featured-story__receipt">
                <div><span>BUILD /</span><strong>{featured.name.toUpperCase()}</strong></div>
                <dl>
                  <div><dt>WINDOW</dt><dd>{featured.days} DAYS</dd></div>
                  <div><dt>SESSIONS</dt><dd>{String(featured.sessions).padStart(2, "0")}</dd></div>
                  <div><dt>COMMITS</dt><dd>{featured.commits}</dd></div>
                </dl>
                <div className="featured-story__receipt-rule" />
                <small>PROCESS RECEIPT · LOCALLY REDACTED</small>
              </div>
              <span className="featured-story__flag">EDITOR’S PICK</span>
            </div>
            <div className="featured-story__body">
              <div className="story-meta">
                <span className="status-dot status-dot--shipped" />
                {featured.status} · {featured.category}
              </div>
              <h2>{featured.name}</h2>
              <p className="featured-story__tagline">{featured.tagline}</p>
              <p>{featured.summary}</p>
              <div className="turning-point">
                <small>THE TURNING POINT</small>
                <strong>“{featured.moment}”</strong>
              </div>
              <div className="story-byline">
                <span className="avatar">{featured.initials}</span>
                <span>
                  <strong>{featured.maker}</strong>
                  <small>@{featured.handle}</small>
                </span>
                <span className="story-arrow" aria-hidden="true">↗</span>
              </div>
            </div>
          </Link>

          <div className="story-list" aria-live="polite">
            {rest.map((project, index) => (
              <article className="story-row" key={project.slug}>
                <div className={`story-row__index story-row__index--${project.accent}`}>
                  {String(index + 2).padStart(2, "0")}
                </div>
                <div className="story-row__content">
                  <div className="story-row__topline">
                    <span className={`status-dot status-dot--${project.status.toLowerCase()}`} />
                    {project.status} · {project.category}
                    <span>{project.updatedAt}</span>
                  </div>
                  <h3>{project.name}</h3>
                  <p className="story-row__tagline">{project.tagline}</p>
                  <p>{project.summary}</p>
                  <blockquote>“{project.moment}”</blockquote>
                  <div className="story-row__footer">
                    <span className="avatar avatar--small">{project.initials}</span>
                    <span>{project.maker}</span>
                    <span className="story-row__stats">
                      {project.days}d · {project.sessions} sessions · {project.commits} commits
                    </span>
                    <span className="story-row__models">{project.models.join(" + ")}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
