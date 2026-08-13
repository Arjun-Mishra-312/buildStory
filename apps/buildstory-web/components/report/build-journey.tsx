"use client";

import type { BuildJourneyPhase } from "@/lib/report/report-insights-view-model";
import { ReportFigure } from "./report-figure";

const phaseLabels = { discover: "Discover", decide: "Decide", deliver: "Deliver" } as const;

export function BuildJourney({
  phases,
  activeRefs,
  onSelectRefs,
  layout = "folios",
  chrome = true,
  showMast = !chrome,
}: {
  phases: BuildJourneyPhase[];
  activeRefs: string[];
  onSelectRefs: (refs: string[]) => void;
  layout?: "folios" | "spine";
  chrome?: boolean;
  showMast?: boolean;
}) {
  if (!phases.length) return null;
  const active = new Set(activeRefs);
  const dimmed = active.size > 0;
  const spine = layout === "spine";
  return (
    <ReportFigure
      id="build-journey"
      index="01"
      title="BUILD JOURNEY"
      question="How did the work move?"
      description="Discover, decide, and deliver — the moments that shaped the build."
      sourceNote="Source: evidence-linked story phases and moments."
      chrome={chrome}
      className={`build-journey${spine ? " build-journey--spine" : ""}`}
      table={chrome ? <table><thead><tr><th>Phase</th><th>Story</th><th>Moments</th></tr></thead><tbody>{phases.map((phase) => <tr key={phase.phase}><th>{phaseLabels[phase.phase]}</th><td>{phase.headline}</td><td>{phase.moments.length}</td></tr>)}</tbody></table> : undefined}
    >
      {!chrome && showMast ? <header className="build-journey__mast"><span>BUILD JOURNEY</span><strong>Discover · Decide · Deliver</strong></header> : null}
      <div className="build-journey__layout">
        <div className="build-journey__phases">
          {phases.map((phase) => {
            const refs = [...new Set([...phase.sourceRefs, ...phase.moments.flatMap((moment) => moment.sourceRefs)])];
            const matches = !dimmed || refs.some((ref) => active.has(ref));
            const ticks = Math.min(12, Math.max(phase.citedSourceCount, phase.sessions.length));
            return (
              <article className={matches ? "" : "is-dimmed"} key={phase.phase} data-phase={phase.phase}>
                <header><span>{String(phase.index).padStart(2, "0")}</span><strong>{phaseLabels[phase.phase]}</strong><small>{phase.phase === "discover" ? "How it started" : phase.phase === "decide" ? "What you chose" : "How it landed"}</small></header>
                <h3>{phase.headline}</h3>
                <p>{phase.summary}</p>
                {phase.moments.length ? <ol>{phase.moments.map((moment, momentIndex) => <li key={moment.id}><button type="button" onClick={() => onSelectRefs(moment.sourceRefs)}><b>{String.fromCharCode(65 + momentIndex)}</b><span><small>{moment.kind}</small><strong>{moment.title}</strong></span></button></li>)}</ol> : null}
                {phase.milestones.length ? <div className="build-journey__milestones">{phase.milestones.map((milestone) => <span key={milestone.id}><i /><time>{milestone.date}</time><strong>{milestone.title}</strong></span>)}</div> : null}
                {ticks > 0 ? <div className="build-journey__sessions"><span>{phase.citedSourceCount || phase.sessions.length} cited source{(phase.citedSourceCount || phase.sessions.length) === 1 ? "" : "s"}</span>{Array.from({ length: ticks }, (_, index) => <i key={index} />)}</div> : null}
                <footer><span>{phaseLabels[phase.phase].toUpperCase()}</span><b>{phase.index}</b></footer>
              </article>
            );
          })}
        </div>
      </div>
    </ReportFigure>
  );
}
