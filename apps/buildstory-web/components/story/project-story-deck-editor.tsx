"use client";

import { useMemo, useState } from "react";
import type { ProjectStoryManifestV1, StoryDeckConfigV1 } from "@/lib/story/project-story";

export function ProjectStoryDeckEditor({
  manifest,
  initialConfig,
  onSave,
}: {
  manifest: ProjectStoryManifestV1;
  initialConfig?: StoryDeckConfigV1;
  onSave: (config: StoryDeckConfigV1) => void;
}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<StoryDeckConfigV1>(initialConfig ?? { version: "1.0", enabled: true, frameOrder: [], hiddenFrameIds: [], featuredSignalId: null });
  const orderedFrames = useMemo(() => {
    const byId = new Map(manifest.frames.map((frame) => [frame.id, frame]));
    return [
      ...config.frameOrder.map((id) => byId.get(id)).filter((frame): frame is ProjectStoryManifestV1["frames"][number] => Boolean(frame)),
      ...manifest.frames.filter((frame) => !config.frameOrder.includes(frame.id)),
    ];
  }, [config.frameOrder, manifest.frames]);

  function update(next: Partial<StoryDeckConfigV1>) {
    setConfig((current) => ({ ...current, ...next }));
  }

  function toggleFrame(id: string) {
    const hidden = new Set(config.hiddenFrameIds);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    update({ hiddenFrameIds: [...hidden] });
  }

  function move(id: string, direction: -1 | 1) {
    const ids = orderedFrames.map((frame) => frame.id);
    const index = ids.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
    update({ frameOrder: ids });
  }

  return (
    <section className="story-deck-editor">
      <button type="button" className="button button--secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "Close Project Story editor" : "Shape Project Story"}
      </button>
      {open ? (
        <div className="story-deck-editor__panel">
          <header><div><span className="section-index">PROJECT STORY DECK</span><h2>Choose the frames worth sharing.</h2><p>Buildstory drafts the sequence from the public preview. You can hide, reorder, or feature a fact before publishing.</p></div><label><input type="checkbox" checked={config.enabled} onChange={(event) => update({ enabled: event.target.checked })} /> Enabled</label></header>
          <ol>
            {orderedFrames.map((frame, index) => {
              const hidden = config.hiddenFrameIds.includes(frame.id);
              const signalId = frame.id === "fact" && frame.block?.id.startsWith("signal:") ? frame.block.id.slice("signal:".length) : null;
              const featured = Boolean(signalId && config.featuredSignalId === signalId);
              return <li className={hidden ? "is-hidden" : undefined} key={frame.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{frame.eyebrow}</strong><p>{frame.title}</p></div><button type="button" onClick={() => move(frame.id, -1)} disabled={index === 0} aria-label={`Move ${frame.title} earlier`}>↑</button><button type="button" onClick={() => move(frame.id, 1)} disabled={index === orderedFrames.length - 1} aria-label={`Move ${frame.title} later`}>↓</button>{signalId ? <button type="button" onClick={() => update({ featuredSignalId: featured ? null : signalId })}>{featured ? "Featured" : "Feature"}</button> : null}<button type="button" onClick={() => toggleFrame(frame.id)}>{hidden ? "Show" : "Hide"}</button></li>;
            })}
          </ol>
          <footer><button type="button" className="button button--primary" onClick={() => onSave(config)}>Save private deck</button><small>Publishing freezes the selected deck into the public story.</small></footer>
        </div>
      ) : null}
    </section>
  );
}
