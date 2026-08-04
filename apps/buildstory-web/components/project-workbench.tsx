"use client";

import { FormEvent, useState } from "react";
import type { BuildStoryViewModel, PublicBuildStoryViewModel } from "@/lib/build-story";
import type { PublicationStatus, PublicFieldKey } from "@/lib/ingestion/contracts";
import { ReceiptCard } from "./receipt-card";

type ProjectWorkbenchProps = {
  story: BuildStoryViewModel | PublicBuildStoryViewModel;
  access?: "public" | "creator";
  reportId?: string;
  initialPublicationStatus?: PublicationStatus;
  initialSelectedPublicFields?: PublicFieldKey[];
};

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

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
];

export function ProjectWorkbench({
  story,
  access = "creator",
  reportId,
  initialPublicationStatus = "not_published",
  initialSelectedPublicFields = fieldOptions.map((field) => field.id),
}: ProjectWorkbenchProps) {
  const privateStory = access === "creator" ? (story as BuildStoryViewModel) : null;
  const [view, setView] = useState<"public" | "private">("public");
  const [editing, setEditing] = useState(false);
  const [tagline, setTagline] = useState(story.tagline);
  const [description, setDescription] = useState(story.description);
  const [reflection, setReflection] = useState(
    "AI made it cheap to explore three architectures. Tester feedback made it obvious which one deserved to survive.",
  );
  const [draft, setDraft] = useState({ tagline, description, reflection });
  const [copied, setCopied] = useState(false);
  const [selectedFields, setSelectedFields] = useState<PublicFieldKey[]>(initialSelectedPublicFields);
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus>(initialPublicationStatus);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
    const response = await fetch(`/api/creator/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedPublicFields: selectedFields }),
    });
    if (response.ok) {
      setPublicationStatus((current) => current === "published" ? "draft_changes" : current);
      setSaveState("saved");
    } else {
      setSaveState("error");
    }
  }

  async function publishChanges() {
    if (!reportId) return;
    setSaveState("saving");
    const response = await fetch(`/api/creator/reports/${reportId}/publish`, { method: "POST" });
    if (response.ok) {
      setPublicationStatus("published");
      setSaveState("saved");
    } else {
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
    try {
      await navigator.clipboard.writeText(window.location.href);
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
          <span className="avatar">{initials(story.owner.name)}</span>
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
          <button className="button button--dark button--small" type="button" onClick={copyLink}>
            {copied ? "Link copied" : "Share preview"} <span aria-hidden="true">↗</span>
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
          <a href="/signin?callbackUrl=/dashboard">Creator controls →</a>
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
                  <span className="avatar avatar--large">{initials(story.owner.name)}</span>
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

                <aside className="story-quote">
                  <span>WHAT CHANGED MY MIND</span>
                  <blockquote>“{reflection}”</blockquote>
                </aside>

                <section className="story-section">
                  <span className="story-section__number">02</span>
                  <div>
                    <span className="story-section__label">THE BUILD</span>
                    <h2>
                      {story.milestones.length} moment{story.milestones.length === 1 ? "" : "s"} that changed
                      the shape of it.
                    </h2>
                    <div className="milestone-list">
                      {story.milestones.map((milestone) => (
                        <article className="milestone" key={milestone.id}>
                          <div className="milestone__rail">
                            <span>{String(milestone.index).padStart(2, "0")}</span>
                            <i />
                          </div>
                          <div>
                            <small>{milestone.date} · {milestone.kind}</small>
                            <h3>{milestone.title}</h3>
                            <p>{milestone.description}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>

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
          </div>
        </section>
      ) : null}
    </main>
  );
}
