"use client";

import { useEffect, useMemo, useState } from "react";
import type { BuildEvent, EventSpine, ReportStoryPack } from "@/lib/ingestion/scanner-project-snapshot";
import type { ReportIntelligence } from "@/lib/narrative/v4";

type SearchItem = { id: string; title: string; body: string; sourceRefs: string[]; kind: string; searchTerms: string[]; eventIds: string[] };

const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function sourceSessions(pack: ReportStoryPack, sourceRefs: string[]) {
  const refs = new Set(sourceRefs);
  return new Set(pack.sources.filter((source) => refs.has(source.ref)).map((source) => source.sessionRef).filter(Boolean));
}

function eventsForSources(spine: EventSpine, pack: ReportStoryPack, sourceRefs: string[]) {
  const sessions = sourceSessions(pack, sourceRefs);
  const evidence = new Set(pack.sources.filter((source) => sourceRefs.includes(source.ref)).flatMap((source) => source.evidenceRefs));
  return spine.events.filter((event) =>
    (event.sessionRef && sessions.has(event.sessionRef)) || event.sourceRefs.some((ref) => evidence.has(ref)),
  );
}

function searchable(pack: ReportStoryPack): SearchItem[] {
  const items: SearchItem[] = [];
  const add = (item: Omit<SearchItem, "searchTerms" | "eventIds">) => items.push({ ...item, searchTerms: `${item.kind} ${item.title} ${item.body}`.toLocaleLowerCase("en-US").match(/[a-z0-9]{3,}/g) ?? [], eventIds: [] });
  pack.moments.forEach((item, index) => add({ id: `moment-${index}`, title: item.title, body: `${item.whatHappened} ${item.whyItMattered}`, sourceRefs: item.sourceRefs, kind: "Moment" }));
  pack.decisions.forEach((item, index) => add({ id: `decision-${index}`, title: item.title, body: `${item.rationale} ${item.outcome}`, sourceRefs: item.sourceRefs, kind: "Decision" }));
  pack.learnings.forEach((item, index) => add({ id: `learning-${index}`, title: item.title, body: item.detail, sourceRefs: item.sourceRefs, kind: "Learning" }));
  if (pack.version === "3.0.0" && pack.deepAnalysis) {
    pack.deepAnalysis.whereItGotHard.forEach((item, index) => add({ id: `friction-${index}`, title: item.title, body: item.summary, sourceRefs: item.sourceRefs, kind: "Friction" }));
    pack.deepAnalysis.chapterChanges.forEach((item, index) => add({ id: `change-${index}`, title: item.title, body: item.summary, sourceRefs: item.sourceRefs, kind: "Chapter change" }));
  }
  return items;
}

function answerQuery(query: string, items: SearchItem[]) {
  const aliases: Record<string, string[]> = { why: ["rationale", "decision"], abandon: ["delete", "remove", "change"], architecture: ["system", "strategy", "decision"], bug: ["failure", "friction", "repair"], hard: ["failure", "friction", "conflict"], changed: ["change", "delete", "decision"], verify: ["verification", "test", "fixture", "smoke"] };
  const rawTerms = query.toLocaleLowerCase("en-US").match(/[a-z0-9]{3,}/g) ?? [];
  const terms = [...new Set(rawTerms.flatMap((term) => [term, ...(aliases[term] ?? [])]))];
  if (!terms.length) return [];
  return items.map((item) => {
    const title = item.title.toLocaleLowerCase("en-US");
    const body = item.body.toLocaleLowerCase("en-US");
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 0) + (body.includes(term) ? 2 : 0) + (item.searchTerms.some((candidate) => candidate.includes(term) || term.includes(candidate)) ? 3 : 0), 0);
    return { item, score };
  }).filter((result) => result.score > 0).sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id)).slice(0, 3);
}

function fingerprintPoint(event: BuildEvent, index: number, count: number) {
  const seed = [...event.eventId].reduce((sum, value) => (sum * 31 + value.charCodeAt(0)) >>> 0, 17);
  const angle = (Math.PI * 2 * index) / Math.max(1, count) - Math.PI / 2;
  const radius = 38 + (seed % 34) + Math.min(18, event.magnitude);
  return { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius };
}

export function BuildIntelligence({ spine, pack, intelligence }: { spine: EventSpine; pack: ReportStoryPack | null; intelligence?: ReportIntelligence | null }) {
  const [selectedId, setSelectedId] = useState<string>(spine.events[0]?.eventId ?? "");
  const [query, setQuery] = useState("");
  const [pinnedPatternIds, setPinnedPatternIds] = useState<string[]>([]);
  const [pinsHydrated, setPinsHydrated] = useState(false);
  const pinStorageKey = `buildstory:field-notes:${intelligence?.constellation.seed ?? spine.generatedAt}`;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(pinStorageKey);
        if (stored) setPinnedPatternIds(JSON.parse(stored) as string[]);
      } catch { /* Private convenience state is optional. */ }
      setPinsHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pinStorageKey]);
  useEffect(() => {
    if (!pinsHydrated) return;
    try { localStorage.setItem(pinStorageKey, JSON.stringify(pinnedPatternIds)); } catch { /* Storage may be disabled. */ }
  }, [pinStorageKey, pinnedPatternIds, pinsHydrated]);
  const items = useMemo<SearchItem[]>(() => intelligence?.searchIndex.length
    ? intelligence.searchIndex.map((item) => ({ id: item.documentId, title: item.title, body: item.body, sourceRefs: item.sourceRefs, kind: item.kind.replaceAll("-", " "), searchTerms: item.searchTerms, eventIds: item.eventIds }))
    : pack ? searchable(pack) : [], [intelligence, pack]);
  const answers = useMemo(() => answerQuery(query, items), [query, items]);
  const selected = spine.events.find((event) => event.eventId === selectedId) ?? spine.events[0];
  const points = intelligence?.constellation.nodes.length
    ? intelligence.constellation.nodes
    : spine.events.map((event, index) => ({ ...fingerprintPoint(event, index, spine.events.length), eventId: event.eventId, radius: 2.5, phase: event.phase }));
  const path = intelligence?.constellation.path ?? (points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ") + (points.length > 2 ? " Z" : ""));
  const patterns = intelligence?.patterns.length
    ? intelligence.patterns.map((item) => ({ ...item, observations: item.observationCount }))
    : pack ? [...pack.standoutTraits, ...pack.learnings].map((item, index) => ({ ...item, patternId: `legacy-${index}`, confidence: "medium" as const, observations: sourceSessions(pack, item.sourceRefs).size, sessionRefs: [...sourceSessions(pack, item.sourceRefs)].filter((value): value is string => typeof value === "string"), associatedOutcomes: [] as string[] })).filter((item) => item.observations >= 2) : [];
  const verifiedSessions = new Set(spine.events.filter((event) => event.kind === "verification").map((event) => event.sessionRef).filter(Boolean)).size;
  const changedSessions = new Set(spine.events.filter((event) => event.kind === "mutation").map((event) => event.sessionRef).filter(Boolean)).size;
  const switchedSessions = new Set(spine.events.filter((event) => event.kind === "model-shift").map((event) => event.sessionRef).filter(Boolean)).size;
  const atlasNodes = intelligence?.decisionAtlas.nodes;
  const decisionsForAtlas = atlasNodes?.length
    ? atlasNodes
    : (pack?.decisions ?? []).map((decision) => ({
        ...decision,
        eventIds: eventsForSources(spine, pack!, decision.sourceRefs).map((event) => event.eventId),
        confidence: null,
        chapterValid: null,
      }));
  const exportPatterns = (format: "markdown" | "agents") => {
    if (!patterns.length) return;
    const heading = format === "agents" ? "# Evidence-backed working patterns\n\nUse these as context, not mandatory rules." : "# Buildstory Field Notes";
    const body = patterns.map((item) => `- **${item.title}** — ${item.detail} (${item.observations} independent sessions)`).join("\n");
    void navigator.clipboard?.writeText(`${heading}\n\n${body}\n`);
  };
  const downloadPatterns = () => {
    const selectedPatterns = pinnedPatternIds.length ? patterns.filter((item) => pinnedPatternIds.includes(item.patternId)) : patterns;
    if (!selectedPatterns.length) return;
    const body = selectedPatterns.map((item) => `- **${item.title}** — ${item.detail} (${item.observations} independent sessions; ${item.confidence} confidence)`).join("\n");
    const url = URL.createObjectURL(new Blob([`# Buildstory Field Notes\n\n${body}\n`], { type: "text/markdown" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "buildstory-field-notes.md"; anchor.click(); URL.revokeObjectURL(url);
  };
  const exportConstellation = () => {
    const circles = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${point.radius}" data-phase="${point.phase}"/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><style>circle{fill:#3156d8}circle[data-phase='decide']{fill:#a26921}circle[data-phase='deliver']{fill:#20835d}path{fill:none;stroke:#171717}</style><path d="${path}"/>${circles}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `build-constellation-${intelligence?.constellation.seed ?? "report"}.svg`; anchor.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="build-intelligence" aria-labelledby="build-intelligence-title">
      <header className="build-intelligence__header">
        <div>
          <span>PRIVATE BUILD INTELLIGENCE · EVENT SPINE {spine.version}</span>
          <h2 id="build-intelligence-title">Replay the build, then ask why.</h2>
          <p>{spine.coverage.events} content-free events across {spine.coverage.sessions} sessions. Every connection resolves to retained evidence.</p>
        </div>
        <span className="build-intelligence__privacy">● METADATA ONLY</span>
      </header>

      {intelligence ? <aside className="build-intelligence__quality" aria-label="Report V4 quality receipt">
        <div><span>REPORT ENGINE</span><strong>V{intelligence.reportMap.version}</strong><small>{intelligence.pipelineMode === "on" ? "serving" : "dark evaluation"}</small></div>
        <div><span>COMPLEXITY</span><strong>{intelligence.reportMap.policy.complexityScore}</strong><small>{intelligence.reportMap.policy.complexityBand} / {intelligence.reportMap.policy.reasoningEffort} reasoning</small></div>
        <div><span>CITATION COVERAGE</span><strong>{intelligence.claimVerification.citationCoverage}%</strong><small>{intelligence.claimVerification.claimCount} claims checked</small></div>
        <div><span>VERIFICATION</span><strong data-status={intelligence.claimVerification.status}>{intelligence.claimVerification.status.toUpperCase()}</strong><small>{intelligence.claimVerification.issues.length} flagged checks</small></div>
      </aside> : null}

      <div className="build-intelligence__grid">
        <div className="build-replay">
          <div className="build-intelligence__label"><span>01</span> BUILD REPLAY</div>
          <div className="build-replay__track" aria-label="Build events">
            {spine.events.map((event) => (
              <button key={event.eventId} type="button" className={event.eventId === selected?.eventId ? "is-selected" : ""} onClick={() => setSelectedId(event.eventId)} aria-pressed={event.eventId === selected?.eventId}>
                <i data-phase={event.phase} />
                <span>{shortDate.format(new Date(event.occurredAt))}</span>
                <strong>{event.label}</strong>
              </button>
            ))}
          </div>
          {selected ? <article className="build-replay__selection" aria-live="polite">
            <span>{selected.phase.toUpperCase()} · {selected.kind.replaceAll("-", " ")}</span>
            <h3>{selected.label}</h3>
            <p>{selected.magnitude} {selected.measurement.replaceAll("-", " ")} · {selected.sourceRefs.length} evidence reference{selected.sourceRefs.length === 1 ? "" : "s"} · {selected.provider ?? "project"}{selected.temporalPrecision === "estimated" ? " · estimated placement" : ""}</p>
            <code>{selected.eventId}</code>
          </article> : null}
        </div>

        <figure className="build-constellation">
          <figcaption><div className="build-intelligence__label"><span>02</span> BUILD CONSTELLATION</div><p>A deterministic fingerprint of rhythm, phase, and intensity.</p></figcaption>
          <svg viewBox="0 0 200 200" role="img" aria-label={`Constellation generated from ${spine.events.length} build events`}>
            <circle cx="100" cy="100" r="72" className="build-constellation__orbit" />
            <circle cx="100" cy="100" r="48" className="build-constellation__orbit" />
            {path ? <path d={path} className="build-constellation__path" /> : null}
            {points.map((point) => <circle key={point.eventId} cx={point.x} cy={point.y} r={point.eventId === selected?.eventId ? 4.5 : point.radius} className={`build-constellation__point build-constellation__point--${point.phase}`} />)}
          </svg>
          <button className="build-constellation__export" type="button" onClick={exportConstellation}>Download SVG fingerprint</button>
        </figure>
      </div>

      {pack ? <div className="build-intelligence__lower">
        <section className="decision-atlas">
          <div className="build-intelligence__label"><span>03</span> DECISION ATLAS</div>
          <div className="decision-atlas__path">
            {decisionsForAtlas.map((decision, index) => {
              const linked = spine.events.filter((event) => decision.eventIds.includes(event.eventId));
              return <article key={`${decision.title}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}{decision.confidence ? ` / ${decision.confidence.toUpperCase()} CONFIDENCE` : ""}</span><h3>{decision.title}</h3><p>{decision.rationale}</p><small>{linked.length} replay moment{linked.length === 1 ? "" : "s"} · {decision.sourceRefs.length} cited source{decision.sourceRefs.length === 1 ? "" : "s"}{decision.chapterValid !== null ? ` · ${decision.chapterValid ? "chapter-valid" : "invalid"}` : ""}</small>
                {linked[0] ? <button type="button" onClick={() => setSelectedId(linked[0]!.eventId)}>Why? Open replay →</button> : null}
              </article>;
            })}
          </div>
        </section>

        <section className="ask-build">
          <div className="build-intelligence__label"><span>04</span> ASK YOUR BUILD</div>
          <label htmlFor="ask-build-query">Search the reviewed report, with exact citations</label>
          <div className="ask-build__input"><input id="ask-build-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Why did this build change direction?" /><span>⌘ K</span></div>
          <div className="ask-build__prompts">
            {["Where did it get hard?", "What changed?", "Which decisions mattered?"].map((prompt) => <button key={prompt} type="button" onClick={() => setQuery(prompt)}>{prompt}</button>)}
          </div>
          {query ? <div className="ask-build__answers" aria-live="polite">
            {answers.length ? answers.map(({ item }) => <article key={item.id}><span>{item.kind}</span><h3>{item.title}</h3><p>{item.body}</p><small>{item.sourceRefs.join(" · ")}</small>{item.eventIds[0] ? <button type="button" onClick={() => setSelectedId(item.eventIds[0]!)}>Open cited Replay moment →</button> : null}</article>) : <p>No cited report claim matches that question yet. Buildstory will not invent an answer.</p>}
          </div> : <p className="ask-build__empty">Answers are retrieved only from this report’s reviewed claims. No general advice, no uncited guesswork.</p>}
        </section>
      </div> : null}

      <div className="build-intelligence__ledger">
        <section className="pattern-ledger">
          <div className="build-intelligence__label"><span>05</span> PATTERN LEDGER</div>
          <header><h3>Reusable field notes</h3><p>Shown only after the same evidence-backed pattern spans multiple independent sessions.</p></header>
          {patterns.length ? <div className="pattern-ledger__items">{patterns.map((item) => <article key={item.patternId} className={pinnedPatternIds.includes(item.patternId) ? "is-pinned" : ""}><span>{item.observations} OBSERVATIONS · {item.confidence.toUpperCase()}</span><h4>{item.title}</h4><p>{item.detail}</p>{item.associatedOutcomes.length ? <small>Associated with: {item.associatedOutcomes.join(" · ")}</small> : null}<button type="button" onClick={() => setPinnedPatternIds((current) => current.includes(item.patternId) ? current.filter((id) => id !== item.patternId) : [...current, item.patternId])}>{pinnedPatternIds.includes(item.patternId) ? "Pinned" : "Pin to Field Notes"}</button></article>)}</div> : <p className="pattern-ledger__empty">No recurring pattern has crossed the multi-session threshold yet.</p>}
          <div className="pattern-ledger__actions"><button type="button" disabled={!patterns.length} onClick={() => exportPatterns("markdown")}>Copy Markdown</button><button type="button" disabled={!patterns.length} onClick={() => exportPatterns("agents")}>Copy AGENTS.md fragment</button><button type="button" disabled={!patterns.length} onClick={downloadPatterns}>Download {pinnedPatternIds.length ? `${pinnedPatternIds.length} pinned` : "all"}</button></div>
        </section>
        <section className="outcome-lab">
          <div className="build-intelligence__label"><span>06</span> OUTCOME & TOOL LAB</div>
          <header><h3>Observed associations</h3><p>Descriptive only. These figures do not claim productivity or causation.</p></header>
          <div className="outcome-lab__metrics">{intelligence?.outcomeLab.metrics.length ? intelligence.outcomeLab.metrics.map((metric) => <div key={metric.metricId}><strong>{metric.value}{metric.unit === "percent" ? "%" : ""}</strong><span>{metric.label}</span><small>{metric.detail}</small></div>) : <><div><strong>{verifiedSessions}</strong><span>sessions with verification</span><small>after {changedSessions} mutation-bearing sessions</small></div><div><strong>{switchedSessions}</strong><span>sessions with model shifts</span><small>context changes, not quality scores</small></div><div><strong>{(spine.events.length / Math.max(1, spine.coverage.sessions)).toFixed(1)}</strong><span>events per session</span><small>metadata density across the window</small></div></>}</div>
          {intelligence?.outcomeLab.modelRoles.length ? <div className="outcome-lab__models"><span>MODEL ROLES BY SESSION PHASE</span>{intelligence.outcomeLab.modelRoles.map((model) => <p key={model.modelRef}><strong>{model.modelRef}</strong><small>{model.discoverySessions} discover · {model.decisionSessions} decide · {model.deliverySessions} deliver</small></p>)}</div> : null}
        </section>
      </div>
    </section>
  );
}
