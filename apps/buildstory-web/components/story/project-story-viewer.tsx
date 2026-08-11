"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectStoryManifestV1, ProjectStoryFrame } from "@/lib/story/project-story";
import { ReportBlockView } from "@/components/report/report-block";
import type { StoryEventType } from "@/lib/story/events";

function frameMetric(frame: ProjectStoryFrame): string | null {
  return frame.metric ? `${frame.metric.value} ${frame.metric.label}` : null;
}

export function ProjectStoryViewer({ manifest, downloadPath }: { manifest: ProjectStoryManifestV1; downloadPath: string }) {
  const frames = manifest.frames;
  const [index, setIndex] = useState(0);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const [pointerStart, setPointerStart] = useState<number | null>(null);
  const frame = frames[index] ?? frames[0];
  const reportUrl = useMemo(() => typeof window === "undefined" ? manifest.reportPath : `${window.location.origin}${manifest.reportPath}`, [manifest.reportPath]);

  function track(eventType: StoryEventType, frameId = frame?.id) {
    if (!manifest.reportId) return;
    void fetch("/api/story/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId: manifest.reportId, eventType, frameId }),
      keepalive: true,
    }).catch(() => undefined);
  }

  useEffect(() => {
    track("story_open", "");
    // The event is intentionally best-effort and carries no identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest.reportId]);

  useEffect(() => {
    if (frame) track("story_frame_view", frame.id);
    if (frame && index === frames.length - 1) track("story_complete", frame.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, frame?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setIndex((current) => Math.min(frames.length - 1, current + 1));
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Home") {
        setIndex(0);
      } else if (event.key === "End") {
        setIndex(frames.length - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frames.length]);

  if (!frame) return null;

  async function shareStory() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${manifest.projectName} · Project Story`, text: "A Buildstory Project Story", url: reportUrl });
        track("story_device_share", frame.id);
        setShareState("shared");
        return;
      }
      await navigator.clipboard.writeText(reportUrl);
      track("story_copy_link", frame.id);
      setShareState("copied");
    } catch {
      setShareState("idle");
    }
  }

  function moveBy(delta: number) {
    setIndex((current) => Math.max(0, Math.min(frames.length - 1, current + delta)));
  }

  const frameDownloadUrl = `${downloadPath}${downloadPath.includes("?") ? "&" : "?"}frame=${encodeURIComponent(frame.id)}`;

  return (
    <main className="project-story-page">
      <div className="project-story__topbar">
        <Link className="project-story__brand" href="/">BUILDSTORY</Link>
        <span>{manifest.projectName} · PROJECT STORY</span>
        <a href={manifest.reportPath} onClick={() => track("story_report_click", frame?.id)}>Full report ↗</a>
      </div>

      <section className="project-story" aria-label={`${manifest.projectName} Project Story`}>
        <div className="project-story__progress" role="tablist" aria-label="Story frames">
          {frames.map((candidate, candidateIndex) => (
            <button
              type="button"
              role="tab"
              aria-selected={candidateIndex === index}
              aria-label={`Open frame ${candidateIndex + 1}: ${candidate.eyebrow}`}
              className={candidateIndex === index ? "is-active" : undefined}
              key={candidate.id}
              onClick={() => setIndex(candidateIndex)}
            />
          ))}
        </div>

        <div
          className={`project-story__frame project-story__frame--${frame.kind}`}
          onPointerDown={(event) => setPointerStart(event.clientX)}
          onPointerUp={(event) => {
            if (pointerStart === null) return;
            const distance = event.clientX - pointerStart;
            setPointerStart(null);
            if (Math.abs(distance) > 44) moveBy(distance < 0 ? 1 : -1);
          }}
          onPointerCancel={() => setPointerStart(null)}
        >
          <span className="project-story__eyebrow">{frame.eyebrow}</span>
          <div className="project-story__copy">
            <h1>{frame.title}</h1>
            {frame.summary ? <p>{frame.summary}</p> : null}
            {frame.metric ? <strong className="project-story__metric">{frameMetric(frame)}</strong> : null}
            {frame.block ? <ReportBlockView block={frame.block} /> : null}
          </div>
          {frame.kind === "receipt" ? <div className="project-story__receipt"><span>REDACTED LOCALLY</span><span>PRIVATE BY DEFAULT</span><span>PUBLISHING OPTIONAL</span></div> : null}
        </div>

        <div className="project-story__controls">
          <button type="button" className="button button--secondary" onClick={() => moveBy(-1)} disabled={index === 0} aria-label="Previous story frame">←</button>
          <span>{index + 1} / {frames.length}</span>
          <button type="button" className="button button--secondary" onClick={() => moveBy(1)} disabled={index === frames.length - 1} aria-label="Next story frame">→</button>
        </div>

        <div className="project-story__actions">
          <a className="button button--primary" href={manifest.reportPath} onClick={() => track("story_report_click", frame.id)}>{frame.kind === "outcome" ? "Open full report" : "View full report"}</a>
          <a className="button button--secondary" href={frameDownloadUrl} onClick={() => track("story_frame_download", frame.id)} download={`buildstory-${manifest.projectName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}-${frame.id}.png`}>Download frame</a>
          <button type="button" className="button button--text" onClick={() => { track("story_share_open", frame.id); void shareStory(); }}>{shareState === "shared" ? "Shared" : shareState === "copied" ? "Link copied" : "Share story"}</button>
        </div>
      </section>

      <ol className="project-story__fallback" aria-label="Project Story frames">
        {frames.map((candidate) => <li key={candidate.id}><span>{candidate.eyebrow}</span><h2>{candidate.title}</h2>{candidate.summary ? <p>{candidate.summary}</p> : null}</li>)}
      </ol>
    </main>
  );
}
