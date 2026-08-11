"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ReportStoryPack, StoryPackFinding } from "@/lib/ingestion/scanner-project-snapshot";
import { mergeDeepIntoPack } from "@/lib/narrative/dedupe";
import type { ReportSectionKey } from "@/lib/studio/report-layout-prefs";
import { ReportSection } from "./report-section";

const sourceDateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

function providerName(provider: string): string {
  if (provider === "claude-code") return "Claude Code";
  if (provider === "gemini-antigravity") return "Gemini Antigravity";
  if (provider === "cursor") return "Cursor";
  if (provider === "git") return "Git";
  return "Codex";
}

function StorySourceBadge({ source, privateView, onOpen }: { source: ReportStoryPack["sources"][number]; privateView: boolean; onOpen: (ref: string) => void }) {
  const label = `${providerName(source.provider)} · ${sourceDateFormat.format(new Date(source.occurredAt))}`;
  return privateView ? (
    <button className="story-pack__source" type="button" onClick={() => onOpen(source.ref)} title="Open evidence metadata">
      {label} · {source.evidenceRefs.length} evidence
    </button>
  ) : <span className="story-pack__source">{label}</span>;
}

/** Private reports get collapsible narrative chrome; public stories keep the editorial layout unchanged. */
function NarrativeSection({
  privateView,
  id,
  label,
  meta,
  open,
  onOpenChange,
  style,
  legacyClassName,
  legacyAriaLabel,
  children,
}: {
  privateView: boolean;
  id: ReportSectionKey;
  label: string;
  meta: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  style?: CSSProperties;
  legacyClassName: string;
  legacyAriaLabel?: string;
  children: ReactNode;
}) {
  if (!privateView) {
    return (
      <section className={legacyClassName} aria-label={legacyAriaLabel}>
        <header><span>{label}</span><strong>{meta}</strong></header>
        {children}
      </section>
    );
  }
  return (
    <ReportSection id={id} label={label} meta={meta} open={open} onOpenChange={onOpenChange} style={style}>
      {children}
    </ReportSection>
  );
}

type StoryPackLayout = {
  isOpen: (key: ReportSectionKey) => boolean;
  isHidden: (key: ReportSectionKey) => boolean;
  setOpen: (key: ReportSectionKey, open: boolean) => void;
  order?: (key: ReportSectionKey, fallback: number) => number;
};

type RenderMoment = ReportStoryPack["moments"][number] & {
  confidence?: StoryPackFinding["confidence"];
};

type RenderTrait = {
  title: string;
  detail: string;
  sourceRefs: string[];
  confidence?: StoryPackFinding["confidence"];
};

export function StoryPackView({
  pack,
  privateView,
  reviewedEvidence = [],
  fallbacksUsed = [],
  layout,
  hasLivePreviewDelta = false,
}: {
  pack: ReportStoryPack;
  privateView: boolean;
  reviewedEvidence?: Array<{ excerptId: string; sessionRef: string; occurredAt: string; role: string; text: string }>;
  fallbacksUsed?: string[];
  layout?: StoryPackLayout;
  hasLivePreviewDelta?: boolean;
}) {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [momentsShowAll, setMomentsShowAll] = useState(false);
  const MOMENTS_PREVIEW_COUNT = 4;
  const sourceByRef = new Map(pack.sources.map((source) => [source.ref, source]));
  const sourceCoverage = [...new Map(pack.sources.map((source) => [source.provider, pack.sources.filter((item) => item.provider === source.provider).length])).entries()];
  const deep = pack.version === "3.0.0" ? pack.deepAnalysis : undefined;
  const merged = privateView ? mergeDeepIntoPack(pack, { hasLivePreviewDelta }) : null;
  const deepGroups = deep ? [
    ["SIGNATURE MOVES", deep.signatureMoves ?? []],
    ["WHERE IT GOT HARD", deep.whereItGotHard ?? []],
    ["WHAT CHANGED", deep.chapterChanges ?? []],
  ] as const : [];
  const signalById = new Map(pack.signals.map((signal) => [signal.id, signal]));
  const framedSignalIds = new Set((deep?.byTheNumbers ?? []).map((item) => item.signalId));
  const unframedSignals = pack.signals.filter((signal) => !framedSignalIds.has(signal.id));
  const moments: RenderMoment[] = privateView && merged
    ? [
        ...pack.moments,
        ...merged.extraBreakthroughs.map((finding) => ({
          phase: "deliver" as const,
          kind: "breakthrough" as const,
          title: finding.title,
          whatHappened: finding.summary,
          whyItMattered: "A friction point surfaced in the Deep analysis.",
          sourceRefs: finding.sourceRefs,
          confidence: finding.confidence,
        })),
      ]
    : pack.moments;
  const standoutTraits: RenderTrait[] = privateView && merged?.standoutTraits.length
    ? merged.standoutTraits
    : pack.standoutTraits;
  const hasChapterChanges = Boolean(privateView && merged?.chapterChanges.length);
  const hasSignalsSection = pack.signals.length > 0 || hasChapterChanges;
  const sectionIsHidden = (key: ReportSectionKey) => privateView && Boolean(layout?.isHidden(key));
  const sectionIsOpen = (key: ReportSectionKey, defaultOpen: boolean) => privateView ? (layout?.isOpen(key) ?? defaultOpen) : true;
  const setSectionOpen = (key: ReportSectionKey) => (open: boolean) => {
    if (privateView) layout?.setOpen(key, open);
  };
  const sectionStyle = (key: ReportSectionKey, fallback: number): CSSProperties | undefined => {
    if (!privateView || !layout?.order) return undefined;
    return { order: layout.order(key, fallback) };
  };
  const selected = openRef ? sourceByRef.get(openRef) : null;
  const excerpts = selected?.excerptRef
    ? reviewedEvidence.filter((excerpt) => excerpt.sessionRef === selected.sessionRef || excerpt.excerptId === selected.excerptRef)
    : [];
  const openEvidence = (ref: string) => setOpenRef(ref);

  useEffect(() => {
    if (!openRef) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenRef(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openRef]);

  const insightCards = (
    <>
      {pack.turningPoint.quote ? (
        <section className="story-pack__insight-card story-pack__insight-card--turning"><span>TURNING POINT</span><blockquote>“{pack.turningPoint.quote}”</blockquote><div className="story-pack__sources">{pack.turningPoint.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div></section>
      ) : null}
      {pack.decisions.length ? (
        <section className="story-pack__insight-card"><span>DECISIONS</span>{pack.decisions.map((item, index) => <div className="story-pack__decision" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.rationale}</p><small>{item.outcome}</small></div>)}</section>
      ) : null}
      {pack.learnings.length ? (
        <section className="story-pack__insight-card"><span>LEARNINGS</span>{pack.learnings.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p></div>)}</section>
      ) : null}
      {standoutTraits.length ? (
        <section className="story-pack__insight-card"><span>STANDOUT TRAITS</span>{standoutTraits.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p>{item.confidence ? <small>{item.confidence.toUpperCase()} CONFIDENCE</small> : null}{privateView ? <div className="story-pack__sources">{item.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView onOpen={openEvidence} /> : null; })}</div> : null}</div>)}</section>
      ) : null}
      {pack.growthEdge.title ? (
        <section className="story-pack__insight-card story-pack__insight-card--growth"><span>GROWTH EDGE</span><h3>{pack.growthEdge.title}</h3><p>{pack.growthEdge.observation}</p></section>
      ) : null}
    </>
  );

  return (
    <div className={`story-pack ${privateView ? "story-pack--private" : "story-pack--public"}`}>
      <div className={`story-pack__status ${fallbacksUsed?.length ? "story-pack__status--fallback" : ""}`} role="status">
        <span>{fallbacksUsed?.length ? "METRIC-DERIVED FALLBACK" : "MODEL-WRITTEN"}</span>
        <small>{fallbacksUsed?.length ? `${fallbacksUsed.length} component${fallbacksUsed.length === 1 ? "" : "s"} replaced after validation.` : "Every card is linked to validated source metadata."}</small>
      </div>
      <section className="story-pack__coverage" aria-label="Source coverage">
        <span>SOURCE COVERAGE</span>
        <div>{sourceCoverage.length ? sourceCoverage.map(([provider, count]) => <span key={provider}>{providerName(provider)} · {count} source{count === 1 ? "" : "s"}</span>) : <span>No provider sessions matched this report.</span>}</div>
      </section>
      <section className="story-pack__hero">
        <span className="story-section__label">AI-WRITTEN BUILD STORY</span>
        {privateView && merged?.openingLineKicker ? <span className="story-pack__hero-kicker">DEEP SIGNAL · {merged.openingLineKicker.title}</span> : null}
        <h2>{pack.hero.headline}</h2>
        <p>{pack.hero.summary}</p>
      </section>

      <div className="story-pack__sections">

      {pack.buildArc.length && !sectionIsHidden("narrativeArc") ? (
        <NarrativeSection
          privateView={privateView}
          id="narrativeArc"
          label="BUILD ARC"
          meta={privateView ? "Evidence-linked phases" : "How the build moved"}
          open={sectionIsOpen("narrativeArc", true)}
          onOpenChange={setSectionOpen("narrativeArc")}
          style={sectionStyle("narrativeArc", 0)}
          legacyClassName="story-pack__arc"
          legacyAriaLabel="Build arc"
        >
          <div className="story-pack__arc-grid">
            {pack.buildArc.map((phase, index) => (
              <article key={phase.phase} className="story-pack__arc-card">
                <span className="story-pack__phase-number">0{index + 1}</span>
                <small>{phase.phase.toUpperCase()}</small>
                <h3>{phase.headline}</h3>
                <p>{phase.summary}</p>
                <div className="story-pack__sources">{phase.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
              </article>
            ))}
          </div>
        </NarrativeSection>
      ) : null}

      {moments.length && !sectionIsHidden("narrativeMoments") ? (
        <NarrativeSection
          privateView={privateView}
          id="narrativeMoments"
          label="MOMENTS THAT CHANGED THE BUILD"
          meta={`${moments.length} evidence-backed moments`}
          open={sectionIsOpen("narrativeMoments", true)}
          onOpenChange={setSectionOpen("narrativeMoments")}
          style={sectionStyle("narrativeMoments", 1)}
          legacyClassName="story-pack__moments"
        >
          <div className="story-pack__moment-grid">
            {(privateView && !momentsShowAll ? moments.slice(0, MOMENTS_PREVIEW_COUNT) : moments).map((moment, index) => (
              <article className="story-pack__moment-card" key={`${moment.title}-${index}`}>
                <div className="story-pack__moment-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <small>{moment.kind.toUpperCase()} · {moment.phase.toUpperCase()}</small>
                  <h3>{moment.title}</h3>
                  <div className="story-pack__moment-copy"><p><strong>What happened</strong>{moment.whatHappened}</p><p><strong>Why it mattered</strong>{moment.whyItMattered}</p></div>
                  {moment.confidence ? <small>{moment.confidence.toUpperCase()} CONFIDENCE</small> : null}
                  <div className="story-pack__sources">{moment.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
                </div>
              </article>
            ))}
          </div>
          {privateView && moments.length > MOMENTS_PREVIEW_COUNT ? (
            <button type="button" className="button button--text story-pack__show-more" onClick={() => setMomentsShowAll((value) => !value)}>
              {momentsShowAll ? "Show fewer moments" : `Show all ${moments.length} moments`}
            </button>
          ) : null}
        </NarrativeSection>
      ) : null}

      {(pack.turningPoint.quote || pack.decisions.length || pack.learnings.length || standoutTraits.length || pack.growthEdge.title) && !sectionIsHidden("narrativeInsights") ? (
        privateView ? (
          <ReportSection
            id="narrativeInsights"
            label="INSIGHTS"
            meta="Turning point, decisions, learnings, traits"
            open={sectionIsOpen("narrativeInsights", false)}
            onOpenChange={setSectionOpen("narrativeInsights")}
            style={sectionStyle("narrativeInsights", 2)}
          >
            <div className="story-pack__insight-grid">{insightCards}</div>
          </ReportSection>
        ) : (
          <div className="story-pack__insight-grid">{insightCards}</div>
        )
      ) : null}

      {hasSignalsSection && !sectionIsHidden("narrativeSignals") ? (
        <NarrativeSection
          privateView={privateView}
          id="narrativeSignals"
          label="BY THE NUMBERS"
          meta={privateView && merged?.coverage
            ? `Computed facts · ${merged.coverage.sessionsSeen} sessions · ${merged.coverage.excerptsUsed} reviewed excerpts · ${merged.coverage.evidenceBytes.toLocaleString()} bytes · ${sourceDateFormat.format(new Date(merged.coverage.windowStart))}–${sourceDateFormat.format(new Date(merged.coverage.windowEnd))}`
            : "Computed straight from the build, never model-written"}
          open={sectionIsOpen("narrativeSignals", false)}
          onOpenChange={setSectionOpen("narrativeSignals")}
          style={sectionStyle("narrativeSignals", 3)}
          legacyClassName="story-pack__moments"
          legacyAriaLabel="By the numbers"
        >
          {pack.signals.length ? (
            <div className="story-pack__moment-grid">
              {(deep?.byTheNumbers ?? []).map((finding, index) => {
                const signal = signalById.get(finding.signalId);
                if (!signal) return null;
                return (
                  <article className="story-pack__moment-card" key={`signal-${finding.signalId}-${index}`}>
                    <div className="story-pack__moment-index">{String(index + 1).padStart(2, "0")}</div>
                    <div>
                      <h3>{signal.headline}</h3>
                      <div className="story-pack__moment-copy"><p>{finding.title}</p><p>{finding.summary}</p></div>
                      <div className="story-pack__sources">{finding.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
                    </div>
                  </article>
                );
              })}
              {unframedSignals.map((signal, index) => (
                <article className="story-pack__moment-card" key={`plain-signal-${signal.id}`}>
                  <div className="story-pack__moment-index">{String((deep?.byTheNumbers.length ?? 0) + index + 1).padStart(2, "0")}</div>
                  <div>
                    <h3>{signal.headline}</h3>
                    <div className="story-pack__moment-copy"><p>{signal.detail}</p></div>
                    <div className="story-pack__sources">{signal.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {hasChapterChanges ? (
            <section className="story-pack__insight-card story-pack__chapter-changes">
              <span>WHAT CHANGED</span>
              {merged?.chapterChanges.map((finding, index) => <div className="story-pack__bullet" key={`${finding.title}-${index}`}><strong>{finding.title}</strong><p>{finding.summary}</p><small>{finding.confidence.toUpperCase()} CONFIDENCE</small></div>)}
            </section>
          ) : null}
        </NarrativeSection>
      ) : null}

      {!privateView && deep ? (
        <NarrativeSection
          privateView={false}
          id="narrativeSignals"
          label="DEEP ANALYSIS"
          meta={`${deep.coverage.sessionsSeen} sessions · ${deep.coverage.excerptsUsed} reviewed excerpts · ${deep.coverage.evidenceBytes.toLocaleString()} bytes · ${sourceDateFormat.format(new Date(deep.coverage.windowStart))}–${sourceDateFormat.format(new Date(deep.coverage.windowEnd))}`}
          open
          onOpenChange={() => undefined}
          legacyClassName="story-pack__arc"
          legacyAriaLabel="Deep analysis"
        >
          {deep.openingLine?.title ? (
            <article className="story-pack__moment-card">
              <div className="story-pack__moment-index">01</div>
              <div>
                <small>{deep.openingLine.confidence.toUpperCase()} CONFIDENCE</small>
                <h3>{deep.openingLine.title}</h3>
                <p>{deep.openingLine.summary}</p>
                <div className="story-pack__sources">{deep.openingLine.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={false} onOpen={openEvidence} /> : null; })}</div>
              </div>
            </article>
          ) : null}
          <div className="story-pack__insight-grid">
            {deepGroups.map(([label, findings]) => findings.length ? (
              <section className="story-pack__insight-card" key={label}>
                <span>{label}</span>
                {findings.map((finding, index) => (
                  <div className="story-pack__bullet" key={`${label}-${finding.title}-${index}`}>
                    <strong>{finding.title}</strong>
                    <p>{finding.summary}</p>
                    <small>{finding.confidence.toUpperCase()} CONFIDENCE</small>
                    <div className="story-pack__sources">{finding.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={false} onOpen={openEvidence} /> : null; })}</div>
                  </div>
                ))}
              </section>
            ) : null)}
          </div>
        </NarrativeSection>
      ) : null}

      </div>

      {privateView && openRef && selected ? (
        <div className="story-pack__evidence-backdrop" role="presentation" onClick={() => setOpenRef(null)}>
          <aside className="story-pack__evidence-drawer" role="dialog" aria-modal="true" aria-label="Evidence details" onClick={(event) => event.stopPropagation()}>
            <button className="button button--text" type="button" onClick={() => setOpenRef(null)}>Close</button>
            <span className="story-section__label">EVIDENCE {selected.ref}</span>
            <h3>{providerName(selected.provider)}</h3>
            <p>{new Date(selected.occurredAt).toLocaleString()} · {selected.metrics.turns} turns · {selected.metrics.toolCalls} tool calls</p>
            {excerpts.length ? excerpts.map((excerpt) => <blockquote key={excerpt.excerptId}>{excerpt.text}</blockquote>) : <p>Excerpt text is no longer available. Hosted evidence is erased after generation; this drawer retains provenance metadata only. Local and BYOK modes never upload excerpts to Buildstory.</p>}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
