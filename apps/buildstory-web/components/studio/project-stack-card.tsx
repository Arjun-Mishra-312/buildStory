"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { StoryVisual, type StoryVisualStory } from "@/components/story-visual";

export type ProjectStackRun = {
  sessionId: string;
  reportId: string;
  projectLabel: string;
  story: (StoryVisualStory & { tagline: string; createdAt: string }) | null;
};

function fallbackStory(projectLabel: string): StoryVisualStory {
  return { name: projectLabel, stack: [], storyBackgroundId: "repository-topography", artifactMedia: [] };
}

/**
 * Renders one project's ready-report cards on the studio dashboard. A single
 * run renders exactly today's card; multiple runs render as a stacked deck
 * with a toggle that reveals the older runs inline.
 */
export function ProjectStackCard({ runs }: { runs: ProjectStackRun[] }) {
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-stack-panel`;
  const front = runs[0];
  const others = runs.slice(1);

  const frontCard = (
    <Link className="dashboard-project-card dashboard-project-card--front" href={`/studio/reports/${front.reportId}`}>
      <div className="dashboard-project-card__cover" aria-hidden="true">
        <StoryVisual variant="compact" story={front.story ?? fallbackStory(front.projectLabel)} />
      </div>
      <div className="dashboard-project-card__body">
        <div><span className="status-dot status-dot--shipped" /> REPORT READY</div>
        <h2>{front.story?.name ?? front.projectLabel}</h2>
        {front.story?.tagline ? <p>{front.story.tagline}</p> : null}
        <dl>
          <div><dt>Report</dt><dd>Ready</dd></div>
          <div><dt>Snapshot</dt><dd>Validated</dd></div>
        </dl>
      </div>
      <span className="dashboard-project-card__arrow" aria-hidden="true">↗</span>
    </Link>
  );

  if (others.length === 0) return frontCard;

  return (
    <div className="dashboard-project-stack dashboard-project-stack--multi">
      <div className="dashboard-project-stack__deck">
        <div className="dashboard-project-stack__edge dashboard-project-stack__edge--2" aria-hidden="true" />
        <div className="dashboard-project-stack__edge dashboard-project-stack__edge--1" aria-hidden="true" />
        {frontCard}
        <button
          type="button"
          className={`dashboard-project-stack__toggle${open ? " is-open" : ""}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {runs.length} runs <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open ? (
        <div className="dashboard-project-stack__panel" id={panelId}>
          <ul className="dashboard-project-stack__list">
            {others.map((run) => (
              <li key={run.sessionId}>
                <Link className="dashboard-project-stack__run" href={`/studio/reports/${run.reportId}`}>
                  <span className="dashboard-project-stack__run-cover" aria-hidden="true">
                    <StoryVisual variant="compact" story={run.story ?? fallbackStory(run.projectLabel)} />
                  </span>
                  <span className="dashboard-project-stack__run-body">
                    <strong>{run.story?.name ?? run.projectLabel}</strong>
                    <span>{run.story ? new Date(run.story.createdAt).toLocaleDateString() : "Report"}</span>
                  </span>
                  <span className="dashboard-project-stack__run-arrow" aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
