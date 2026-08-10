"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizeReportStoryPack, type BuildStoryViewModel, type PublicBuildStoryViewModel } from "@/lib/build-story";
import { STORY_CATEGORIES, type NarrativeRecord, type PublicationStatus, type PublicFieldKey, type ReportMediaRecord, type StoryCategory } from "@/lib/ingestion/contracts";
import type { NarrativeDisplayStatus } from "@/lib/ingestion/narrative-status";
import type { ReportStoryPack } from "@/lib/ingestion/scanner-project-snapshot";
import { DEFAULT_STORY_BACKGROUND_ID, STORY_BACKGROUND_OPTIONS, storyBackgroundOption, type StoryBackgroundId } from "@/lib/background-options";
import { copyToClipboard } from "@/lib/clipboard";
import { initialsFrom } from "@/lib/identity/initials";
import { resolveVideoEmbed } from "@/lib/media/video-embed";
import type { ChapterDelta } from "@/lib/story/chapter-delta";
import { ChapterDeltaSummary } from "./chapter-delta-summary";
import { ProjectChangelog } from "./project-changelog";
import { ChapterTimeline, type ChapterSummary } from "./chapter-timeline";
import { CommentThread } from "./comment-thread";
import { ReceiptCard } from "./receipt-card";
import { ShareButton } from "./share-button";
import { SocialActions } from "./social-actions";
import { GuideTooltip } from "./guidance/studio-guide";

type ArtifactLinksState = { projectUrl: string | null; repoUrl: string | null; videoUrl: string | null };

type ProjectWorkbenchProps = {
  story: (BuildStoryViewModel | PublicBuildStoryViewModel) & { reportId?: string; chapterDelta?: ChapterDelta | null };
  /**
   * The server-gated public projection (publicBuildStoryFromSnapshot run against
   * the report's currently-saved selectedPublicFields). Only meaningful for
   * access="creator" - the "Public" tab renders from this instead of the full
   * private `story`, so the boundary checkboxes actually change what the creator
   * previews. Refreshed by the caller (router.refresh()) after a saved selection.
   */
  previewStory?: (PublicBuildStoryViewModel & { chapterDelta?: ChapterDelta | null }) | null;
  /** Live, ungated preview of the delta since the previous chapter - computed server-side, shown only to the creator before they publish. */
  livePreviewDelta?: ChapterDelta | null;
  access?: "public" | "creator";
  reportId?: string;
  projectId?: string;
  hasLiveChapter?: boolean;
  ownerRoleOverride?: string | null;
  initialPublicationStatus?: PublicationStatus;
  initialSelectedPublicFields?: PublicFieldKey[];
  narrative?: NarrativeRecord | null;
  narrativeStatus?: NarrativeDisplayStatus;
  initialEditorial?: Partial<{
    tagline: string;
    description: string;
    reflection: string;
  }>;
  initialCategory?: StoryCategory | null;
  initialStoryBackgroundId?: StoryBackgroundId;
  initialArtifact?: ArtifactLinksState;
  initialMedia?: ReportMediaRecord[];
  initialVerifiedRepoAt?: string | null;
  chapters?: ChapterSummary[];
  currentChapterIndex?: number;
  reviewedEvidence?: Array<{ excerptId: string; sessionRef: string; occurredAt: string; role: string; text: string }>;
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const usdFormat = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sourceDateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const verifiedDateFormat = new Intl.DateTimeFormat("en", { month: "numeric", day: "numeric", year: "numeric", timeZone: "UTC" });
const formatMicroUsd = (microUsd: number) => usdFormat.format(microUsd / 1_000_000);

const fieldOptions: Array<{ id: PublicFieldKey; label: string; detail: string }> = [
  { id: "tagline", label: "Tagline", detail: "Required for publication" },
  { id: "description", label: "Opening narrative", detail: "Your edited public summary" },
  { id: "timeWindow", label: "Build window", detail: "Dates and active-day count" },
  { id: "sessionSummary", label: "Session summary", detail: "Count and active build time" },
  { id: "milestones", label: "Milestones", detail: "Selected turning points" },
  { id: "modelMix", label: "Model mix", detail: "Model names, request counts, and aggregate token usage" },
  { id: "costEstimate", label: "Estimated cost", detail: "Token spend by model, priced from a static table" },
  { id: "toolUsage", label: "Tool usage", detail: "Observed tools, not a score" },
  { id: "gitAggregates", label: "Git aggregates", detail: "Commit, contributor, branch, file, addition, and deletion totals; never commit hashes" },
  { id: "redactionSummary", label: "Redaction summary", detail: "Counts only, never redacted content" },
  { id: "archetype", label: "Builder archetype", detail: "Rule-based profile label and rationale" },
  { id: "profileScores", label: "Profile scores", detail: "Five auditable deterministic dimensions" },
  { id: "workPatterns", label: "Work patterns", detail: "Hours, days, session shape, and model" },
  { id: "narrative", label: "Profile narrative", detail: "Headline, story, turning point, learnings" },
  { id: "storyBuildArc", label: "Build arc", detail: "Discover, decide, deliver phases" },
  { id: "storyMoments", label: "Build moments", detail: "Evidence-backed moments that changed the build" },
  { id: "storyTurningPoint", label: "Turning point", detail: "A source-linked inflection point" },
  { id: "storyDecisions", label: "Story decisions", detail: "Decision, rationale, and outcome cards" },
  { id: "storyLearnings", label: "Story learnings", detail: "Titled evidence-linked insights" },
  { id: "storyTraits", label: "Story traits", detail: "Titled standout traits" },
  { id: "storyGrowthEdge", label: "Story growth edge", detail: "Private-by-default observation" },
  { id: "storySignals", label: "By the numbers", detail: "Computed facts, never model-written" },
  { id: "signalHeadline", label: "Headline fact on share card", detail: "The single most notable computed fact, shown on the OG image and downloadable card" },
  { id: "deepOpeningLine", label: "Deep opening line", detail: "AI-written hook plus analysis coverage counts and date window; off by default" },
  { id: "deepSignatureMoves", label: "Deep signature moves", detail: "AI-written findings plus analysis coverage counts and date window; off by default" },
  { id: "deepByTheNumbers", label: "Deep by the numbers", detail: "AI framing over computed facts, plus analysis coverage counts and date window; off by default" },
  { id: "deepWhereItGotHard", label: "Deep where it got hard", detail: "AI-written findings plus analysis coverage counts and date window; off by default" },
  { id: "deepChapterChanges", label: "Deep chapter changes", detail: "AI-written comparisons plus analysis coverage counts and date window; off by default" },
  { id: "standoutTraits", label: "Standout traits", detail: "Model-written observations" },
  { id: "decisionPatterns", label: "Decision patterns", detail: "Personal prose; off by default" },
  { id: "growthEdge", label: "Growth edge", detail: "Personal prose; off by default" },
  { id: "artifactLinks", label: "Project links", detail: "Project URL, repo, and video; off by default" },
  { id: "artifactMedia", label: "Screenshots & cover image", detail: "Uploaded images; off by default" },
];

function providerName(provider: string): string {
  if (provider === "claude-code") return "Claude Code";
  if (provider === "gemini-antigravity") return "Gemini Antigravity";
  if (provider === "cursor") return "Cursor";
  if (provider === "git") return "Git";
  return "Codex";
}

function narrativeFailureMessage(code: string | null | undefined, validationFailure?: NarrativeRecord["validationFailure"]): string {
  // Content-free path:rule pairs only (see NarrativeRecord.validationFailure)
  // - safe to show directly, and turns "it failed" into the one line that
  // names which constraint the provider kept missing.
  const diagnostic = validationFailure?.issues.length ? ` (${validationFailure.stage}: ${validationFailure.issues.join(", ")})` : "";
  if (code === "llm_invalid_schema" || code === "llm_invalid_json" || code === "llm_invalid_response") {
    return `The provider's structured result kept failing Buildstory's schema or evidence-reference validation after automatic repair and retry attempts. Provider usage may have been charged. The reviewed excerpts were erased, so generating a replacement requires a fresh reviewed scan.${diagnostic}`;
  }
  if (code === "llm_insufficient_output") {
    return `The provider's result passed schema validation but didn't contain enough model-written content for a usable report. Provider usage may have been charged. The reviewed excerpts were erased, so generating a replacement requires a fresh reviewed scan.${diagnostic}`;
  }
  if (code === "llm_model_or_zdr_unavailable") {
    return "No eligible Zero Data Retention route was available for the configured model. Buildstory did not relax ZDR or switch models. Start a fresh reviewed scan after the route is available.";
  }
  if (code === "evidence_expired") {
    return "The reviewed evidence expired before generation completed and has been erased. Start a fresh reviewed scan to try again.";
  }
  return `The narrative model could not generate a valid story for this scan. No further attempts are made automatically, and the reviewed excerpts have been erased. A replacement requires a fresh reviewed scan.${diagnostic}`;
}

function PrivacyVideoEmbed({ video, projectName }: { video: NonNullable<ReturnType<typeof resolveVideoEmbed>>; projectName: string }) {
  const [loaded, setLoaded] = useState(false);
  const provider = video.provider === "youtube" ? "YouTube" : video.provider === "vimeo" ? "Vimeo" : "Loom";
  if (!loaded) {
    return (
      <div className="artifact-panel__video-consent">
        <strong>External {provider} video</strong>
        <p>The provider receives your IP address and browser request only after you choose to load this embed.</p>
        <button className="button button--secondary" type="button" onClick={() => setLoaded(true)}>Load {provider} video</button>
      </div>
    );
  }
  return (
    <iframe
      src={video.embedUrl}
      title={`${projectName} demo video`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  );
}

function StorySourceBadge({ source, privateView, onOpen }: { source: ReportStoryPack["sources"][number]; privateView: boolean; onOpen: (ref: string) => void }) {
  const label = `${providerName(source.provider)} · ${sourceDateFormat.format(new Date(source.occurredAt))}`;
  return privateView ? (
    <button className="story-pack__source" type="button" onClick={() => onOpen(source.ref)} title="Open evidence metadata">
      {label} · {source.evidenceRefs.length} evidence
    </button>
  ) : <span className="story-pack__source">{label}</span>;
}

function StoryPackView({
  pack,
  privateView,
  reviewedEvidence = [],
  fallbacksUsed = [],
}: {
  pack: ReportStoryPack;
  privateView: boolean;
  reviewedEvidence?: Array<{ excerptId: string; sessionRef: string; occurredAt: string; role: string; text: string }>;
  fallbacksUsed?: string[];
}) {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const sourceByRef = new Map(pack.sources.map((source) => [source.ref, source]));
  const sourceCoverage = [...new Map(pack.sources.map((source) => [source.provider, (pack.sources.filter((item) => item.provider === source.provider).length)])).entries()];
  const deep = pack.version === "3.0.0" ? pack.deepAnalysis : undefined;
  const deepGroups = deep ? [
    ["SIGNATURE MOVES", deep.signatureMoves ?? []],
    ["WHERE IT GOT HARD", deep.whereItGotHard ?? []],
    ["WHAT CHANGED", deep.chapterChanges ?? []],
  ] as const : [];
  // BY THE NUMBERS: every deep.byTheNumbers finding frames one specific
  // computed signal - the stat line is always the signal's own deterministic
  // headline, never the model's words, so a hallucinated number has nowhere
  // to render even if one somehow got past validation. Signals the model
  // didn't (or couldn't - Standard/local/off never generate this field)
  // frame still show, plainly, with no model text at all: the fact set is
  // identical on every tier, only the curated framing on top of it isn't.
  const signalById = new Map(pack.signals.map((signal) => [signal.id, signal]));
  const framedSignalIds = new Set((deep?.byTheNumbers ?? []).map((item) => item.signalId));
  const unframedSignals = pack.signals.filter((signal) => !framedSignalIds.has(signal.id));
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
        <h2>{pack.hero.headline}</h2>
        <p>{pack.hero.summary}</p>
      </section>

      {pack.buildArc.length ? (
        <section className="story-pack__arc" aria-label="Build arc">
          <header><span>BUILD ARC</span><strong>{privateView ? "Evidence-linked phases" : "How the build moved"}</strong></header>
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
        </section>
      ) : null}

      {pack.moments.length ? (
        <section className="story-pack__moments">
          <header><span>MOMENTS THAT CHANGED THE BUILD</span><strong>{pack.moments.length} evidence-backed moments</strong></header>
          <div className="story-pack__moment-grid">
            {pack.moments.map((moment, index) => (
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
        </section>
      ) : null}

      {pack.turningPoint.quote || pack.decisions.length || pack.learnings.length || pack.standoutTraits.length || pack.growthEdge.title ? (
        <div className="story-pack__insight-grid">
          {pack.turningPoint.quote ? (
            <section className="story-pack__insight-card story-pack__insight-card--turning"><span>TURNING POINT</span><blockquote>“{pack.turningPoint.quote}”</blockquote><div className="story-pack__sources">{pack.turningPoint.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div></section>
          ) : null}
          {pack.decisions.length ? (
            <section className="story-pack__insight-card"><span>DECISIONS</span>{pack.decisions.map((item, index) => <div className="story-pack__decision" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.rationale}</p><small>{item.outcome}</small></div>)}</section>
          ) : null}
          {pack.learnings.length ? (
            <section className="story-pack__insight-card"><span>LEARNINGS</span>{pack.learnings.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p></div>)}</section>
          ) : null}
          {pack.standoutTraits.length ? (
            <section className="story-pack__insight-card"><span>STANDOUT TRAITS</span>{pack.standoutTraits.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p></div>)}</section>
          ) : null}
          {pack.growthEdge.title ? (
            <section className="story-pack__insight-card story-pack__insight-card--growth"><span>GROWTH EDGE</span><h3>{pack.growthEdge.title}</h3><p>{pack.growthEdge.observation}</p></section>
          ) : null}
        </div>
      ) : null}

      {pack.signals.length ? (
        <section className="story-pack__moments" aria-label="By the numbers">
          <header><span>BY THE NUMBERS</span><strong>Computed straight from the build, never model-written</strong></header>
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
        </section>
      ) : null}

      {deep ? (
        <section className="story-pack__arc" aria-label="Deep analysis">
          <header>
            <span>DEEP ANALYSIS</span>
            <strong>{deep.coverage.sessionsSeen} sessions · {deep.coverage.excerptsUsed} reviewed excerpts · {deep.coverage.evidenceBytes.toLocaleString()} bytes · {sourceDateFormat.format(new Date(deep.coverage.windowStart))}–{sourceDateFormat.format(new Date(deep.coverage.windowEnd))}</strong>
          </header>
          {deep.openingLine?.title ? (
            <article className="story-pack__moment-card">
              <div className="story-pack__moment-index">01</div>
              <div>
                <small>{deep.openingLine.confidence.toUpperCase()} CONFIDENCE</small>
                <h3>{deep.openingLine.title}</h3>
                <p>{deep.openingLine.summary}</p>
                <div className="story-pack__sources">{deep.openingLine.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
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
                    <div className="story-pack__sources">{finding.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div>
                  </div>
                ))}
              </section>
            ) : null)}
          </div>
        </section>
      ) : null}

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

export function ProjectWorkbench({
  story,
  previewStory = null,
  livePreviewDelta = null,
  access = "creator",
  reportId,
  projectId,
  ownerRoleOverride = null,
  hasLiveChapter = false,
  initialPublicationStatus = "not_published",
  initialSelectedPublicFields = fieldOptions.filter((field) => ![
    "decisionPatterns",
    "growthEdge",
    "storyGrowthEdge",
    "deepOpeningLine",
    "deepSignatureMoves",
    "deepByTheNumbers",
    "deepWhereItGotHard",
    "deepChapterChanges",
    "artifactLinks",
    "artifactMedia",
  ].includes(field.id)).map((field) => field.id),
  narrative = null,
  narrativeStatus,
  initialEditorial,
  initialCategory,
  initialStoryBackgroundId = DEFAULT_STORY_BACKGROUND_ID,
  initialArtifact,
  initialMedia = [],
  initialVerifiedRepoAt = null,
  chapters = [],
  currentChapterIndex,
  reviewedEvidence = [],
}: ProjectWorkbenchProps) {
  const owner = ownerRoleOverride ? { ...story.owner, role: ownerRoleOverride } : story.owner;
  const router = useRouter();
  const initialResolvedNarrativeStatus: NarrativeDisplayStatus =
    narrativeStatus ??
    (narrative
      ? narrative.status === "ready"
        ? "narrative_ready"
        : narrative.status === "failed"
          ? "narrative_failed"
          : narrative.status === "generating"
            ? "narrative_generating"
            : "narrative_queued"
      : "narrative_not_requested");
  const [resolvedNarrativeStatus, setResolvedNarrativeStatus] = useState<NarrativeDisplayStatus>(initialResolvedNarrativeStatus);
  useEffect(() => {
    if (access !== "creator" || !reportId || (resolvedNarrativeStatus !== "narrative_queued" && resolvedNarrativeStatus !== "narrative_generating")) return;
    let stopped = false;
    const poll = async () => {
      const response = await fetch(`/api/creator/reports/${reportId}/narrative-status`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok || stopped) return;
      const body = await response.json().catch(() => null) as { status?: NarrativeDisplayStatus } | null;
      if (!body?.status || stopped) return;
      setResolvedNarrativeStatus(body.status);
      if (body.status === "narrative_ready" || body.status === "narrative_failed") router.refresh();
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [access, reportId, resolvedNarrativeStatus, router]);
  const privateStory = access === "creator" ? (story as BuildStoryViewModel) : null;
  const storyReflection = "reflection" in story ? story.reflection : "";
  const initialTagline = initialEditorial?.tagline ?? story.tagline;
  const initialDescription = initialEditorial?.description ?? story.description;
  const defaultReflection =
    initialEditorial?.reflection ??
    (storyReflection || (access === "creator"
      ? "AI made it cheap to explore three architectures. Tester feedback made it obvious which one deserved to survive."
      : ""));
  const resolvedCategory = initialCategory ?? ("category" in story ? story.category : null);
  const [view, setView] = useState<"public" | "private">(
    access === "creator" && initialPublicationStatus === "not_published" ? "private" : "public",
  );
  const [editing, setEditing] = useState(false);
  const [tagline, setTagline] = useState(initialTagline);
  const [description, setDescription] = useState(initialDescription);
  const [reflection, setReflection] = useState(defaultReflection);
  const [category, setCategory] = useState<StoryCategory | null>(resolvedCategory);
  const [storyBackgroundId, setStoryBackgroundId] = useState<StoryBackgroundId>(initialStoryBackgroundId);
  const publicStoryBackgroundId = "storyBackgroundId" in story && story.storyBackgroundId ? story.storyBackgroundId : initialStoryBackgroundId;
  const [artifactLinks, setArtifactLinks] = useState<ArtifactLinksState>(
    initialArtifact ?? { projectUrl: null, repoUrl: null, videoUrl: null },
  );
  const [draft, setDraft] = useState({
    tagline,
    description,
    reflection,
    projectUrl: artifactLinks.projectUrl ?? "",
    repoUrl: artifactLinks.repoUrl ?? "",
    videoUrl: artifactLinks.videoUrl ?? "",
    category: resolvedCategory ?? "",
    storyBackgroundId: initialStoryBackgroundId,
  });
  const activeStoryBackgroundId = access === "creator"
    ? (editing ? draft.storyBackgroundId : storyBackgroundId)
    : publicStoryBackgroundId;
  const [media, setMedia] = useState<ReportMediaRecord[]>(initialMedia);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [verifiedRepoAt, setVerifiedRepoAt] = useState<string | null>(initialVerifiedRepoAt);
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "error">("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [badgeCopied, setBadgeCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState<PublicFieldKey[]>(initialSelectedPublicFields);
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus>(initialPublicationStatus);
  // "draft_changes" still has a live public URL (the last published version) - see the
  // publication-boundary fix that keeps it serving the frozen story instead of 404ing.
  // Anything gated on "is there something public to link to / take down" must include it.
  const isLive = publicationStatus === "published" || publicationStatus === "draft_changes";
  const narrativePending = resolvedNarrativeStatus === "narrative_queued" || resolvedNarrativeStatus === "narrative_generating";
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [publishReviewAcknowledged, setPublishReviewAcknowledged] = useState(false);
  const [privateNoticeOpen, setPrivateNoticeOpen] = useState(false);
  const publishReviewCloseRef = useRef<HTMLButtonElement | null>(null);
  const storyNarrative = "narrative" in story ? story.narrative : null;
  // Private-tab pack: the full, ungated narrative record (used only on the private tab,
  // which always shows everything regardless of the publication boundary).
  const privateStoryPack = normalizeReportStoryPack(
    narrative?.storyPack
      ?? ("storyPack" in story && story.storyPack ? story.storyPack : null)
      ?? (storyNarrative && typeof storyNarrative === "object" && "storyPack" in storyNarrative
        ? (storyNarrative.storyPack as ReportStoryPack | undefined) ?? null
        : null),
  );
  // Public visitors already see the server-gated projection on `story`. A creator's own
  // "Public" tab must render the same server-gated projection (`previewStory`, recomputed
  // from the currently-saved selectedPublicFields) - not the full private `story` - or the
  // boundary checkboxes visibly do nothing in the one place a creator checks them.
  const displayStory: PublicBuildStoryViewModel & { chapterDelta?: ChapterDelta | null } = access === "creator" && previewStory
    ? previewStory
    : (story as PublicBuildStoryViewModel);
  const publicStoryPackPreview = "storyPack" in displayStory ? displayStory.storyPack : null;
  const displayArtifactLinks = access === "public" && "artifactLinks" in story ? story.artifactLinks : artifactLinks;
  const displayArtifactMedia = access === "public" && "artifactMedia" in story ? story.artifactMedia : media;
  const videoEmbed = resolveVideoEmbed(displayArtifactLinks.videoUrl);
  const coverMedia = displayArtifactMedia.find((item) => item.kind === "cover") ?? displayArtifactMedia[0] ?? null;
  const screenshotMedia = displayArtifactMedia.filter((item) => item.id !== coverMedia?.id);
  const hasArtifact = Boolean(
    displayArtifactLinks.projectUrl || displayArtifactLinks.repoUrl || displayArtifactLinks.videoUrl || displayArtifactMedia.length,
  );
  const reviewedPublicReceiptId = `BR-PUBLIC-${story.id.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`;

  useEffect(() => {
    if (!publishReviewOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPublishReviewOpen(false);
        setPublishReviewAcknowledged(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    publishReviewCloseRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [publishReviewOpen]);

  useEffect(() => {
    if (access !== "creator" || initialPublicationStatus !== "not_published") return;
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(`buildstory:private-report-notice:${story.id}`) !== "dismissed") {
          setPrivateNoticeOpen(true);
        }
      } catch {
        // A blocked storage context should not prevent the privacy reminder from showing.
        setPrivateNoticeOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [access, initialPublicationStatus, story.id]);

  function dismissPrivateNotice() {
    try {
      window.localStorage.setItem(`buildstory:private-report-notice:${story.id}`, "dismissed");
    } catch {
      // Dismissal still works for this visit when storage is unavailable.
    }
    setPrivateNoticeOpen(false);
  }

  function startEditing() {
    setDraft({
      tagline,
      description,
      reflection,
      projectUrl: artifactLinks.projectUrl ?? "",
      repoUrl: artifactLinks.repoUrl ?? "",
      videoUrl: artifactLinks.videoUrl ?? "",
      category: category ?? "",
      storyBackgroundId,
    });
    setEditing(true);
  }

  function cancelEditing() {
    setDraft({
      tagline,
      description,
      reflection,
      projectUrl: artifactLinks.projectUrl ?? "",
      repoUrl: artifactLinks.repoUrl ?? "",
      videoUrl: artifactLinks.videoUrl ?? "",
      category: category ?? "",
      storyBackgroundId,
    });
    setEditing(false);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      tagline: draft.tagline.trim() || tagline,
      description: draft.description.trim() || description,
      reflection: draft.reflection.trim() || reflection,
    };
    const nextArtifact = {
      projectUrl: draft.projectUrl.trim() || null,
      repoUrl: draft.repoUrl.trim() || null,
      videoUrl: draft.videoUrl.trim() || null,
    };
    const nextCategory = draft.category && STORY_CATEGORIES.includes(draft.category as StoryCategory) ? draft.category as StoryCategory : null;
    const nextStoryBackgroundId = draft.storyBackgroundId;
    setSaveState("saving");
    try {
      if (reportId) {
        const response = await fetch(`/api/creator/reports/${reportId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ editorial: next, selectedPublicFields: selectedFields, artifact: nextArtifact, category: nextCategory, storyBackgroundId: nextStoryBackgroundId }),
        });
        if (!response.ok) throw new Error("Report update failed.");
      }
      setTagline(next.tagline);
      setDescription(next.description);
      setReflection(next.reflection);
      setArtifactLinks(nextArtifact);
      setCategory(nextCategory);
      setStoryBackgroundId(nextStoryBackgroundId);
      // Keep the selected background in the creator preview and share-card default.
      setDraft((current) => ({ ...current, storyBackgroundId: nextStoryBackgroundId }));
      if (nextCategory) setPublicationError(null);
      setPublicationStatus((current) => current === "published" ? "draft_changes" : current);
      setSaveState("saved");
      setEditing(false);
    } catch {
      setSaveState("error");
    }
  }

  /**
   * PATCHes the current field selection. Both saveFieldSelection and publishChanges
   * must go through this - publish previously fired without it, so "Republish" would
   * silently publish whatever selection was last saved, ignoring any unsaved toggles.
   */
  async function persistSelection(): Promise<boolean> {
    if (!reportId) return false;
    try {
      const response = await fetch(`/api/creator/reports/${reportId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedPublicFields: selectedFields }),
      });
      if (!response.ok) throw new Error("Report selection update failed.");
      setPublicationStatus((current) => current === "published" ? "draft_changes" : current);
      router.refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function saveFieldSelection() {
    if (!reportId) return;
    setSaveState("saving");
    setSaveState((await persistSelection()) ? "saved" : "error");
  }

  function requestPublishReview() {
    if (!reportId) {
      setPublicationError("This story is not ready to publish yet.");
      return;
    }
    if (!category) {
      setPublicationError("Choose a story category before publishing.");
      setView("public");
      startEditing();
      return;
    }
    setPublicationError(null);
    setPublishReviewAcknowledged(false);
    setPublishReviewOpen(true);
  }

  // Mirrors the data sources publicationFieldReviewValue reads, but as a boolean
  // gate: a field with nothing behind it can be selected and it will change
  // nothing on the public page, so the checkbox grid uses this to grey it out
  // instead of offering a toggle that's silently a no-op.
  function fieldHasData(field: PublicFieldKey): boolean {
    if (!privateStory) return true;
    const pack = privateStoryPack;
    const deep = pack?.version === "3.0.0" ? pack.deepAnalysis : undefined;
    switch (field) {
      case "tagline": return Boolean(tagline);
      case "description": return Boolean(description || reflection);
      case "timeWindow": return true;
      case "sessionSummary": return privateStory.sessionCount > 0;
      case "milestones": return privateStory.milestones.length > 0;
      case "modelMix": return privateStory.models.length > 0;
      case "costEstimate": return privateStory.cost?.totalMicroUsd != null;
      case "toolUsage": return privateStory.tools.length > 0;
      case "gitAggregates": return privateStory.git.commits > 0;
      case "redactionSummary": return true;
      case "archetype": return Boolean(privateStory.profile?.archetype);
      case "profileScores": return Boolean(privateStory.profile);
      case "workPatterns": return Boolean(privateStory.profile);
      case "narrative": return Boolean(privateStory.narrative?.headline);
      case "storyBuildArc": return Boolean(pack?.buildArc.length);
      case "storyMoments": return Boolean(pack?.moments.length);
      case "storyTurningPoint": return Boolean(pack?.turningPoint.quote);
      case "storyDecisions": return Boolean(pack?.decisions.length);
      case "storyLearnings": return Boolean(pack?.learnings.length);
      case "storyTraits": return Boolean(pack?.standoutTraits.length);
      case "storyGrowthEdge": return Boolean(pack?.growthEdge.title);
      case "storySignals": return Boolean(pack?.signals.length);
      case "decisionPatterns": return Boolean(privateStory.narrative?.decisionPatterns.length);
      case "standoutTraits": return Boolean(privateStory.narrative?.standoutTraits.length);
      case "growthEdge": return Boolean(privateStory.narrative?.growthEdge);
      case "signalHeadline": return Boolean(pack?.signals[0]?.headline);
      case "deepOpeningLine": return Boolean(deep?.openingLine);
      case "deepSignatureMoves": return Boolean(deep?.signatureMoves?.length);
      case "deepByTheNumbers": return Boolean(deep?.byTheNumbers?.length);
      case "deepWhereItGotHard": return Boolean(deep?.whereItGotHard?.length);
      case "deepChapterChanges": return Boolean(deep?.chapterChanges?.length);
      case "artifactLinks": return Boolean(artifactLinks.projectUrl || artifactLinks.repoUrl || artifactLinks.videoUrl);
      case "artifactMedia": return media.length > 0;
      default: return false;
    }
  }

  function publicationFieldReviewValue(field: PublicFieldKey): string {
    if (!privateStory) return "See public preview";
    const pack = privateStoryPack;
    const deep = pack?.version === "3.0.0" ? pack.deepAnalysis : undefined;
    const coverage = deep
      ? `; coverage ${deep.coverage.excerptsUsed} excerpts / ${deep.coverage.evidenceBytes.toLocaleString()} bytes, ${deep.coverage.windowStart} to ${deep.coverage.windowEnd}`
      : "";
    switch (field) {
      case "tagline": return tagline || "Empty";
      case "description": return [description, reflection].filter(Boolean).join(" · ") || "Empty";
      case "timeWindow": return `${privateStory.dateRange}; ${privateStory.activeDays} active days`;
      case "sessionSummary": return `${privateStory.sessionCount} sessions; ${privateStory.buildHours} hours; ${privateStory.subagentCount} subagents`;
      case "milestones": return privateStory.milestones.map((item) => item.title).join("; ") || "None";
      case "modelMix": return `${privateStory.models.map((model) => `${model.label} (${model.requests})`).join(", ") || "None"}; ${privateStory.tokenUsage?.totalTokens.toLocaleString() ?? 0} aggregate tokens`;
      case "costEstimate": return privateStory.cost?.totalMicroUsd != null ? formatMicroUsd(privateStory.cost.totalMicroUsd) : "Not priced";
      case "toolUsage": return privateStory.tools.map((tool) => `${tool.label} (${tool.sessions})`).join(", ") || "None";
      case "gitAggregates": return `${privateStory.git.commits} commits; ${privateStory.git.contributors} contributors; ${privateStory.git.branches} branches; ${privateStory.git.filesTouched} files; +${privateStory.git.additions}/-${privateStory.git.deletions}`;
      case "redactionSummary": return `${privateStory.redaction.tokensRemoved} tokens withheld`;
      case "archetype": return privateStory.profile?.archetype.name ?? "Not available";
      case "profileScores": return privateStory.profile ? Object.entries(privateStory.profile.scores).map(([name, score]) => `${name}: ${score.value}`).join(", ") : "Not available";
      case "workPatterns": return privateStory.profile ? `${privateStory.profile.workPatterns.preferredDays.join(", ") || "No preferred days"}; median ${privateStory.profile.workPatterns.medianSessionMinutes} minutes; ${privateStory.profile.workPatterns.timezoneLabel}` : "Not available";
      case "narrative": return privateStory.narrative?.headline ?? "Not available";
      case "storyBuildArc": return pack?.buildArc.map((item) => item.headline).join("; ") || "Not available";
      case "storyMoments": return pack?.moments.map((item) => item.title).join("; ") || "Not available";
      case "storyTurningPoint": return pack?.turningPoint.quote ?? "Not available";
      case "storyDecisions": return pack?.decisions.map((item) => item.title).join("; ") || "Not available";
      case "storyLearnings": return pack?.learnings.map((item) => item.title).join("; ") || "Not available";
      case "storyTraits": return pack?.standoutTraits.map((item) => item.title).join("; ") || "Not available";
      case "storyGrowthEdge": return pack?.growthEdge.title ?? "Not available";
      case "storySignals": return pack?.signals.map((signal) => signal.headline).join("; ") || "Not available";
      case "decisionPatterns": return privateStory.narrative?.decisionPatterns.join("; ") || "Not available";
      case "standoutTraits": return privateStory.narrative?.standoutTraits.join("; ") || "Not available";
      case "growthEdge": return privateStory.narrative?.growthEdge ?? "Not available";
      case "signalHeadline": return pack?.signals[0]?.headline ?? "Not available";
      case "deepOpeningLine": return deep?.openingLine ? `${deep.openingLine.title}${coverage}` : "Not available";
      case "deepSignatureMoves": return deep ? `${(deep.signatureMoves ?? []).map((item) => item.title).join("; ") || "No supported findings"}${coverage}` : "Not available";
      case "deepByTheNumbers": return deep ? `${(deep.byTheNumbers ?? []).map((item) => item.title).join("; ") || "No supported findings"}${coverage}` : "Not available";
      case "deepWhereItGotHard": return deep ? `${(deep.whereItGotHard ?? []).map((item) => item.title).join("; ") || "No supported findings"}${coverage}` : "Not available";
      case "deepChapterChanges": return deep ? `${(deep.chapterChanges ?? []).map((item) => item.title).join("; ") || "No supported changes"}${coverage}` : "Not available";
      case "artifactLinks": return [artifactLinks.projectUrl, artifactLinks.repoUrl, artifactLinks.videoUrl].filter(Boolean).join("; ") || "No links";
      case "artifactMedia": return media.map((item) => `${item.kind} ${item.id}`).join("; ") || "No images";
      // Deprecated fields (renamed or cut in the report-redesign sprint) -
      // a stored selectedPublicFields array may still name one of these;
      // there is nothing new to preview for it.
      default: return "Not available (legacy field, no longer generated)";
    }
  }

  async function publishChanges() {
    if (!reportId || !publishReviewAcknowledged) return;
    setSaveState("saving");
    if (!(await persistSelection())) {
      setPublicationError("Could not save your field selection. Try again before publishing.");
      setSaveState("error");
      return;
    }
    try {
      const response = await fetch(`/api/creator/reports/${reportId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "publish-reviewed-v1", selectedPublicFields: selectedFields }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "Could not publish this story.");
      }
      setPublicationStatus("published");
      setSaveState("saved");
      setPublishReviewOpen(false);
      setPublishReviewAcknowledged(false);
      router.refresh();
    } catch (error) {
      setPublicationError(error instanceof Error ? error.message : "Could not publish this story.");
      setSaveState("error");
    }
  }

  async function unpublish() {
    if (!reportId || !isLive) return;
    setSaveState("saving");
    try {
      const response = await fetch(`/api/creator/reports/${reportId}/publish`, { method: "DELETE" });
      if (!response.ok) throw new Error("Report unpublish failed.");
      setPublicationStatus("not_published");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function uploadMedia(file: File, kind: "cover" | "screenshot") {
    if (!reportId || mediaBusy) return;
    setMediaBusy(true);
    setMediaError(null);
    try {
      const response = await fetch(`/api/creator/reports/${reportId}/media?kind=${kind}`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMediaError(payload?.error?.message ?? "Could not upload that image.");
        return;
      }
      const data = (await response.json()) as { media: ReportMediaRecord };
      setMedia((current) => [...current, data.media]);
    } catch {
      setMediaError("Could not upload that image.");
    } finally {
      setMediaBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeMedia(mediaId: string) {
    if (!reportId || mediaBusy) return;
    setMediaBusy(true);
    setMediaError(null);
    try {
      const response = await fetch(`/api/creator/reports/${reportId}/media/${mediaId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      setMedia((current) => current.filter((item) => item.id !== mediaId));
    } catch {
      setMediaError("Could not remove that image.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function verifyRepository() {
    if (!projectId || !artifactLinks.repoUrl || verifyState === "verifying") return;
    setVerifyState("verifying");
    setVerifyError(null);
    try {
      const response = await fetch(`/api/creator/projects/${projectId}/verify-repo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl: artifactLinks.repoUrl }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setVerifyError(payload?.error?.message ?? "Could not verify that repository.");
        setVerifyState("error");
        return;
      }
      const data = (await response.json()) as { verifiedRepoAt: string };
      setVerifiedRepoAt(data.verifiedRepoAt);
      setVerifyState("idle");
    } catch {
      setVerifyError("Could not verify that repository.");
      setVerifyState("error");
    }
  }

  function togglePublicField(field: PublicFieldKey) {
    if (field === "tagline") return;
    setSelectedFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field],
    );
    setSaveState("idle");
  }

  async function copyLink() {
    if (!isLive) return;
    const ok = await copyToClipboard(`${window.location.origin}/u/${owner.handle}/${story.slug}`);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  }

  async function copyBadgeMarkdown() {
    if (!isLive) return;
    const path = `/u/${owner.handle}/${story.slug}`;
    const markdown = `[![Buildstory](${window.location.origin}${path}/badge.svg)](${window.location.origin}${path})`;
    const ok = await copyToClipboard(markdown);
    setBadgeCopied(ok);
    if (ok) window.setTimeout(() => setBadgeCopied(false), 1600);
  }

  return (
    <main className="project-workbench">
      {access === "creator" ? (
      <div className="project-console-bar">
        <div className="project-console-bar__primary">
          <div className="project-console-bar__identity">
            <span className="avatar">{initialsFrom(owner.name)}</span>
            <span>
              <strong>{story.name}</strong>
              <small>Owner workbench</small>
            </span>
          </div>
        </div>

        <div className="view-switcher-shell">
        <div className="view-switcher" role="tablist" aria-label="Project views" data-guide="workbench-views">
          <button
            id="public-tab"
            role="tab"
            type="button"
            aria-selected={view === "public"}
            aria-controls="public-panel"
            className={view === "public" ? "is-active" : undefined}
            onClick={() => setView("public")}
          >
            <span className="view-status view-status--public" /> Public page preview
          </button>
          <button
            id="private-tab"
            role="tab"
            type="button"
            aria-selected={view === "private"}
            aria-controls="private-panel"
            className={view === "private" ? "is-active" : undefined}
            onClick={() => { setView("private"); setEditing(false); }}
          >
            <span className="view-status view-status--private" /> Private report
          </button>
          <GuideTooltip label="public and private views">Public is the reader-facing story; Private is the complete report.</GuideTooltip>
        </div>
          {privateNoticeOpen ? (
            <aside className="private-report-popover" role="status" aria-label="Private report reminder">
              <span className="private-report-popover__eyebrow"><i aria-hidden="true" /> PRIVATE BY DEFAULT</span>
              <strong>This report is private.</strong>
              <p>The public page preview is only a draft. Nothing is visible to anyone else until you review and publish it.</p>
              <div>
                <button className="button button--secondary button--small" type="button" onClick={() => { dismissPrivateNotice(); setView("public"); }}>
                  View preview
                </button>
                <button className="button button--text button--small" type="button" onClick={dismissPrivateNotice}>
                  Dismiss
                </button>
              </div>
            </aside>
          ) : null}
        </div>

        <div className="project-console-bar__actions" data-guide="workbench-actions">
          {view === "public" && !editing ? (
            <button className="button button--secondary button--small project-console-bar__edit" type="button" onClick={startEditing}>
              Edit public page
            </button>
          ) : null}
          {projectId ? <Link className="button button--secondary button--small project-console-bar__scan" href={`/studio/projects/${projectId}/update`}>{isLive || hasLiveChapter ? "Scan for updates" : "Scan project updates"}</Link> : null}
          {isLive ? <button className="button button--text button--small project-console-bar__more" type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>More</button> : null}
          {isLive ? <div className={`project-console-bar__utilities${moreOpen ? " is-open" : ""}`}>
            <button
              className="button button--dark button--small"
              type="button"
              onClick={() => void copyLink()}
              title="Copy the public story URL"
            >
              {copied ? "Public link copied" : "Copy public link"} <span aria-hidden="true">↗</span>
            </button>
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => void copyBadgeMarkdown()}
              title="Copy a README badge for this story"
            >
              {badgeCopied ? "Badge markdown copied" : "Copy README badge"}
            </button>
          </div> : null}
          {publicationStatus !== "published" ? (
            <button
              className="button button--primary button--small"
              type="button"
              onClick={requestPublishReview}
              disabled={saveState === "saving" || narrativePending}
            >
              {narrativePending ? "AI narrative pending" : saveState === "saving" ? "Publishing…" : publicationStatus === "draft_changes" ? "Review & publish changes" : "Review & publish"}
            </button>
          ) : (
            <span className="publication-live"><i /> Published</span>
          )}
        </div>
      </div>
      ) : (
        <div className="public-story-bar">
          <span><i /> Published Build Story · Universal public access</span>
          <a href="/signin?callbackUrl=/studio">Creator controls →</a>
        </div>
      )}

      {access === "creator" && publicationStatus !== "published" && view === "private" ? (
        <div className={`private-report-banner${publicationStatus === "draft_changes" ? " private-report-banner--changes" : ""}`} role="status">
          <span className="private-report-banner__icon" aria-hidden="true">{publicationStatus === "draft_changes" ? "↻" : "▣"}</span>
          <div>
            <strong>{publicationStatus === "draft_changes" ? "Unpublished changes" : "Private report · not published"}</strong>
            <p>
              {publicationStatus === "draft_changes"
                ? "Your current public page is still live. These changes stay private until you review and publish them."
                : "This report is only visible to you. Nothing is added to Public Stories until you review and publish it."}
            </p>
          </div>
          <span className="private-report-banner__status">{publicationStatus === "draft_changes" ? "Changes private" : "Not live"}</span>
        </div>
      ) : null}

      {access === "creator" && narrativePending ? (
        <div className="narrative-queue-banner" role="status" aria-live="polite">
          <span className="narrative-queue-banner__pulse" aria-hidden="true" />
          <div>
            <strong>{resolvedNarrativeStatus === "narrative_queued" ? "Your AI narrative is queued." : "Your AI narrative is being generated."}</strong>
            <p>The deterministic report is ready, so you can browse its metrics and private sections now. This page checks the queue automatically and will load the evidence-linked narrative when it finishes.</p>
          </div>
        </div>
      ) : null}

      {access === "creator" && publicationError ? (
        <div className="publication-feedback" role="alert">
          <strong>Could not publish.</strong> {publicationError}
        </div>
      ) : null}

      {view === "public" ? (
        <div id="public-panel" role="tabpanel" aria-labelledby="public-tab">
          {access === "creator" && publicationStatus !== "published" ? (
            <div className="public-preview-only-banner" role="status">
              <span className="public-preview-only-banner__mark" aria-hidden="true">PREVIEW</span>
              <div>
                <strong>Public page preview · not live</strong>
                <p>Only you can see this preview. It becomes public after you review the selected fields and publish the page.</p>
              </div>
            </div>
          ) : null}
          {editing ? (
            <form className="project-editor" onSubmit={saveDraft}>
              <div className="project-editor__header">
                <div>
                  <span className="section-index">EDITING PUBLIC PAGE</span>
                  <h2>Keep the facts. Make the story yours.</h2>
                </div>
                <span>
                  {publicationError
                    ? publicationError
                    : saveState === "saving"
                    ? "Saving private report…"
                    : saveState === "error"
                      ? "Save failed"
                      : "Private draft · creator only"}
                </span>
              </div>
              <label>
                <span>Project tagline</span>
                <input
                  value={draft.tagline}
                  onChange={(event) => setDraft({ ...draft, tagline: event.target.value })}
                  maxLength={90}
                />
                <small>{draft.tagline.length}/90</small>
              </label>
              <label className="project-editor__category">
                <span>Story category <small className="project-editor__field-note">Required before publishing</small></span>
                <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                  <option value="">Choose a category</option>
                  {STORY_CATEGORIES.map((value) => <option value={value} key={value}>{value.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ")}</option>)}
                </select>
              </label>
              <label>
                <span>Opening paragraph</span>
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={4}
                  maxLength={360}
                />
                <small>{draft.description.length}/360</small>
              </label>
              <label>
                <span>What changed your mind?</span>
                <textarea
                  value={draft.reflection}
                  onChange={(event) => setDraft({ ...draft, reflection: event.target.value })}
                  rows={3}
                  maxLength={260}
                />
                <small>{draft.reflection.length}/260</small>
              </label>

              <div className="project-editor__section-label">
                <span>THE ARTIFACT</span>
                <small>Not shown publicly unless you tick &ldquo;Project links&rdquo; / &ldquo;Screenshots &amp; cover image&rdquo; below and publish.</small>
              </div>
              <label>
                <span>Live project URL</span>
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://your-project.example.com"
                  value={draft.projectUrl}
                  onChange={(event) => setDraft({ ...draft, projectUrl: event.target.value })}
                  maxLength={2000}
                />
              </label>
              <label>
                <span>Repository URL</span>
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://github.com/you/project"
                  value={draft.repoUrl}
                  onChange={(event) => setDraft({ ...draft, repoUrl: event.target.value })}
                  maxLength={2000}
                />
              </label>
              {projectId && artifactLinks.repoUrl ? (
                <div className="project-editor__repo-verify">
                  {verifiedRepoAt ? (
                    <span className="verified-chip" title={`Verified ${verifiedDateFormat.format(new Date(verifiedRepoAt))}`}>
                      <span aria-hidden="true">✓</span> Verified repository owner
                    </span>
                  ) : (
                    <>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        onClick={() => void verifyRepository()}
                        disabled={verifyState === "verifying"}
                      >
                        {verifyState === "verifying" ? "Verifying…" : "Verify GitHub ownership"}
                      </button>
                      {verifyError ? <small className="project-editor__repo-verify-error" role="alert">{verifyError}</small> : null}
                    </>
                  )}
                </div>
              ) : null}
              <label>
                <span>Demo video (YouTube, Vimeo, or Loom)</span>
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={draft.videoUrl}
                  onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
                  maxLength={2000}
                />
              </label>

              <fieldset className="background-picker">
                <legend>Story card background</legend>
                <p className="background-picker__hint">Choose the visual system behind the Explore receipt. Text is rendered in a solid safe panel beside the artwork, so it never sits over a decorative image element.</p>
                <div className="background-picker__grid">
                  {STORY_BACKGROUND_OPTIONS.map((option) => (
                    <label className={`background-picker__option${draft.storyBackgroundId === option.id ? " is-selected" : ""}`} key={option.id}>
                      <input
                        type="radio"
                        name="storyBackground"
                        value={option.id}
                        checked={draft.storyBackgroundId === option.id}
                        onChange={() => setDraft({ ...draft, storyBackgroundId: option.id })}
                      />
                      <span className="background-picker__swatch">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="background-theme-light" src={option.assets.light} alt="" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="background-theme-dark" src={option.assets.dark} alt="" />
                      </span>
                      <span className="background-picker__label"><strong>{option.label}</strong><small>{option.description}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="project-editor__actions">
                <button className="button button--text" type="button" onClick={cancelEditing}>Cancel</button>
                <button className="button button--primary" type="submit">Save public draft</button>
              </div>
            </form>
          ) : null}

          {editing ? (
            <div className="project-media-editor">
              <div className="project-editor__section-label">
                <span>SCREENSHOTS &amp; COVER IMAGE</span>
                <small>PNG, JPEG, or WebP · up to 5 MB · up to 5 images. EXIF metadata is stripped from JPEGs on upload.</small>
              </div>
              {mediaError ? <p className="comment-thread__error" role="alert">{mediaError}</p> : null}
              <div className="project-media-editor__grid">
                {media.map((item) => (
                  <figure key={item.id} className="project-media-editor__item">
                    {/* User-uploaded media uses signed application URLs rather than the framework image optimizer. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="" />
                    <figcaption>
                      <span>{item.kind === "cover" ? "Cover" : "Screenshot"}</span>
                      <button type="button" className="button button--text" onClick={() => void removeMedia(item.id)} disabled={mediaBusy}>
                        Remove
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {media.length < 5 ? (
                <label className="project-media-editor__upload">
                  <span>{mediaBusy ? "Uploading…" : media.some((item) => item.kind === "cover") ? "Add a screenshot" : "Add a cover image"}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={mediaBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadMedia(file, media.some((item) => item.kind === "cover") ? "screenshot" : "cover");
                    }}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <article className="build-story">
            <header className="build-story__hero section-wrap">
              <div className="build-story__hero-copy">
                <div className="story-kicker">
                  <span className={`status-dot status-dot--${story.status === "shipped" ? "shipped" : "building"}`} />
                  {story.status.toUpperCase()} · {(category ?? ("category" in story ? story.category : "other")).toUpperCase()} · {displayStory.dateRange.toUpperCase()}
                </div>
                <h1>{story.name}</h1>
                <p className="build-story__tagline">{tagline}</p>
                <div className="build-story__author">
                  <span className="avatar avatar--large">{initialsFrom(owner.name)}</span>
                  <span>
                    <strong>{owner.name}</strong>
                    <small>@{owner.handle} · {owner.role}</small>
                  </span>
                </div>
                <div className="build-story__hero-actions" aria-label="Project links">
                  {displayArtifactLinks.projectUrl ? <a className="button button--primary" href={displayArtifactLinks.projectUrl} target="_blank" rel="noopener noreferrer nofollow">View live demo <span aria-hidden="true">↗</span></a> : null}
                  {displayArtifactLinks.repoUrl ? <a className="button button--secondary" href={displayArtifactLinks.repoUrl} target="_blank" rel="noopener noreferrer nofollow">GitHub repository <span aria-hidden="true">↗</span></a> : null}
                  {displayArtifactLinks.videoUrl ? <a className="button button--text" href={displayArtifactLinks.videoUrl} target="_blank" rel="noopener noreferrer nofollow">Watch demo <span aria-hidden="true">↗</span></a> : null}
                  {displayArtifactLinks.repoUrl && verifiedRepoAt ? <span className="verified-chip" title={`Verified ${verifiedDateFormat.format(new Date(verifiedRepoAt))}`}><span aria-hidden="true">✓</span> Verified owner</span> : null}
                </div>
                {access === "public" ? (
                  <div className="build-story__hero-share">
                    <ShareButton
                      path={`/u/${owner.handle}/${story.slug}`}
                      title={story.name}
                      downloadPath={`/api/share/story/${owner.handle}/${story.slug}`}
                      storyBackgroundId={activeStoryBackgroundId}
                    />
                  </div>
                ) : null}
              </div>
              <div className="build-story__cover">
                {coverMedia ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="build-story__cover-image" src={coverMedia.url} alt={`${story.name} product preview`} />
                </> : <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="background-theme-light build-story__cover-background" src={storyBackgroundOption(activeStoryBackgroundId).assets.light} alt="" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="background-theme-dark build-story__cover-background" src={storyBackgroundOption(activeStoryBackgroundId).assets.dark} alt="" />
                  <div className="build-story__cover-copy">
                    <span className="cover-caption">BUILD / RECEIPT</span>
                    <strong>{story.name}</strong>
                    <i />
                    <small>{displayStory.sessionCount} sessions / {displayStory.git.commits} commits / {displayStory.activeDays} days</small>
                  </div>
                </>}
              </div>
            </header>

            {access === "public" && currentChapterIndex ? (
              <ChapterTimeline chapters={chapters} handle={owner.handle} slug={story.slug} currentChapterIndex={currentChapterIndex} />
            ) : null}

            {access === "public" && displayStory.chapterDelta ? (
              <div className="section-wrap chapter-delta-wrap">
                <ChapterDeltaSummary delta={displayStory.chapterDelta} />
              </div>
            ) : null}

            {access === "public" ? <ProjectChangelog chapters={chapters} /> : null}

            {hasArtifact && (screenshotMedia.length > 0 || videoEmbed) ? (
              <section className="artifact-panel section-wrap" aria-label="The artifact">
                {videoEmbed ? (
                  <div className="artifact-panel__video">
                    <PrivacyVideoEmbed video={videoEmbed} projectName={story.name} />
                  </div>
                ) : null}
                {screenshotMedia.length ? (
                  <div className="artifact-panel__screenshots">
                    <span className="artifact-panel__screenshots-label">Screenshots</span>
                    {screenshotMedia.map((item) => <span key={item.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt="" loading="lazy" />
                    </span>)}
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="story-stats section-wrap" aria-label="Build summary">
              <div><strong>{displayStory.activeDays}</strong><span>active days</span></div>
              <div><strong>{displayStory.sessionCount}</strong><span>AI sessions</span></div>
              <div><strong>{displayStory.git.commits}</strong><span>commits</span></div>
              <div><strong>{displayStory.git.additions.toLocaleString()}</strong><span>lines added</span></div>
              <div><strong>{displayStory.models.length}</strong><span>models in the mix</span></div>
              <div>
                <strong>{displayStory.tokenUsage ? compactNumber.format(displayStory.tokenUsage.totalTokens) : "—"}</strong>
                <span>tokens processed</span>
              </div>
              <div>
                <strong>{displayStory.cost?.totalMicroUsd != null ? formatMicroUsd(displayStory.cost.totalMicroUsd) : "—"}</strong>
                <span>est. API-equivalent spend</span>
              </div>
            </div>

            <div className="story-layout section-wrap">
              <div className="story-narrative">
                <section className="story-section story-section--opening">
                  <span className="story-section__number">01</span>
                  <div>
                    <span className="story-section__label">THE BRIEF</span>
                    <h2>{tagline}</h2>
                    <p className="story-dropcap">{description}</p>
                  </div>
                </section>

                {displayStory.profile?.archetype || displayStory.profile?.scores ? (
                  <section className="story-section">
                    <span className="story-section__number">02</span>
                    <div>
                      <span className="story-section__label">BUILDER PROFILE</span>
                      {displayStory.profile.archetype ? (
                        <>
                          <h2>{displayStory.profile.archetype.name}</h2>
                          <p>{displayStory.profile.archetype.rationale.join(" ")}</p>
                        </>
                      ) : null}
                      {displayStory.profile.scores ? (
                        <>
                          <div className="profile-score-grid">
                            {Object.entries(displayStory.profile.scores).map(([key, score]) => (
                              <div key={key}><strong>{score.value}</strong><span>{key === "productInstinct" ? "product instinct*" : key}</span></div>
                            ))}
                          </div>
                          <small>* Product instinct is a weak proxy derived from completion and plan-before-edit signals.</small>
                        </>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {reflection ? (
                  <aside className="story-quote">
                    <span>WHAT CHANGED MY MIND</span>
                    <blockquote>“{reflection}”</blockquote>
                  </aside>
                ) : null}

                {publicStoryPackPreview ? <StoryPackView pack={publicStoryPackPreview} privateView={false} reviewedEvidence={reviewedEvidence} fallbacksUsed={"fallbacksUsed" in displayStory ? displayStory.fallbacksUsed : []} /> : displayStory.signals.length ? (
                  <section className="story-section" aria-live="polite">
                    <span className="story-section__number">02</span>
                    <div>
                      <span className="story-section__label">BY THE NUMBERS</span>
                      <h2>Computed straight from the build, never model-written.</h2>
                      <div className="story-pack__moment-grid">
                        {displayStory.signals.map((signal, index) => (
                          <article className="story-pack__moment-card" key={signal.id}>
                            <div className="story-pack__moment-index">{String(index + 1).padStart(2, "0")}</div>
                            <div><h3>{signal.headline}</h3><div className="story-pack__moment-copy"><p>{signal.detail}</p></div></div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : <section className="story-section story-pack-empty" aria-live="polite">
                  <span className="story-section__number">02</span>
                  <div>
                    <span className="story-section__label">THE BUILD</span>
                    <h2>Structured moments are still being assembled.</h2>
                    <p>Deterministic session summaries stay private; this story surface only publishes evidence-linked cards once the report pack is ready.</p>
                  </div>
                </section>}

                <section className="story-section story-section--closing">
                  <span className="story-section__number">03</span>
                  <div>
                    <span className="story-section__label">WHERE IT STANDS</span>
                    <h2>{displayStory.sessionCount} sessions, {displayStory.git.commits} commits, and counting.</h2>
                    {story.stack.length ? (
                      <div className="story-tags">
                        {story.stack.map((tag) => <span key={tag}>{tag}</span>)}
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <div className="story-receipt-column">
                <div className="story-receipt-column__label">
                  <span>THE EVIDENCE</span>
                  <p>Generated from a redacted ProjectSnapshot.</p>
                </div>
                <ReceiptCard story={displayStory} />
                {access === "creator" ? (
                  <button type="button" className="receipt-source-link" onClick={() => setView("private")}>
                    View private source report <span aria-hidden="true">→</span>
                  </button>
                ) : null}
              </div>
            </div>
          </article>

          {access === "public" ? (
            <div className="section-wrap community-section">
              <div className="community-section__actions">
                <SocialActions storyId={story.reportId ?? story.id} ownerHandle={owner.handle} />
              </div>
              <CommentThread storyId={story.reportId ?? story.id} chapterCount={Math.max(chapters.length, currentChapterIndex ?? 1)} />
            </div>
          ) : null}
        </div>
      ) : privateStory ? (
        <section
          className="private-report section-wrap"
          id="private-panel"
          role="tabpanel"
          aria-labelledby="private-tab"
        >
          <header className="private-report__heading">
            <div>
              <div className="private-badge"><span>●</span> PRIVATE · ONLY YOU CAN SEE THIS</div>
              <h1>Generated project report</h1>
              <p>
                A source-of-truth review assembled from the local snapshot.
                Nothing below is public until you choose and rewrite it.
              </p>
            </div>
            <button className="button button--primary" type="button" onClick={() => setView("public")}>
              Review public page <span aria-hidden="true">→</span>
            </button>
          </header>

          <div className="report-health">
            <div>
              <span className="report-health__check">✓</span>
              <span><strong>Snapshot ready</strong><small>Repository-scoped read only</small></span>
            </div>
            <dl>
              <div><dt>Coverage</dt><dd>{privateStory.activeDays} active days</dd></div>
              <div>
                <dt>Tokens</dt>
                <dd>{privateStory.tokenUsage ? compactNumber.format(privateStory.tokenUsage.totalTokens) : "Not collected"}</dd>
              </div>
              <div>
                <dt>Est. cost</dt>
                <dd>
                  {privateStory.cost?.totalMicroUsd != null
                    ? formatMicroUsd(privateStory.cost.totalMicroUsd)
                    : privateStory.cost && privateStory.cost.unpricedTokens > 0
                      ? "No priced models"
                      : "Not collected"}
                </dd>
              </div>
              <div><dt>Redaction</dt><dd>Passed</dd></div>
              <div><dt>Revision</dt><dd>{privateStory.repository.currentRevision}</dd></div>
            </dl>
          </div>

          <section className="source-health-strip" aria-label="Session source health">
            <span className="section-index">SOURCE HEALTH</span>
            {(privateStory.sourceSelection?.providers ?? []).map((source) => (
              <div key={source.provider} className={`source-health-strip__item source-health-strip__item--${source.diagnostic ?? "scanned"}`}>
                <strong>{providerName(source.provider)}</strong>
                <small>{source.sessionsMatched} matched · {source.sessionsIncluded} included · {source.filesDiscovered} files · {source.warnings ?? 0} warnings</small>
                <em>{source.diagnostic === "scanned" ? "scanned" : (source.diagnostic ?? "scanned").replaceAll("-", " ")}</em>
              </div>
            ))}
          </section>

          {livePreviewDelta ? (
            <section className="report-card report-card--delta-preview" aria-label="What changed since the last chapter">
              <ChapterDeltaSummary delta={livePreviewDelta} selectedFields={selectedFields} />
            </section>
          ) : null}

          <section className="publication-boundary-panel" data-guide="workbench-boundary">
            <header>
              <div>
                <span className="section-index">PUBLICATION BOUNDARY <GuideTooltip label="publication boundary">The baseline identity items listed here are always public. Selected optional fields are copied into the public chapter; the source snapshot and reviewed excerpts remain private.</GuideTooltip></span>
                <h2>Choose the fields allowed onto the public page.</h2>
                <p>Always public: project name, owner display name/handle/role, category, status, tech stack, visual background, and an opaque public receipt ID. The source snapshot, raw session details, repository path, remotes, branch, and commit hashes stay private.</p>
              </div>
              <div className={`publication-state publication-state--${publicationStatus}`}>
                <i /> {publicationStatus === "draft_changes" ? "unpublished changes" : publicationStatus.replaceAll("_", " ")}
              </div>
            </header>
            <div className="public-field-grid">
              {fieldOptions.map((field) => {
                const checked = selectedFields.includes(field.id);
                const hasData = fieldHasData(field.id);
                // Never block unchecking a field that lost its data after being selected -
                // only block turning on a toggle that would be a silent no-op.
                const disabled = field.id === "tagline" || (!hasData && !checked);
                const showEmptyBadge = !hasData && field.id !== "tagline";
                return (
                  <label
                    key={field.id}
                    className={[checked ? "is-selected" : "", showEmptyBadge ? "is-unavailable" : ""].filter(Boolean).join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => togglePublicField(field.id)}
                    />
                    <span>
                      <strong>{field.label}</strong>
                      <small>{field.detail}</small>
                      {showEmptyBadge ? <em>No data for this report</em> : null}
                    </span>
                    <i aria-hidden="true">{checked ? "✓" : ""}</i>
                  </label>
                );
              })}
            </div>
            <footer>
              <span>
                {publicationError
                  ? publicationError
                  : saveState === "error"
                  ? "Private report update failed."
                  : saveState === "saved"
                    ? "Private report selection saved."
                    : "Changes are private until you publish."}
              </span>
              <div>
                <button className="button button--secondary" type="button" onClick={saveFieldSelection} disabled={saveState === "saving"}>
                  Save private selection
                </button>
                <button className="button button--primary" type="button" onClick={requestPublishReview} disabled={saveState === "saving"}>
                  {saveState === "saving" ? "Publishing…" : isLive ? "Review & republish" : "Review & publish page"}
                </button>
                {isLive ? <button className="button button--text" type="button" onClick={() => void unpublish()} disabled={saveState === "saving"}>Unpublish</button> : null}
              </div>
            </footer>
          </section>

          {publishReviewOpen && view === "private" ? (
            <div className="publish-review-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.currentTarget === event.target) {
                setPublishReviewOpen(false);
                setPublishReviewAcknowledged(false);
              }
            }}>
              <section className="publish-review" role="dialog" aria-modal="true" aria-labelledby="publish-review-title">
                <header>
                  <div>
                    <span className="section-index">FINAL PRIVACY REVIEW</span>
                    <h2 id="publish-review-title">This is what becomes public.</h2>
                  </div>
                  <button ref={publishReviewCloseRef} type="button" className="button button--text" onClick={() => { setPublishReviewOpen(false); setPublishReviewAcknowledged(false); }} aria-label="Close publish review">Close</button>
                </header>
                <div className="publish-review__columns">
                  <section>
                    <h3>Always public</h3>
                    <dl>
                      <div><dt>Project</dt><dd>{story.name}</dd></div>
                      <div><dt>Owner</dt><dd>{story.owner.name} (@{story.owner.handle}) · {story.owner.role}</dd></div>
                      <div><dt>Category / status</dt><dd>{category} / {story.status}</dd></div>
                      <div><dt>Tech stack</dt><dd>{story.stack.join(", ") || "No stack labels"}</dd></div>
                      <div><dt>Visual</dt><dd>{storyBackgroundOption(storyBackgroundId).label}</dd></div>
                      <div><dt>Receipt</dt><dd>{reviewedPublicReceiptId}</dd></div>
                    </dl>
                  </section>
                  <section>
                    <h3>Selected optional data ({selectedFields.length})</h3>
                    <ul>{fieldOptions.filter((field) => selectedFields.includes(field.id)).map((field) => <li key={field.id}><strong>{field.label}</strong><span>{field.detail}</span><small>{publicationFieldReviewValue(field.id)}</small></li>)}</ul>
                  </section>
                </div>
                <aside>
                  <strong>Still private</strong>
                  <p>Repository path and remotes, branch and commit hashes, full source snapshot, raw transcripts and tool payloads, reviewed excerpt text, connection credentials, and every unchecked optional field.</p>
                  {(selectedFields.includes("narrative") || fieldOptions.some((field) => field.id.startsWith("story") && selectedFields.includes(field.id))) ? <p>AI-written prose can reflect the meaning of private conversations. Pattern redaction reduces known secret, path, host, URL, and email exposure, but it is not a guarantee of anonymity—read the public preview before confirming.</p> : null}
                  {selectedFields.includes("artifactLinks") && artifactLinks.videoUrl ? <p>The video link is public. Visitors must choose to load an embed before their browser connects to the video provider.</p> : null}
                  {selectedFields.includes("artifactMedia") ? <p>{media.length} uploaded image{media.length === 1 ? "" : "s"} will be public until you unpublish or remove them.</p> : null}
                </aside>
                <label className="publish-review__acknowledgement">
                  <input type="checkbox" checked={publishReviewAcknowledged} onChange={(event) => setPublishReviewAcknowledged(event.target.checked)} />
                  <span>I reviewed the exact categories above and understand this creates or replaces a page anyone can view.</span>
                </label>
                <footer>
                  <button type="button" className="button button--secondary" onClick={() => { setPublishReviewOpen(false); setPublishReviewAcknowledged(false); }}>Keep private</button>
                  <button type="button" className="button button--primary" onClick={() => void publishChanges()} disabled={!publishReviewAcknowledged || saveState === "saving"}>
                    {saveState === "saving" ? "Publishing…" : isLive ? "Confirm and republish" : "Confirm and publish"}
                  </button>
                </footer>
              </section>
            </div>
          ) : null}

          <div className="private-report__grid">
            <section className="report-card report-card--sessions">
              <header><span>01 / SESSION SUMMARY</span><strong>{story.sessionCount} captured sessions</strong></header>
              <div className="session-table">
                {privateStory.sessions.map((session) => (
                  <article key={session.id}>
                    <span className="session-table__index">{String(session.index).padStart(2, "0")}</span>
                    <span><small>{session.date} · {session.duration}</small><strong>{session.intent}</strong><em>{session.outcome}</em></span>
                    <span className="session-table__areas">{session.touchedAreas.slice(0, 2).join(" / ")}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="report-card">
              <header><span>02 / REPOSITORY</span><strong>Git aggregate</strong></header>
              <dl className="report-data-list">
                <div><dt>Repository</dt><dd>{privateStory.repository.remotePath}</dd></div>
                <div><dt>Primary stack</dt><dd>{privateStory.repository.primaryLanguage} · {privateStory.repository.framework}</dd></div>
                <div><dt>Tracked files</dt><dd>{privateStory.repository.fileCount ?? "Not collected"}</dd></div>
                <div><dt>Commits</dt><dd>{story.git.commits}</dd></div>
                <div><dt>Diff</dt><dd><ins>+{story.git.additions.toLocaleString()}</ins> <del>−{story.git.deletions.toLocaleString()}</del></dd></div>
                <div><dt>Branches</dt><dd>{story.git.branches}</dd></div>
              </dl>
            </section>

            <section className="report-card">
              <header>
                <span>03 / TOOL & MODEL USE</span>
                <strong>Observed, not scored</strong>
                {privateStory.cost?.totalMicroUsd != null ? (
                  <small className="report-card__cost-total">{formatMicroUsd(privateStory.cost.totalMicroUsd)} estimated</small>
                ) : null}
              </header>
              <div className="report-models">
                {story.models.map((model) => (
                  <div key={model.id}>
                    <span><strong>{model.label}</strong><small>{model.requests} model calls{model.tokenUsage ? ` · ${compactNumber.format(model.tokenUsage.totalTokens)} tokens` : ""}</small></span>
                    <span>
                      {model.share === null ? "unpriced" : `${model.share}%`}
                      {model.costMicroUsd != null ? <em className="report-models__cost">{formatMicroUsd(model.costMicroUsd)}</em> : null}
                    </span>
                  </div>
                ))}
              </div>
              {privateStory.cost && privateStory.cost.unpricedTokens > 0 ? (
                <small className="report-models__unpriced">
                  {compactNumber.format(privateStory.cost.unpricedTokens)} tokens from a model outside the pricing table aren&apos;t priced.
                </small>
              ) : null}
              <div className="report-tools">
                {privateStory.tools.map((tool) => <span key={tool.id}>{tool.label} · {tool.sessions}</span>)}
              </div>
            </section>

            <section className="report-card report-card--redaction">
              <header><span>04 / REDACTION</span><strong>Local pass complete</strong></header>
              <div className="redaction-score"><strong>{privateStory.redaction.tokensRemoved.toLocaleString()}</strong><span>tokens withheld before upload</span></div>
              <dl className="report-data-list">
                <div><dt>Files excluded</dt><dd>{privateStory.redaction.redactedFiles}</dd></div>
                <div><dt>Paths generalized</dt><dd>{privateStory.redaction.generalizedPaths}</dd></div>
                <div><dt>Secret-shaped values removed</dt><dd>{privateStory.redaction.secretMatchesRemoved}</dd></div>
              </dl>
              <ul>{privateStory.redaction.notes.map((note) => <li key={note}>{note}</li>)}</ul>
            </section>

            <section className="report-card report-card--provenance">
              <header><span>05 / PROVENANCE</span><strong>Scan chain</strong></header>
              <dl className="report-data-list">
                <div><dt>Scanner</dt><dd>{privateStory.provenance.scannerVersion}</dd></div>
                <div><dt>Source</dt><dd>{privateStory.provenance.source}</dd></div>
                <div><dt>Scope</dt><dd>{privateStory.provenance.machineScope}</dd></div>
                <div><dt>Snapshot hash</dt><dd>{privateStory.provenance.snapshotHash}</dd></div>
                <div><dt>Consent policy</dt><dd>{privateStory.provenance.consentVersion}</dd></div>
              </dl>
            </section>
          </div>

          {privateStory.profile ? (
            <section className="report-card report-card--profile">
                <header><span>06 / BUILDER PROFILE</span><strong>{privateStory.profile.archetype.name}</strong></header>
                <p>{privateStory.profile.archetype.rationale.join(" ")}</p>
                <div className="profile-score-grid">
                  {Object.entries(privateStory.profile.scores).map(([key, score]) => (
                    <div key={key}><strong>{score.value}</strong><span>{key === "productInstinct" ? "product instinct*" : key}</span></div>
                  ))}
                </div>
                <dl className="report-data-list">
                  <div><dt>Peak hours</dt><dd>{privateStory.profile.workPatterns.peakHours.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(", ") || "None"} {privateStory.profile.workPatterns.timezoneLabel}</dd></div>
                  <div><dt>Preferred days</dt><dd>{privateStory.profile.workPatterns.preferredDays.join(", ") || "None"}</dd></div>
                  <div><dt>Session shape</dt><dd>{privateStory.profile.workPatterns.medianSessionMinutes} min median · {privateStory.profile.workPatterns.longestSessionMinutes} min longest</dd></div>
                  <div><dt>Primary model</dt><dd>{privateStory.profile.workPatterns.primaryModel ?? "Not collected"}</dd></div>
                </dl>
                <small>* Product instinct is a weak proxy, not a measured personality trait.</small>
            </section>
          ) : null}

          {resolvedNarrativeStatus === "narrative_not_requested" ? (
              <section className="report-card report-card--narrative report-card--narrative-empty">
                <header><span>07 / BY THE NUMBERS</span><strong>{privateStory.signals.length ? "Computed facts, no narrative" : "Not requested"}</strong></header>
                {privateStory.signals.length ? (
                  <>
                    <p>This scan didn&apos;t opt into narrative evidence, so there is no AI-written narrative - but every fact below is computed straight from the build, needs no model, and is ready to share.</p>
                    <div className="story-pack__moment-grid">
                      {privateStory.signals.map((signal, index) => (
                        <article className="story-pack__moment-card" key={signal.id}>
                          <div className="story-pack__moment-index">{String(index + 1).padStart(2, "0")}</div>
                          <div><h3>{signal.headline}</h3><div className="story-pack__moment-copy"><p>{signal.detail}</p></div></div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : <p>This scan didn&apos;t opt into narrative evidence, so no AI-written narrative was generated. Metrics above are unaffected.</p>}
              </section>
            ) : resolvedNarrativeStatus === "narrative_no_evidence" ? (
              <section className="report-card report-card--narrative report-card--narrative-empty">
                <header><span>07 / AI-WRITTEN NARRATIVE</span><strong>No eligible evidence</strong></header>
                <p>Narrative evidence was requested, but no provider had an eligible excerpt to review - so no model was called. This is expected, not a failure.</p>
              </section>
            ) : (
              <section className="report-card report-card--narrative">
                <header><span>07 / AI-WRITTEN NARRATIVE</span><strong>{narrative?.mode === "cloud" ? "Buildstory Cloud" : "Generated on your machine"}</strong></header>
                {resolvedNarrativeStatus === "narrative_ready" && narrative?.sections ? (
                  privateStoryPack ? <StoryPackView pack={privateStoryPack} privateView reviewedEvidence={reviewedEvidence} fallbacksUsed={narrative.fallbacksUsed} /> : <section className="story-section story-pack-empty" aria-live="polite">
                    <span className="story-section__label">STRUCTURED STORY PACK</span>
                    <h3>Structured cards are not available for this report.</h3>
                    <p>This report was generated with an older narrative payload. Regenerate it with the current scanner to populate evidence-linked moments, decisions, learnings, traits, and growth cards.</p>
                  </section>
                ) : resolvedNarrativeStatus === "narrative_failed" ? (
                  <p>{narrativeFailureMessage(narrative?.failureCode, narrative?.validationFailure)}</p>
                ) : (
                  <div className="story-pack-skeleton" aria-label="Generating story pack" aria-busy="true">
                    <div className="story-pack-skeleton__hero" />
                    <div className="story-pack-skeleton__arc"><i /><i /><i /></div>
                    <div className="story-pack-skeleton__cards"><i /><i /><i /><i /></div>
                    <p>Generating your build narrative from the reviewed evidence bundle…</p>
                  </div>
                )}
              </section>
            )}
        </section>
      ) : null}

      {publishReviewOpen && view === "public" ? (
        <div className="publish-review-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            setPublishReviewOpen(false);
            setPublishReviewAcknowledged(false);
          }
        }}>
          <section className="publish-review" role="dialog" aria-modal="true" aria-labelledby="publish-review-title">
            <header>
              <div>
                <span className="section-index">FINAL PRIVACY REVIEW</span>
                <h2 id="publish-review-title">This is what becomes public.</h2>
              </div>
              <button ref={publishReviewCloseRef} type="button" className="button button--text" onClick={() => { setPublishReviewOpen(false); setPublishReviewAcknowledged(false); }} aria-label="Close publish review">Close</button>
            </header>
            <div className="publish-review__columns">
              <section>
                <h3>Always public</h3>
                <dl>
                  <div><dt>Project</dt><dd>{story.name}</dd></div>
                  <div><dt>Owner</dt><dd>{story.owner.name} (@{story.owner.handle}) / {story.owner.role}</dd></div>
                  <div><dt>Category / status</dt><dd>{category} / {story.status}</dd></div>
                  <div><dt>Tech stack</dt><dd>{story.stack.join(", ") || "No stack labels"}</dd></div>
                  <div><dt>Visual</dt><dd>{storyBackgroundOption(storyBackgroundId).label}</dd></div>
                  <div><dt>Receipt</dt><dd>{reviewedPublicReceiptId}</dd></div>
                </dl>
              </section>
              <section>
                <h3>Selected optional data ({selectedFields.length})</h3>
                <ul>{fieldOptions.filter((field) => selectedFields.includes(field.id)).map((field) => <li key={field.id}><strong>{field.label}</strong><span>{field.detail}</span><small>{publicationFieldReviewValue(field.id)}</small></li>)}</ul>
              </section>
            </div>
            <aside>
              <strong>Still private</strong>
              <p>Repository path and remotes, branch and commit hashes, full source snapshot, raw transcripts and tool payloads, reviewed excerpt text, connection credentials, and every unchecked optional field.</p>
              {(selectedFields.includes("narrative") || fieldOptions.some((field) => field.id.startsWith("story") && selectedFields.includes(field.id))) ? <p>AI-written prose can reflect the meaning of private conversations. Pattern redaction reduces known secret, path, host, URL, and email exposure, but it is not a guarantee of anonymity -- read the public preview before confirming.</p> : null}
              {selectedFields.includes("artifactLinks") && artifactLinks.videoUrl ? <p>The video link is public. Visitors must choose to load an embed before their browser connects to the video provider.</p> : null}
              {selectedFields.includes("artifactMedia") ? <p>{media.length} uploaded image{media.length === 1 ? "" : "s"} will be public until you unpublish or remove them.</p> : null}
            </aside>
            <label className="publish-review__acknowledgement">
              <input type="checkbox" checked={publishReviewAcknowledged} onChange={(event) => setPublishReviewAcknowledged(event.target.checked)} />
              <span>I reviewed the exact categories above and understand this creates or replaces a page anyone can view.</span>
            </label>
            <footer>
              <button type="button" className="button button--secondary" onClick={() => { setPublishReviewOpen(false); setPublishReviewAcknowledged(false); }}>Keep private</button>
              <button type="button" className="button button--primary" onClick={() => void publishChanges()} disabled={!publishReviewAcknowledged || saveState === "saving"}>
                {saveState === "saving" ? "Publishing..." : isLive ? "Confirm and republish" : "Confirm and publish"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
