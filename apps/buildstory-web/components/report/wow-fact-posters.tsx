"use client";

import { useState } from "react";
import type { Signal } from "@/lib/ingestion/scanner-project-snapshot";
import {
  featuredSignals,
  formatSignalUnit,
  formatSignalValue,
  howWeKnowForSignal,
  illustrationForSignal,
  kickerForFamily,
} from "@/lib/report/poster-art";
import { RecapSaveButton } from "./recap-save-button";
import { Tooltip } from "@/components/shell/tooltip";

export function WowFactPosters({
  signals,
  limit = 3,
  assembling = false,
  saveBasePath,
  className,
}: {
  signals: Signal[];
  limit?: number;
  assembling?: boolean;
  saveBasePath?: string;
  className?: string;
}) {
  const featured = featuredSignals(signals, limit);
  if (!featured.length) return null;
  return (
    <section className={`wow-posters${assembling ? " wow-posters--assembling" : ""}${className ? ` ${className}` : ""}`} aria-label="Facts from this build">
      {featured.map((signal, index) => (
        <WowFactPoster key={signal.id} signal={signal} index={index} saveHref={saveBasePath ? `${saveBasePath}/signature-${encodeURIComponent(signal.id)}` : undefined} />
      ))}
    </section>
  );
}

function WowFactPoster({ signal, index, saveHref }: { signal: Signal; index: number; saveHref?: string }) {
  const [savedHint, setSavedHint] = useState(false);
  const unit = formatSignalUnit(signal);
  return (
    <article className="wow-poster" data-family={signal.family} style={{ animationDelay: `${index * 80}ms` }}>
      <header>
        <span>{kickerForFamily(signal.family)}</span>
        {saveHref ? <RecapSaveButton href={saveHref} onSaved={() => setSavedHint(true)} /> : null}
      </header>
      <div className="wow-poster__body">
        <div>
          <strong className="wow-poster__giant">
            {formatSignalValue(signal)}
            {unit ? <small>{unit}</small> : null}
          </strong>
          <h3>{signal.headline}</h3>
          <p>{signal.detail}</p>
          <Tooltip label={howWeKnowForSignal(signal)} side="bottom">
            <small className="wow-poster__know">How we know</small>
          </Tooltip>
          {savedHint ? <small>Saved</small> : null}
        </div>
        <div className="wow-poster__art" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={illustrationForSignal(signal)} alt="" />
        </div>
      </div>
    </article>
  );
}
