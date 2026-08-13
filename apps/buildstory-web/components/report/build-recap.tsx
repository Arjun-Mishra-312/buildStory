"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import type { RecapScript, RecapSlide } from "@/lib/report/recap";
import {
  COUNT_UP_MS,
  durationForSlide,
  formatRecapCount,
  parseRecapNumber,
  recapMutedStorageKey,
  recapShowsArt,
  textScaleForSlide,
} from "@/lib/report/recap";
import type { RecapBar, RecapRankedItem, RecapStatTile, RecapStreakRange, RecapWidget } from "@/lib/report/recap-widgets";
import { ReceiptCard } from "@/components/receipt-card";
import { RecapSaveButton } from "./recap-save-button";
type ReceiptStory = Parameters<typeof ReceiptCard>[0]["story"];

const AUDIO_SRC = "/assets/audio/recap-loop.mp3";
const HOLD_MS = 280;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function countedStartValue(raw: string | undefined): string {
  if (!raw) return "";
  const parts = parseRecapNumber(raw);
  if (!parts || parts.compound) return raw;
  return formatRecapCount(parts, 0);
}

function useCountedValue(raw: string | undefined, paused: boolean) {
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const [display, setDisplay] = useState(() => countedStartValue(raw));
  const [seenRaw, setSeenRaw] = useState(raw);
  if (raw !== seenRaw) {
    setSeenRaw(raw);
    setDisplay(countedStartValue(raw));
  }

  useEffect(() => {
    if (!raw) return undefined;
    const parts = parseRecapNumber(raw);
    if (!parts || parts.compound) return undefined;
    if (prefersReducedMotion()) {
      const frame = window.requestAnimationFrame(() => setDisplay(raw));
      return () => window.cancelAnimationFrame(frame);
    }
    let frame = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (!pausedRef.current) elapsed += delta;
      const t = Math.min(1, elapsed / COUNT_UP_MS);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(formatRecapCount(parts, parts.value * eased));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [raw]);

  return display;
}

function readStoredMute(): boolean | null {
  try {
    const value = window.localStorage.getItem(recapMutedStorageKey());
    if (value === "1") return true;
    if (value === "0") return false;
  } catch {
    // Preference is session-only when storage is unavailable.
  }
  return null;
}

function writeStoredMute(muted: boolean) {
  try {
    window.localStorage.setItem(recapMutedStorageKey(), muted ? "1" : "0");
  } catch {
    // Preference is session-only when storage is unavailable.
  }
}

export function BuildRecap({
  script,
  audience,
  receiptStory,
  saveBasePath,
  startedByGesture = false,
  onClose,
}: {
  script: RecapScript;
  audience: "creator" | "visitor";
  receiptStory?: ReceiptStory;
  saveBasePath?: string;
  startedByGesture?: boolean;
  onClose: () => void;
}) {
  const slides = script.slides;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const storedMute = typeof window === "undefined" ? null : readStoredMute();
  const [muted, setMuted] = useState(() => storedMute === true || !startedByGesture);
  const [needsGesture, setNeedsGesture] = useState(() => !startedByGesture && storedMute !== true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const holdTimer = useRef(0);
  const holding = useRef(false);
  const slide = slides[index];
  const last = index >= slides.length - 1;

  // Mount-only: start the loop (muted on auto-open). Mute changes use the effect below.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.muted = muted;
    const attempt = audio.play();
    if (attempt) {
      void attempt.catch(() => {
        setMuted(true);
        setNeedsGesture(true);
      });
    }
    return () => {
      audio.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (muted) return;
    void audio.play().then(() => setNeedsGesture(false)).catch(() => {
      setMuted(true);
      setNeedsGesture(true);
    });
  }, [muted]);

  useEffect(() => {
    const onVis = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden) audio.pause();
      else if (!muted) void audio.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [muted]);

  const go = useCallback((delta: number) => {
    setPaused(false);
    setIndex((current) => Math.max(0, Math.min(slides.length - 1, current + delta)));
  }, [slides.length]);

  useEffect(() => {
    if (paused || last || !slide) return undefined;
    const ms = durationForSlide(slide.kind, slide.beat, slide.layout);
    const timer = window.setTimeout(() => setIndex((current) => Math.min(slides.length - 1, current + 1)), ms);
    return () => window.clearTimeout(timer);
  }, [index, last, paused, slide, slides.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        go(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!slide) return null;
  const displayed = slide.kind === "close" && audience === "visitor"
    ? { ...slide, kicker: "Your turn", headline: "Every build has a story.", body: "This one was generated from AI coding sessions — privately, until the builder shared it." }
    : slide;
  const duration = durationForSlide(displayed.kind, displayed.beat, displayed.layout);

  function isChrome(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, .recap-save, .build-recap__cta, .build-recap__sound"));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isChrome(event.target)) return;
    holding.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holding.current = true;
      setPaused(true);
    }, HOLD_MS);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    window.clearTimeout(holdTimer.current);
    if (isChrome(event.target)) return;
    if (holding.current) {
      holding.current = false;
      setPaused(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    go(x < rect.width * 0.3 ? -1 : 1);
  }

  function onPointerCancel() {
    window.clearTimeout(holdTimer.current);
    if (holding.current) {
      holding.current = false;
      setPaused(false);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    writeStoredMute(next);
    if (!next) setNeedsGesture(false);
  }

  return (
    <div
      className="build-recap"
      data-kind={displayed.kind}
      role="dialog"
      aria-modal="true"
      aria-label="Build recap"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <audio ref={audioRef} src={AUDIO_SRC} loop preload="auto" playsInline />
      <div className="build-recap__ghost" aria-hidden="true" />
      <div
        className="build-recap__phone"
        data-kind={displayed.kind}
        data-paused={paused ? "" : undefined}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerCancel}
        onPointerCancel={onPointerCancel}
      >
        <div className="build-recap__progress" aria-hidden="true">
          {slides.map((item, itemIndex) => (
            <i
              key={item.id}
              className={itemIndex < index ? "is-done" : itemIndex === index ? "is-active" : undefined}
            >
              <b
                key={`${item.id}-${itemIndex === index ? index : "idle"}`}
                style={itemIndex === index ? { animationDuration: `${duration}ms` } : undefined}
              />
            </i>
          ))}
        </div>
        <header className="build-recap__chrome">
          <span>{audience === "visitor" ? "A build recap" : "Only you can see this"}</span>
          <div>
            <button
              className="button button--text build-recap__icon"
              type="button"
              aria-label={muted ? "Unmute recap" : "Mute recap"}
              onClick={toggleMute}
            >
              {muted ? <VolumeX size={16} strokeWidth={2.2} /> : <Volume2 size={16} strokeWidth={2.2} />}
            </button>
            {saveBasePath ? (
              <RecapSaveButton
                href={`${saveBasePath}/${encodeURIComponent(displayed.id)}`}
                label={displayed.kind === "receipt" ? "Save receipt" : "Save image"}
                variant="icon"
              />
            ) : null}
            <button
              className="button button--text build-recap__icon"
              type="button"
              aria-label="Close recap"
              onClick={onClose}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        </header>
        <div className="build-recap__stage">
          <RecapSlideView key={displayed.id} slide={displayed} receiptStory={receiptStory} paused={paused} />
        </div>
        {last ? (
          <div className="build-recap__cta">
            {audience === "visitor" ? (
              <>
                <a className="button button--primary" href="/signin?callbackUrl=/studio/connect">Create yours</a>
                <button className="button button--text" type="button" onClick={onClose}>Read the full story</button>
              </>
            ) : (
              <button className="button button--primary" type="button" onClick={onClose}>Open your recap</button>
            )}
          </div>
        ) : null}
        {muted && needsGesture ? (
          <button className="build-recap__sound" type="button" onClick={toggleMute}>
            <VolumeX size={16} strokeWidth={2.2} />
            Tap for sound
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RecapBars({ bars }: { bars: RecapBar[] }) {
  return (
    <ol className="build-recap__bars">
      {bars.map((bar) => (
        <li key={bar.key} data-peak={bar.peak ? "" : undefined}>
          <span>{bar.label}</span>
          <b className="build-recap__track">
            <i style={{ ["--share" as string]: bar.share }} />
          </b>
          <em>{bar.count || ""}</em>
        </li>
      ))}
    </ol>
  );
}

function RecapStatGrid({ tiles }: { tiles: RecapStatTile[] }) {
  return (
    <ul className="build-recap__grid">
      {tiles.map((tile) => (
        <li key={tile.label} className="build-recap__glass">
          <strong>{tile.value}</strong>
          <span>{tile.label}</span>
        </li>
      ))}
    </ul>
  );
}

function RankedMark({ item }: { item: RecapRankedItem }) {
  if (item.markSrc) {
    return (
      <span
        className="model-mark build-recap__ranked-mark"
        style={{ maskImage: `url(${item.markSrc})`, WebkitMaskImage: `url(${item.markSrc})` }}
        aria-hidden="true"
      />
    );
  }
  if (!item.visual) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.visual} alt="" />
  );
}

function RecapRanked({ items }: { items: RecapRankedItem[] }) {
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <div className="build-recap__ranked">
      <div className="build-recap__glass build-recap__ranked-lead">
        <RankedMark item={lead} />
        <div>
          <span>#{lead.rank}</span>
          <strong>{lead.title}</strong>
          <small>{lead.subtitle}</small>
        </div>
        <em>{lead.value}</em>
      </div>
      <ol className="build-recap__ranked-list">
        {rest.map((item) => (
          <li key={item.rank}>
            <b>{item.rank}</b>
            <RankedMark item={item} />
            <div>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </div>
            <em>{item.value}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RecapStreaks({ others }: { others: RecapStreakRange[] }) {
  if (!others.length) return null;
  return (
    <div className="build-recap__streaks">
      <span>Other streaks</span>
      {others.map((item) => (
        <div key={`${item.start}-${item.end}`} className="build-recap__glass">
          <strong>{item.days} days</strong>
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}

function RecapWidgetView({ widget }: { widget: RecapWidget }) {
  if (widget.type === "stat-grid") return <RecapStatGrid tiles={widget.tiles} />;
  if (widget.type === "ranked") return <RecapRanked items={widget.items} />;
  if (widget.type === "hour-bars") return <RecapBars bars={widget.bars} />;
  if (widget.type === "weekday") return <RecapBars bars={widget.bars} />;
  return <RecapStreaks others={widget.others} />;
}

function RecapSlideView({
  slide,
  receiptStory,
  paused,
}: {
  slide: RecapSlide;
  receiptStory?: ReceiptStory;
  paused: boolean;
}) {
  const counted = useCountedValue(slide.giantValue, paused);
  if (slide.kind === "receipt" && receiptStory) {
    return (
      <article className="build-recap__slide build-recap__slide--receipt" data-kind="receipt">
        <div className="recap-printer">
          <div className="recap-printer__body" aria-hidden="true">
            <span className="recap-printer__lcd">Printing</span>
          </div>
          <div className="recap-printer__paper">
            <div className="build-recap__receipt">
              <ReceiptCard story={receiptStory} storyFit />
            </div>
          </div>
        </div>
      </article>
    );
  }
  const scale = textScaleForSlide(slide);
  const showArt = recapShowsArt(slide);
  const giant = Boolean(slide.giantValue);
  const layout = slide.layout && slide.layout !== "copy" ? slide.layout : undefined;
  const supporting = [slide.body, slide.beat !== "setup" && !layout ? slide.howWeKnow : undefined]
    .map((text) => text?.trim() ?? "")
    .filter((text, index, list) => text && text !== slide.headline && list.indexOf(text) === index);
  return (
    <article
      className={`build-recap__slide build-recap__slide--${slide.kind}`}
      data-kind={slide.kind}
      data-beat={slide.beat}
      data-scale={scale}
      data-giant={giant ? "" : undefined}
      data-art={showArt ? "" : undefined}
      data-layout={layout}
    >
      {showArt ? (
        <div className="build-recap__visual" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.visual} alt="" />
        </div>
      ) : null}
      <div className={`build-recap__copy${giant ? " build-recap__copy--giant" : ""}${layout ? " build-recap__copy--widget" : ""}`}>
        <span className="build-recap__kicker">{slide.kicker}</span>
        {giant ? (
          <strong className="build-recap__giant">
            {counted}
            {slide.giantLabel ? <small>{slide.giantLabel}</small> : null}
          </strong>
        ) : (
          <h2 className="build-recap__slam">{slide.headline}</h2>
        )}
        {slide.widget ? <RecapWidgetView widget={slide.widget} /> : null}
        {layout && giant ? <h2 className="build-recap__headline">{slide.headline}</h2> : null}
        {giant && !layout ? (
          <div className="build-recap__after">
            <h2 className="build-recap__headline">{slide.headline}</h2>
            {supporting.map((text) => (
              <p className="build-recap__body" key={text}>{text}</p>
            ))}
          </div>
        ) : supporting.map((text) => (
          <p className="build-recap__body" key={text}>{text}</p>
        ))}
      </div>
    </article>
  );
}
