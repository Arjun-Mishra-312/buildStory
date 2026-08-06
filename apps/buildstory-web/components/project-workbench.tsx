"use client";

import { FormEvent, useEffect, useState } from "react";
import type { BuildStoryViewModel, PublicBuildStoryViewModel } from "@/lib/build-story";
import type { NarrativeRecord, PublicationStatus, PublicFieldKey } from "@/lib/ingestion/contracts";
import type { NarrativeDisplayStatus } from "@/lib/ingestion/narrative-status";
import type { ReportStoryPackV2 } from "@/lib/ingestion/scanner-project-snapshot";
import { initialsFrom } from "@/lib/identity/initials";
import { CommentThread } from "./comment-thread";
import { ReceiptCard } from "./receipt-card";
import { SocialActions } from "./social-actions";

type ProjectWorkbenchProps = {
  story: (BuildStoryViewModel | PublicBuildStoryViewModel) & { reportId?: string };
  access?: "public" | "creator";
  reportId?: string;
  initialPublicationStatus?: PublicationStatus;
  initialSelectedPublicFields?: PublicFieldKey[];
  narrative?: NarrativeRecord | null;
  narrativeStatus?: NarrativeDisplayStatus;
  initialEditorial?: Partial<{
    tagline: string;
    description: string;
    reflection: string;
  }>;
  reviewedEvidence?: Array<{ excerptId: string; sessionRef: string; occurredAt: string; role: string; text: string }>;
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

const fieldOptions: Array<{ id: PublicFieldKey; label: string; detail: string }> = [
  { id: "tagline", label: "Tagline", detail: "Required for publication" },
  { id: "description", label: "Opening narrative", detail: "Your edited public summary" },
  { id: "timeWindow", label: "Build window", detail: "Dates and active-day count" },
  { id: "sessionSummary", label: "Session summary", detail: "Count and active build time" },
  { id: "milestones", label: "Milestones", detail: "Selected turning points" },
  { id: "modelMix", label: "Model mix", detail: "Requests and relative share" },
  { id: "toolUsage", label: "Tool usage", detail: "Observed tools, not a score" },
  { id: "gitAggregates", label: "Git aggregates", detail: "Commits, files, and diff totals" },
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
  { id: "storyGrowthEdge", label: "Story growth edge", detail: "Private-by-default next step" },
  { id: "standoutTraits", label: "Standout traits", detail: "Model-written observations" },
  { id: "decisionPatterns", label: "Decision patterns", detail: "Personal prose; off by default" },
  { id: "growthEdge", label: "Growth edge", detail: "Personal prose; off by default" },
];

function providerName(provider: string): string {
  if (provider === "claude-code") return "Claude Code";
  if (provider === "gemini-antigravity") return "Gemini Antigravity";
  if (provider === "cursor") return "Cursor";
  if (provider === "git") return "Git";
  return "Codex";
}

function StorySourceBadge({ source, privateView, onOpen }: { source: ReportStoryPackV2["sources"][number]; privateView: boolean; onOpen: (ref: string) => void }) {
  const label = `${providerName(source.provider)} · ${new Date(source.occurredAt).toLocaleDateString("en", { month: "short", day: "numeric" })}`;
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
  pack: ReportStoryPackV2;
  privateView: boolean;
  reviewedEvidence?: Array<{ excerptId: string; sessionRef: string; occurredAt: string; role: string; text: string }>;
  fallbacksUsed?: string[];
}) {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const sourceByRef = new Map(pack.sources.map((source) => [source.ref, source]));
  const sourceCoverage = [...new Map(pack.sources.map((source) => [source.provider, (pack.sources.filter((item) => item.provider === source.provider).length)])).entries()];
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

      <div className="story-pack__insight-grid">
        <section className="story-pack__insight-card story-pack__insight-card--turning"><span>TURNING POINT</span><blockquote>“{pack.turningPoint.quote}”</blockquote><div className="story-pack__sources">{pack.turningPoint.sourceRefs.map((ref) => { const source = sourceByRef.get(ref); return source ? <StorySourceBadge key={ref} source={source} privateView={privateView} onOpen={openEvidence} /> : null; })}</div></section>
        <section className="story-pack__insight-card"><span>DECISIONS</span>{pack.decisions.map((item, index) => <div className="story-pack__decision" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.rationale}</p><small>{item.outcome}</small></div>)}</section>
        <section className="story-pack__insight-card"><span>LEARNINGS</span>{pack.learnings.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p></div>)}</section>
        <section className="story-pack__insight-card"><span>STANDOUT TRAITS</span>{pack.standoutTraits.map((item, index) => <div className="story-pack__bullet" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p></div>)}</section>
        <section className="story-pack__insight-card story-pack__insight-card--growth"><span>GROWTH EDGE</span><h3>{pack.growthEdge.title}</h3><p>{pack.growthEdge.observation}</p><small>{pack.growthEdge.nextStep}</small></section>
      </div>

      {privateView && openRef && selected ? (
        <div className="story-pack__evidence-backdrop" role="presentation" onClick={() => setOpenRef(null)}>
          <aside className="story-pack__evidence-drawer" role="dialog" aria-modal="true" aria-label="Evidence details" onClick={(event) => event.stopPropagation()}>
            <button className="button button--text" type="button" onClick={() => setOpenRef(null)}>Close</button>
            <span className="story-section__label">EVIDENCE {selected.ref}</span>
            <h3>{providerName(selected.provider)}</h3>
            <p>{new Date(selected.occurredAt).toLocaleString()} · {selected.metrics.turns} turns · {selected.metrics.toolCalls} tool calls</p>
            {excerpts.length ? excerpts.map((excerpt) => <blockquote key={excerpt.excerptId}>{excerpt.text}</blockquote>) : <p>Only metadata is available for this source. Local narrative mode never uploads conversation excerpts.</p>}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectWorkbench({
  story,
  access = "creator",
  reportId,
  initialPublicationStatus = "not_published",
  initialSelectedPublicFields = fieldOptions.filter((field) => !["decisionPatterns", "growthEdge", "storyGrowthEdge"].includes(field.id)).map((field) => field.id),
  narrative = null,
  narrativeStatus,
  initialEditorial,
  reviewedEvidence = [],
}: ProjectWorkbenchProps) {
  const resolvedNarrativeStatus: NarrativeDisplayStatus =
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
  const privateStory = access === "creator" ? (story as BuildStoryViewModel) : null;
  const storyReflection = "reflection" in story ? story.reflection : "";
  const initialTagline = initialEditorial?.tagline ?? story.tagline;
  const initialDescription = initialEditorial?.description ?? story.description;
  const defaultReflection =
    initialEditorial?.reflection ??
    (storyReflection || (access === "creator"
      ? "AI made it cheap to explore three architectures. Tester feedback made it obvious which one deserved to survive."
      : ""));
  const [view, setView] = useState<"public" | "private">("public");
  const [editing, setEditing] = useState(false);
  const [tagline, setTagline] = useState(initialTagline);
  const [description, setDescription] = useState(initialDescription);
  const [reflection, setReflection] = useState(defaultReflection);
  const [draft, setDraft] = useState({ tagline, description, reflection });
  const [copied, setCopied] = useState(false);
  const [selectedFields, setSelectedFields] = useState<PublicFieldKey[]>(initialSelectedPublicFields);
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus>(initialPublicationStatus);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const storyNarrative = "narrative" in story ? story.narrative : null;
  const storyPack = narrative?.storyPack ?? ("storyPack" in story && story.storyPack ? story.storyPack : null) ?? (
    storyNarrative && typeof storyNarrative === "object" && "storyPack" in storyNarrative
      ? (storyNarrative.storyPack as ReportStoryPackV2 | undefined) ?? null
      : null
  );

  function startEditing() {
    setDraft({ tagline, description, reflection });
    setEditing(true);
  }

  function cancelEditing() {
    setDraft({ tagline, description, reflection });
    setEditing(false);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      tagline: draft.tagline.trim() || tagline,
      description: draft.description.trim() || description,
      reflection: draft.reflection.trim() || reflection,
    };
    setSaveState("saving");
    try {
      if (reportId) {
        const response = await fetch(`/api/creator/reports/${reportId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ editorial: next, selectedPublicFields: selectedFields }),
        });
        if (!response.ok) throw new Error("Report update failed.");
      }
      setTagline(next.tagline);
      setDescription(next.description);
      setReflection(next.reflection);
      setPublicationStatus((current) => current === "published" ? "draft_changes" : current);
      setSaveState("saved");
      setEditing(false);
    } catch {
      setSaveState("error");
    }
  }

  async function saveFieldSelection() {
    if (!reportId) return;
    setSaveState("saving");
    try {
      const response = await fetch(`/api/creator/reports/${reportId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedPublicFields: selectedFields }),
      });
      if (!response.ok) throw new Error("Report selection update failed.");
      setPublicationStatus((current) => current === "published" ? "draft_changes" : current);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function publishChanges() {
    if (!reportId) return;
    setSaveState("saving");
    try {
      const response = await fetch(`/api/creator/reports/${reportId}/publish`, { method: "POST" });
      if (!response.ok) throw new Error("Report publication failed.");
      setPublicationStatus("published");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function unpublish() {
    if (!reportId || publicationStatus !== "published") return;
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

  function togglePublicField(field: PublicFieldKey) {
    if (field === "tagline") return;
    setSelectedFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field],
    );
    setSaveState("idle");
  }

  async function copyLink() {
    if (publicationStatus !== "published") return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${story.owner.handle}/${story.slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="project-workbench">
      {access === "creator" ? (
      <div className="project-console-bar">
        <div className="project-console-bar__identity">
          <span className="avatar">{initialsFrom(story.owner.name)}</span>
          <span>
            <strong>{story.name}</strong>
            <small>Owner workbench</small>
          </span>
        </div>

        <div className="view-switcher" role="tablist" aria-label="Project views">
          <button
            id="public-tab"
            role="tab"
            type="button"
            aria-selected={view === "public"}
            aria-controls="public-panel"
            className={view === "public" ? "is-active" : undefined}
            onClick={() => setView("public")}
          >
            <span className="view-status view-status--public" /> Public page
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
        </div>

        <div className="project-console-bar__actions">
          {view === "public" && !editing ? (
            <button className="button button--secondary button--small" type="button" onClick={startEditing}>
              Edit public page
            </button>
          ) : null}
          <button
            className="button button--dark button--small"
            type="button"
            onClick={() => void copyLink()}
            disabled={publicationStatus !== "published"}
            title={publicationStatus === "published" ? "Copy the public story URL" : "Publish the story before sharing it"}
          >
            {copied ? "Public link copied" : publicationStatus === "published" ? "Copy public link" : "Publish to share"} <span aria-hidden="true">↗</span>
          </button>
          {publicationStatus !== "published" ? (
            <button
              className="button button--primary button--small"
              type="button"
              onClick={publishChanges}
              disabled={saveState === "saving"}
            >
              {publicationStatus === "draft_changes" ? "Publish changes" : "Publish page"}
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

      {view === "public" ? (
        <div id="public-panel" role="tabpanel" aria-labelledby="public-tab">
          {editing ? (
            <form className="project-editor" onSubmit={saveDraft}>
              <div className="project-editor__header">
                <div>
                  <span className="section-index">EDITING PUBLIC PAGE</span>
                  <h2>Keep the facts. Make the story yours.</h2>
                </div>
                <span>
                  {saveState === "saving"
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
              <div className="project-editor__actions">
                <button className="button button--text" type="button" onClick={cancelEditing}>Cancel</button>
                <button className="button button--primary" type="submit">Save public draft</button>
              </div>
            </form>
          ) : null}

          <article className="build-story">
            <header className="build-story__hero section-wrap">
              <div className="build-story__hero-copy">
                <div className="story-kicker">
                  <span className={`status-dot status-dot--${story.status === "shipped" ? "shipped" : "building"}`} />
                  {story.status.toUpperCase()} · {story.dateRange.toUpperCase()}
                </div>
                <h1>{story.name}</h1>
                <p className="build-story__tagline">{tagline}</p>
                <div className="build-story__author">
                  <span className="avatar avatar--large">{initialsFrom(story.owner.name)}</span>
                  <span>
                    <strong>{story.owner.name}</strong>
                    <small>@{story.owner.handle} · {story.owner.role}</small>
                  </span>
                </div>
              </div>
              <div className="build-story__cover" aria-hidden="true">
                <span className="orbit orbit--one" />
                <span className="orbit orbit--two" />
                <span className="orbit orbit--three" />
                <span className="orbit-note orbit-note--one">{story.sessionCount} sessions</span>
                <span className="orbit-note orbit-note--two">{story.git.commits} commits</span>
                <span className="orbit-note orbit-note--three">{story.activeDays} days</span>
                <span className="cover-caption">BUILD / 0.1</span>
              </div>
            </header>

            <div className="story-stats section-wrap" aria-label="Build summary">
              <div><strong>{story.activeDays}</strong><span>active days</span></div>
              <div><strong>{story.sessionCount}</strong><span>AI sessions</span></div>
              <div><strong>{story.git.commits}</strong><span>commits</span></div>
              <div><strong>{story.git.additions.toLocaleString()}</strong><span>lines added</span></div>
              <div><strong>{story.models.length}</strong><span>models in the mix</span></div>
              <div>
                <strong>{story.tokenUsage ? compactNumber.format(story.tokenUsage.totalTokens) : "—"}</strong>
                <span>tokens processed</span>
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

                {story.profile ? (
                  <section className="story-section">
                    <span className="story-section__number">02</span>
                    <div>
                      <span className="story-section__label">BUILDER PROFILE</span>
                      <h2>{story.profile.archetype.name}</h2>
                      <p>{story.profile.archetype.rationale.join(" ")}</p>
                      <div className="profile-score-grid">
                        {Object.entries(story.profile.scores).map(([key, score]) => (
                          <div key={key}><strong>{score.value}</strong><span>{key === "productInstinct" ? "product instinct*" : key}</span></div>
                        ))}
                      </div>
                      <small>* Product instinct is a weak proxy derived from completion and plan-before-edit signals.</small>
                    </div>
                  </section>
                ) : null}

                {reflection ? (
                  <aside className="story-quote">
                    <span>WHAT CHANGED MY MIND</span>
                    <blockquote>“{reflection}”</blockquote>
                  </aside>
                ) : null}

                {storyPack ? <StoryPackView pack={storyPack} privateView={false} reviewedEvidence={reviewedEvidence} /> : <section className="story-section story-pack-empty" aria-live="polite">
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
                    <h2>{story.sessionCount} sessions, {story.git.commits} commits, and counting.</h2>
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
                <ReceiptCard story={story} />
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
              <SocialActions storyId={story.reportId ?? story.id} ownerHandle={story.owner.handle} />
              <CommentThread storyId={story.reportId ?? story.id} />
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

          <section className="publication-boundary-panel">
            <header>
              <div>
                <span className="section-index">PUBLICATION BOUNDARY</span>
                <h2>Choose the fields allowed onto the public page.</h2>
                <p>The source snapshot and session details remain private regardless of this selection.</p>
              </div>
              <div className={`publication-state publication-state--${publicationStatus}`}>
                <i /> {publicationStatus.replaceAll("_", " ")}
              </div>
            </header>
            <div className="public-field-grid">
              {fieldOptions.map((field) => {
                const checked = selectedFields.includes(field.id);
                return (
                  <label key={field.id} className={checked ? "is-selected" : ""}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={field.id === "tagline"}
                      onChange={() => togglePublicField(field.id)}
                    />
                    <span><strong>{field.label}</strong><small>{field.detail}</small></span>
                    <i aria-hidden="true">{checked ? "✓" : ""}</i>
                  </label>
                );
              })}
            </div>
            <footer>
              <span>
                {saveState === "error"
                  ? "Private report update failed."
                  : saveState === "saved"
                    ? "Private report selection saved."
                    : "Changes are private until you publish."}
              </span>
              <div>
                <button className="button button--secondary" type="button" onClick={saveFieldSelection} disabled={saveState === "saving"}>
                  Save private selection
                </button>
                <button className="button button--primary" type="button" onClick={publishChanges} disabled={saveState === "saving"}>
                  {publicationStatus === "published" ? "Republish page" : "Publish universal page"}
                </button>
                {publicationStatus === "published" ? <button className="button button--text" type="button" onClick={() => void unpublish()} disabled={saveState === "saving"}>Unpublish</button> : null}
              </div>
            </footer>
          </section>

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
              <header><span>03 / TOOL & MODEL USE</span><strong>Observed, not scored</strong></header>
              <div className="report-models">
                {story.models.map((model) => (
                  <div key={model.id}>
                    <span><strong>{model.label}</strong><small>{model.requests} turns</small></span>
                    <span>{model.share}%</span>
                  </div>
                ))}
              </div>
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
                <header><span>07 / AI-WRITTEN NARRATIVE</span><strong>Not requested</strong></header>
                <p>This scan didn&apos;t opt into narrative evidence, so no AI-written narrative was generated. Metrics above are unaffected.</p>
              </section>
            ) : resolvedNarrativeStatus === "narrative_no_evidence" ? (
              <section className="report-card report-card--narrative report-card--narrative-empty">
                <header><span>07 / AI-WRITTEN NARRATIVE</span><strong>No eligible evidence</strong></header>
                <p>Narrative evidence was requested, but no provider had an eligible excerpt to review - so no model was called. This is expected, not a failure.</p>
              </section>
            ) : (
              <section className="report-card report-card--narrative">
                <header><span>07 / AI-WRITTEN NARRATIVE</span><strong>{narrative?.mode === "cloud" ? "Cloud model" : "Local model"}</strong></header>
                {resolvedNarrativeStatus === "narrative_ready" && narrative?.sections ? (
                  storyPack ? <StoryPackView pack={storyPack} privateView reviewedEvidence={reviewedEvidence} fallbacksUsed={narrative.fallbacksUsed} /> : <div className="narrative-sections">
                    <h3>{narrative.sections.headline}</h3>
                    <p>{narrative.sections.narrative}</p>
                    <aside className="story-quote">
                      <span>TURNING POINT</span>
                      <blockquote>“{narrative.sections.turningPoint}”</blockquote>
                    </aside>
                    <ul>{narrative.sections.learnings.map((line) => <li key={line}>{line}</li>)}</ul>
                    {narrative.sections.decisionPatterns?.length ? <><h4>Decision patterns</h4><ul>{narrative.sections.decisionPatterns.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
                    {narrative.sections.standoutTraits?.length ? <><h4>Standout traits</h4><ul>{narrative.sections.standoutTraits.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
                    {narrative.sections.growthEdge ? <><h4>Growth edge</h4><p>{narrative.sections.growthEdge}</p></> : null}
                    {narrative.fallbacksUsed?.length ? (
                      <p className="narrative-fallback-note">
                        {narrative.fallbacksUsed.length === 1 ? "One section" : `${narrative.fallbacksUsed.length} sections`} used a default fallback instead of a model-written result ({narrative.fallbacksUsed.join(", ")}).
                      </p>
                    ) : null}
                    <small>{narrative.model} · {(narrative.costMicroUsd / 1_000_000).toFixed(4)} USD</small>
                  </div>
                ) : resolvedNarrativeStatus === "narrative_failed" ? (
                  <p>The narrative model could not generate a story for this scan after retrying. No further attempts are made automatically.</p>
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
          </div>
        </section>
      ) : null}
    </main>
  );
}
