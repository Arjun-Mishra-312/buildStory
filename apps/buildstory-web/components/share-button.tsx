"use client";

import { useState } from "react";
import { ShareDialog } from "./share-dialog";
import type { StoryBackgroundId } from "@/lib/background-options";

type ShareButtonProps = {
  path: string;
  title: string;
  /** Path to the downloadable share-card PNG, e.g. /api/share/story/<handle>/<slug>. The dialog always previews and shares this image. */
  downloadPath: string;
  storyBackgroundId?: StoryBackgroundId;
};

export function ShareButton({ path, title, downloadPath, storyBackgroundId }: ShareButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button type="button" className="button button--secondary button--small" onClick={() => setDialogOpen(true)}>
        Share the receipt <span aria-hidden="true">↗</span>
      </button>
      <ShareDialog open={dialogOpen} onClose={() => setDialogOpen(false)} path={path} title={title} imagePath={downloadPath} storyBackgroundId={storyBackgroundId} />
    </>
  );
}
