"use client";

import type { BuildJourneyPhase } from "@/lib/report/report-insights-view-model";
import { ReportFigure } from "./report-figure";

const phaseLabels = { discover: "Discover", decide: "Decide", deliver: "Deliver" } as const;

export function BuildJourney({ phases, activeRefs, onSelectRefs }: { phases: BuildJourneyPhase[]; activeRefs: string[]; onSelectRefs: (refs: string[]) => void }) {
  if (!phases.length) return null;
  const active = new Set(activeRefs);
  const dimmed = active.size > 0;
  return (
    <ReportFigure
      id="build-journey"
      index="01"
      title="BUILD JOURNEY"
      question="How did the work move?"
      description="One chronology combines the narrative arc, decisive moments, and milestones into the story of how the build found its shape."
      sourceNote="Source: evidence-linked story phases, moments, and projected milestones."
      className="build-journey"
      table={<table><thead><tr><th>Phase</th><th>Story</th><th>Moments</th><th>Milestones</th></tr></thead><tbody>{phases.map((phase) => <tr key={phase.phase}><th>{phaseLabels[phase.phase]}</th><td>{phase.headline}</td><td>{phase.moments.length}</td><td>{phase.milestones.length}</td></tr>)}</tbody></table>}
    >
      <div className="build-journey__layout">
        <div className="build-journey__phases">
          {phases.map((phase) => {
            const refs = [...new Set([...phase.sourceRefs, ...phase.moments.flatMap((moment) => moment.sourceRefs)])];
            const matches = !dimmed || refs.some((ref) => active.has(ref));
            return (
              <article className={matches ? "" : "is-dimmed"} key={phase.phase} data-phase={phase.phase}>
                <header><span>FOLIO {String(phase.index).padStart(2, "0")}</span><strong>{phaseLabels[phase.phase]}</strong><small>{phase.phase === "discover" ? "FIELD NOTES" : phase.phase === "decide" ? "WORKING PROOF" : "RELEASE DESK"}</small></header>
                <h3>{phase.headline}</h3>
                <p>{phase.summary}</p>
                {phase.moments.length ? <ol>{phase.moments.map((moment, momentIndex) => <li key={moment.id}><button type="button" onClick={() => onSelectRefs(moment.sourceRefs)}><b>{String.fromCharCode(65 + momentIndex)}</b><span><small>{moment.kind}</small><strong>{moment.title}</strong></span></button></li>)}</ol> : null}
                {phase.milestones.length ? <div className="build-journey__milestones">{phase.milestones.map((milestone) => <span key={milestone.id}><i /><time>{milestone.date}</time><strong>{milestone.title}</strong></span>)}</div> : null}
                <footer><span>{phaseLabels[phase.phase].toUpperCase()}</span><b>{phase.index}</b></footer>
              </article>
            );
          })}
        </div>
        <div className="build-journey__illustration" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/illustrations/story-moments/branching-decisions.webp" alt="" />
        </div>
      </div>
    </ReportFigure>
  );
}
