"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ReportStoryPack } from "@/lib/ingestion/scanner-project-snapshot";
import type { ReportSectionKey } from "@/lib/studio/report-layout-prefs";
import { ReportSection } from "./report-section";
import type { ReportInsightsViewModel } from "@/lib/report/report-insights-view-model";
import { ReportInsightStory } from "@/components/report/report-insight-story";
import { BuildFactsRecap } from "@/components/report/build-facts-recap";
import { StoryInsightIndex, type StoryInsightItem } from "@/components/report/story-insight-index";
import { ProviderMark } from "@/components/model-mark";

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
  const inner = (
    <>
      <ProviderMark provider={source.provider} />
      {label}
    </>
  );
  return privateView ? (
    <button className="story-pack__source" type="button" onClick={() => onOpen(source.ref)} title="Open evidence metadata">
      {inner} · {source.evidenceRefs.length} evidence
    </button>
  ) : <span className="story-pack__source">{inner}</span>;
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

export function StoryPackView({
  pack,
  privateView,
  reviewedEvidence = [],
  fallbacksUsed = [],
  layout,
  evidencePlacement = "inline",
  insights,
}: {
  pack: ReportStoryPack;
  privateView: boolean;
  reviewedEvidence?: Array<{ excerptId: string; sessionRef: string; occurredAt: string; role: string; text: string }>;
  fallbacksUsed?: string[];
  layout?: StoryPackLayout;
  /** Shared Story / Evidence pages move computed facts and source coverage into the evidence rail. */
  evidencePlacement?: "inline" | "rail";
  insights?: ReportInsightsViewModel | null;
}) {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [momentsShowAll, setMomentsShowAll] = useState(false);
  const MOMENTS_PREVIEW_COUNT = 4;
  const sourceByRef = new Map(pack.sources.map((source) => [source.ref, source]));
  const sourceCoverage = [...new Map(pack.sources.map((source) => [source.provider, pack.sources.filter((item) => item.provider === source.provider).length])).entries()];
  const deep = pack.version === "3.0.0" ? pack.deepAnalysis : undefined;
  const deepGroups = deep ? [
    ["SIGNATURE MOVES", deep.signatureMoves ?? []],
    ["WHERE IT GOT HARD", deep.whereItGotHard ?? []],
    ["WHAT CHANGED", deep.chapterChanges ?? []],
  ] as const : [];
  const moments = pack.moments;
  const standoutTraits = pack.standoutTraits;
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
      {!insights && pack.turningPoint.quote ? (
        <section className="story-pack__insight-card story-pack__insight-card--turning"><div><span>TURNING POINT</span><blockquote>“{pack.turningPoint.quote}”</blockquote><div className="story-pack__sources">{pack.turningPoint.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div></div><div className="story-pack__illustration-plate" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/illustrations/story-moments/magnifying-glass-investigation.webp" alt="" loading="lazy" />
        </div></section>
      ) : null}
      {!insights && pack.decisions.length ? (
        <section className="story-pack__insight-card"><span>DECISIONS</span>{pack.decisions.map((item, index) => <div className="story-pack__decision" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.rationale}</p><small>{item.outcome}</small></div>)}</section>
      ) : null}
      {pack.learnings.length ? (
        <section className="story-pack__insight-card"><span>LEARNINGS</span>{pack.learnings.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p></div>)}</section>
      ) : null}
      {standoutTraits.length ? (
        <section className="story-pack__insight-card"><span>STANDOUT TRAITS</span>{standoutTraits.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p>{privateView ? <div className="story-pack__sources">{item.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView onOpen={openEvidence} /> : null; })}</div> : null}</div>)}</section>
      ) : null}
      {pack.growthEdge.title ? (
        <section className="story-pack__insight-card story-pack__insight-card--growth"><span>GROWTH EDGE</span><h3>{pack.growthEdge.title}</h3><p>{pack.growthEdge.observation}</p></section>
      ) : null}
    </>
  );
  const hasInsightCards = Boolean(
    (!insights && (pack.turningPoint.quote || pack.decisions.length))
      || pack.learnings.length
      || standoutTraits.length
      || pack.growthEdge.title,
  );
  const publicInsightItems: StoryInsightItem[] = [
    ...pack.learnings.map((item, index) => ({ id: `learning-${index}`, group: "Learnings", title: item.title, body: item.detail })),
    ...standoutTraits.map((item, index) => ({ id: `trait-${index}`, group: "Standout traits", title: item.title, body: item.detail })),
    ...(pack.growthEdge.title ? [{ id: "growth-edge", group: "Growth edge", title: pack.growthEdge.title, body: pack.growthEdge.observation }] : []),
    ...(deep?.signatureMoves ?? []).map((item, index) => ({ id: `signature-${index}`, group: "Signature moves", title: item.title, body: item.summary })),
    ...(deep?.whereItGotHard ?? []).map((item, index) => ({ id: `hard-${index}`, group: "Where it got hard", title: item.title, body: item.summary })),
    ...(deep?.chapterChanges ?? []).map((item, index) => ({ id: `changed-${index}`, group: "What changed", title: item.title, body: item.summary })),
  ];
  const insightStory = insights ? (
    <ReportInsightStory
      model={insights}
      reviewedEvidence={reviewedEvidence}
      controls={privateView ? {
        journey: {
          hidden: sectionIsHidden("narrativeArc") && sectionIsHidden("narrativeMoments"),
          open: !sectionIsHidden("narrativeArc") ? sectionIsOpen("narrativeArc", true) : sectionIsOpen("narrativeMoments", true),
          onOpenChange: !sectionIsHidden("narrativeArc") ? setSectionOpen("narrativeArc") : setSectionOpen("narrativeMoments"),
        },
        dossier: {
          hidden: sectionIsHidden("narrativeInsights"),
        },
      } : undefined}
    />
  ) : null;
  const factsRecap = pack.signals.length > 0 && !sectionIsHidden("narrativeSignals") ? (
    <NarrativeSection
      privateView={privateView}
      id="narrativeSignals"
      label="BY THE NUMBERS"
      meta="Cool facts computed straight from the build"
      open={sectionIsOpen("narrativeSignals", true)}
      onOpenChange={setSectionOpen("narrativeSignals")}
      style={sectionStyle("narrativeSignals", 2)}
      legacyClassName="story-pack__facts-recap"
      legacyAriaLabel="By the numbers"
    >
      <BuildFactsRecap signals={pack.signals} framing={deep?.byTheNumbers} />
    </NarrativeSection>
  ) : null;

  return (
    <div className={`story-pack ${privateView ? "story-pack--private" : "story-pack--public"}`}>
      {evidencePlacement === "inline" ? <div className={`story-pack__status ${fallbacksUsed?.length ? "story-pack__status--fallback" : ""}`} role="status">
        <span>{fallbacksUsed?.length ? "METRIC-DERIVED FALLBACK" : "MODEL-WRITTEN"}</span>
        <small>{fallbacksUsed?.length ? `${fallbacksUsed.length} component${fallbacksUsed.length === 1 ? "" : "s"} replaced after validation.` : "Every card is linked to validated source metadata."}</small>
      </div> : null}
      {evidencePlacement === "inline" ? <section className="story-pack__coverage" aria-label="Source coverage">
        <span>SOURCE COVERAGE</span>
        <div>{sourceCoverage.length ? sourceCoverage.map(([provider, count]) => <span key={provider}>{providerName(provider)} · {count} source{count === 1 ? "" : "s"}</span>) : <span>No provider sessions matched this report.</span>}</div>
      </section> : null}
      {privateView ? (
      <section className="story-pack__hero">
        <span className="story-section__label">HERE&apos;S HOW THIS ONE WENT</span>
        <h2>{pack.hero.headline}</h2>
        <p>{pack.hero.summary}</p>
      </section>
      ) : null}

      <div className="story-pack__sections">

      {privateView ? <>{insightStory}{factsRecap}</> : <>{factsRecap}{insightStory}{publicInsightItems.length ? <StoryInsightIndex items={publicInsightItems} /> : null}</>}

      {!insights && pack.buildArc.length && !sectionIsHidden("narrativeArc") ? (
        <NarrativeSection
          privateView={privateView}
          id="narrativeArc"
          label="HOW IT MOVED"
          meta="Discover · decide · deliver"
          open={sectionIsOpen("narrativeArc", true)}
          onOpenChange={setSectionOpen("narrativeArc")}
          style={sectionStyle("narrativeArc", 0)}
          legacyClassName="story-pack__arc"
          legacyAriaLabel="Build arc"
        >
          <div className="story-pack__section-illustration" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/illustrations/story-moments/branching-decisions.webp" alt="" loading="lazy" />
          </div>
          <div className="story-pack__arc-grid">
            {pack.buildArc.map((phase, index) => (
              <article key={phase.phase} className="story-pack__arc-card">
                <span className="story-pack__phase-number">0{index + 1}</span>
                <small>{phase.phase.toUpperCase()}</small>
                <h3>{phase.headline}</h3>
                <p>{phase.summary}</p>
                {privateView ? <div className="story-pack__sources">{phase.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div> : null}
              </article>
            ))}
          </div>
        </NarrativeSection>
      ) : null}

      {!insights && moments.length && privateView && !sectionIsHidden("narrativeMoments") ? (
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

      {hasInsightCards && privateView && !sectionIsHidden("narrativeInsights") ? (
        <div className="story-pack__insight-grid" style={sectionStyle("narrativeInsights", 2)}>{insightCards}</div>
      ) : null}

      {deep && privateView && !sectionIsHidden("narrativeInsights") ? (
        <NarrativeSection
          privateView={privateView}
          id="narrativeInsights"
          label="THE BUILD RECAP"
          meta={`Signature moves, hard parts, and changes across ${deep.coverage.sessionsSeen} AI sessions`}
          open={sectionIsOpen("narrativeInsights", true)}
          onOpenChange={setSectionOpen("narrativeInsights")}
          style={sectionStyle("narrativeInsights", 4)}
          legacyClassName="story-pack__deep-recap"
          legacyAriaLabel="Deep analysis"
        >
          {deep.openingLine?.title ? (
            <article className="deep-recap__opening">
              <div className="deep-recap__index">01</div>
              <div>
                <small className="deep-recap__confidence">{deep.openingLine.confidence.toUpperCase()} CONFIDENCE</small>
                <h3>{deep.openingLine.title}</h3>
                <p>{deep.openingLine.summary}</p>
                <div className="story-pack__sources">{deep.openingLine.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
              </div>
            </article>
          ) : null}
          <div className="deep-recap__groups">
            {deepGroups.map(([label, findings]) => findings.length ? (
              <section className="deep-recap__group" key={label}>
                <span>{label}</span>
                {findings.map((finding, index) => (
                  <article key={`${label}-${finding.title}-${index}`}>
                    <strong>{finding.title}</strong>
                    <p>{finding.summary}</p>
                    <small className="deep-recap__confidence">{finding.confidence.toUpperCase()} CONFIDENCE</small>
                    <div className="story-pack__sources">{finding.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
                  </article>
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
