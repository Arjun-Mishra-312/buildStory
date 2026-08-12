"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReportInsightsViewModel } from "@/lib/report/report-insights-view-model";
import { BuildJourney } from "./build-journey";
import { DecisionDossier } from "./decision-dossier";
import { ReportSection } from "@/components/studio/report-section";

const providerLabel: Record<string, string> = { codex: "Codex", "claude-code": "Claude Code", cursor: "Cursor", "gemini-antigravity": "Gemini", git: "Git" };

export function ReportInsightStory({
  model,
  reviewedEvidence = [],
  controls,
}: {
  model: ReportInsightsViewModel;
  reviewedEvidence?: Array<{ excerptId: string; sessionRef: string; occurredAt: string; role: string; text: string }>;
  controls?: {
    journey: { hidden: boolean; open: boolean; onOpenChange: (open: boolean) => void };
    dossier: { hidden: boolean };
  };
}) {
  const [activeRefs, setActiveRefs] = useState<string[]>([]);
  const activeSet = useMemo(() => new Set(activeRefs), [activeRefs]);
  const matchingClaims = model.claims.filter((claim) => claim.sourceRefs.some((ref) => activeSet.has(ref)));
  const matchingSources = model.sourceGroups.flatMap((group) => group.sourceRefs.filter((ref) => activeSet.has(ref)).map((ref) => ({ ref, provider: group.id })));

  useEffect(() => {
    if (!activeRefs.length) return undefined;
    const clear = (event: KeyboardEvent) => { if (event.key === "Escape") setActiveRefs([]); };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, [activeRefs.length]);

  const selectRefs = (refs: string[]) => setActiveRefs((current) => {
    const next = [...new Set(refs)];
    return current.length === next.length && current.every((ref) => next.includes(ref)) ? [] : next;
  });
  const journey = <BuildJourney phases={model.journey} activeRefs={activeRefs} onSelectRefs={selectRefs} />;
  const dossier = <DecisionDossier items={model.dossier} turningPoint={model.turningPoint} activeRefs={activeRefs} onSelectRefs={selectRefs} />;

  return (
    <div className={`report-insight-story ${activeRefs.length ? "has-evidence-lens" : ""}`}>
      {controls ? !controls.journey.hidden ? <ReportSection id="narrativeArc" label="BUILD JOURNEY" meta="Arc, moments, milestones" open={controls.journey.open} onOpenChange={controls.journey.onOpenChange}>{journey}</ReportSection> : null : journey}
      {controls ? !controls.dossier.hidden ? dossier : null : dossier}
      {activeRefs.length ? (
        <aside className="evidence-lens" aria-live="polite" aria-label="Evidence lens">
          <header><div><span>EVIDENCE LENS</span><strong>{matchingClaims.length} claim{matchingClaims.length === 1 ? "" : "s"} · {activeRefs.length} reference{activeRefs.length === 1 ? "" : "s"}</strong></div><button type="button" onClick={() => setActiveRefs([])}>Clear lens ×</button></header>
          <div className="evidence-lens__grid">
            <section><span>SELECTED SOURCES</span>{matchingSources.map((source) => <p key={source.ref}><strong>{providerLabel[source.provider] ?? source.provider}</strong><code>{source.ref}</code></p>)}</section>
            <section><span>SUPPORTED CLAIMS</span>{matchingClaims.map((claim) => <article key={claim.id}><small>{claim.kind}</small><strong>{claim.title}</strong><p>{claim.body}</p></article>)}</section>
            {model.surface === "private" && reviewedEvidence.length ? <section><span>REVIEWED EXCERPTS</span>{reviewedEvidence.slice(0, 3).map((excerpt) => <blockquote key={excerpt.excerptId}>{excerpt.text}</blockquote>)}</section> : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
