"use client";

import { useMemo, useState } from "react";
import type { ReportIntelligence } from "@/lib/narrative/v4";
import type { ReportInsightsViewModel } from "@/lib/report/report-insights-view-model";
import { OutcomeSmallMultiples } from "./outcome-small-multiples";
import { SessionShape } from "./session-shape";

export function PrivateInsightLab({ model, intelligence, showSessions, showOutcomes }: { model: ReportInsightsViewModel; intelligence: ReportIntelligence | null | undefined; showSessions: boolean; showOutcomes: boolean }) {
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<string[]>([]);
  const terms = useMemo(() => query.toLocaleLowerCase("en-US").match(/[a-z0-9]{3,}/g) ?? [], [query]);
  const answers = useMemo(() => {
    if (!terms.length) return [];
    return (intelligence?.searchIndex ?? []).map((item) => ({ item, score: terms.reduce((sum, term) => sum + (item.title.toLowerCase().includes(term) ? 4 : 0) + (item.body.toLowerCase().includes(term) ? 2 : 0), 0) })).filter((result) => result.score > 0).sort((left, right) => right.score - left.score).slice(0, 3);
  }, [intelligence?.searchIndex, terms]);
  if (!showSessions && !showOutcomes && !intelligence?.patterns.length && !intelligence?.searchIndex.length) return null;
  return (
    <section className="private-insight-lab" aria-labelledby="private-insight-lab-title">
      <header><span>PRIVATE INSIGHT LAB</span><h2 id="private-insight-lab-title">Patterns that do not belong on the public receipt.</h2><p>Distribution and event associations stay private unless a future projection explicitly publishes them.</p></header>
      {showSessions ? <SessionShape series={model.sessionShape} /> : null}
      {showOutcomes ? <OutcomeSmallMultiples outcomes={model.outcomes} /> : null}
      {intelligence?.searchIndex.length ? <section className="ask-build"><div className="build-intelligence__label"><span>06</span> ASK YOUR BUILD</div><label htmlFor="ask-build-insight-query">Search reviewed report claims with exact citations</label><input id="ask-build-insight-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Why did this build change direction?" />{query ? <div className="ask-build__answers" aria-live="polite">{answers.length ? answers.map(({ item }) => <article key={item.documentId}><span>{item.kind.replaceAll("-", " ")}</span><h3>{item.title}</h3><p>{item.body}</p><small>{item.sourceRefs.join(" · ")}</small></article>) : <p>No cited report claim matches that question. Buildstory will not invent an answer.</p>}</div> : <p className="ask-build__empty">Answers are retrieved only from this report’s reviewed claims.</p>}</section> : null}
      {intelligence?.patterns.length ? <section className="pattern-ledger"><div className="build-intelligence__label"><span>07</span> PATTERN LEDGER</div><header><h3>Reusable field notes</h3><p>Only patterns observed across multiple independent sessions or chapters appear here.</p></header><div className="pattern-ledger__items">{intelligence.patterns.map((pattern) => <article key={pattern.patternId} className={pinned.includes(pattern.patternId) ? "is-pinned" : ""}><span>{pattern.observationCount} OBSERVATIONS · {pattern.confidence.toUpperCase()}</span><h4>{pattern.title}</h4><p>{pattern.detail}</p><button type="button" onClick={() => setPinned((current) => current.includes(pattern.patternId) ? current.filter((id) => id !== pattern.patternId) : [...current, pattern.patternId])}>{pinned.includes(pattern.patternId) ? "Pinned" : "Pin to field notes"}</button></article>)}</div></section> : null}
    </section>
  );
}
