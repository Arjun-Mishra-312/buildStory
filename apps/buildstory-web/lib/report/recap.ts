import type { ReportStoryPack, Signal, SignalFamily, StoryPackSignalFinding } from "@/lib/ingestion/scanner-project-snapshot";
import { buildTurningBeat } from "./public-brief";
import {
  featuredSignals,
  formatSignalUnit,
  formatSignalValue,
  howWeKnowForSignal,
  illustrationForArchetype,
  illustrationForSignal,
  illustrationForSlideKind,
  kickerForFamily,
  type RecapSlideKind,
} from "./poster-art";
import {
  computeRecapWidgets,
  formatRecapHours,
  isRecapLayout,
  widgetForLayout,
  type RecapLayout,
  type RecapWidget,
  type RecapWidgets,
} from "./recap-widgets";

export type { RecapSlideKind, RecapLayout, RecapWidget };

export type RecapBeat = "setup" | "reveal";

export type RecapTextScale = "large" | "medium";

export type RecapSlide = {
  id: string;
  kind: RecapSlideKind;
  kicker: string;
  headline: string;
  body: string;
  visual: string;
  beat?: RecapBeat;
  signalId?: string;
  sourceRefs: string[];
  howWeKnow?: string;
  giantValue?: string;
  giantLabel?: string;
  textScale?: RecapTextScale;
  family?: SignalFamily;
  layout?: RecapLayout;
  widget?: RecapWidget;
};

export type RecapScript = {
  slides: RecapSlide[];
  source: "authored" | "deterministic";
};

export type RecapContext = {
  projectName: string;
  sessionCount: number;
  activeDays: number;
  commits: number;
  buildHours: number;
  filesTouched?: number;
  costMicroUsd?: number | null;
  status?: string;
  archetypeName?: string | null;
  pack: ReportStoryPack | null;
  signals?: Signal[];
  sessions?: Array<{ startedAt: string }>;
  models?: Array<{ id: string; label: string; requests: number; share?: number | null; provider?: string | null }>;
  peakHours?: number[];
  utcOffsetMinutes?: number;
};

const SLIDE_KINDS = new Set<RecapSlideKind>(["title", "scale", "signature", "turning", "receipt", "close"]);
const MAX_SLIDES = 12;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function signalsOf(context: RecapContext): Signal[] {
  if (context.signals?.length) return context.signals;
  return context.pack?.signals ?? [];
}

function surpriseFacts(pack: ReportStoryPack | null): StoryPackSignalFinding[] {
  if (!pack || pack.version !== "3.0.0") return [];
  const deep = pack.deepAnalysis;
  if (!deep) return [];
  const extras = deep.surpriseFacts ?? [];
  if (extras.length) return extras.slice(0, 3);
  return (deep.byTheNumbers ?? []).slice(0, 3);
}

function authoredRecapSlides(pack: ReportStoryPack | null): RecapSlide[] {
  if (!pack) return [];
  const raw = pack.recap?.slides ?? (pack.version === "3.0.0" ? pack.deepAnalysis?.recap?.slides : undefined);
  if (!Array.isArray(raw) || raw.length < 4) return [];
  const allowedSignals = new Map((pack.signals ?? []).map((signal) => [signal.id, signal]));
  const slides: RecapSlide[] = [];
  for (const [index, entry] of raw.slice(0, MAX_SLIDES).entries()) {
    if (!entry || typeof entry !== "object") continue;
    const kind = SLIDE_KINDS.has(entry.kind as RecapSlideKind) ? entry.kind as RecapSlideKind : null;
    if (!kind) continue;
    const headline = entry.headline?.trim();
    if (!headline) continue;
    const signal = typeof entry.signalId === "string" ? allowedSignals.get(entry.signalId) : undefined;
    if (entry.signalId && !signal) continue;
    const textScale = entry.textScale === "large" || entry.textScale === "medium"
      ? entry.textScale
      : undefined;
    const layout = isRecapLayout(entry.layout) ? entry.layout : undefined;
    const signalBound = signal
      ? {
          signalId: signal.id,
          family: signal.family,
          howWeKnow: howWeKnowForSignal(signal),
          ...(kind === "signature"
            ? {}
            : { giantValue: formatSignalValue(signal), giantLabel: formatSignalUnit(signal) }),
        }
      : {};
    slides.push({
      id: `authored-${kind}-${index}`,
      kind,
      kicker: signatureKicker(kind, signal, entry.kicker),
      headline,
      body: entry.body?.trim() || "",
      visual: illustrationForSlideKind(kind, signal ?? null),
      ...(textScale ? { textScale } : {}),
      ...signalBound,
      ...(layout ? { layout } : {}),
      sourceRefs: Array.isArray(entry.sourceRefs) ? entry.sourceRefs.filter((ref): ref is string => typeof ref === "string").slice(0, 4) : [],
    });
  }
  return slides.length >= 4 ? expandFactBeats(slides, pack) : [];
}

function fitHeadline(text: string, scale: RecapTextScale): string {
  const max = scale === "large" ? 90 : 140;
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max - 1).replace(/\s+\S*$/, "");
  return `${cut || trimmed.slice(0, max - 1)}…`;
}

export function textScaleForSlide(slide: RecapSlide): RecapTextScale {
  if (slide.textScale === "large" || slide.textScale === "medium") return slide.textScale;
  if (slide.giantValue) return "medium";
  return slide.headline.length > 70 ? "medium" : "large";
}

export function recapShowsArt(slide: RecapSlide): boolean {
  if (slide.layout && slide.layout !== "copy" && slide.layout !== "streak" && slide.layout !== "ranked") return false;
  if (slide.kind === "receipt" || slide.kind === "scale" || slide.kind === "turning") return false;
  if (slide.giantValue || slide.beat === "reveal") return false;
  if (slide.layout === "ranked") return false;
  return slide.kind === "title" || slide.kind === "close" || slide.beat === "setup" || slide.layout === "streak";
}

function fitSlide(slide: RecapSlide): RecapSlide {
  const textScale = textScaleForSlide(slide);
  return {
    ...slide,
    textScale,
    headline: slide.giantValue ? slide.headline : fitHeadline(slide.headline, textScale),
  };
}

function formatStoryDate(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(ms));
}

function formatWeekday(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return WEEKDAYS[new Date(ms).getUTCDay()] ?? null;
}

function weekdayFromText(text: string): string | null {
  const match = text.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?\b/i);
  if (!match?.[1]) return null;
  const name = match[1].toLowerCase();
  return WEEKDAYS.find((day) => day.toLowerCase() === name) ?? null;
}

function occurredAtForSignal(signal: Signal, pack: ReportStoryPack | null): string | null {
  if (!pack || !("sources" in pack)) return null;
  for (const ref of signal.sourceRefs) {
    const source = pack.sources.find((item) => item.ref === ref);
    if (source?.occurredAt) return source.occurredAt;
  }
  const match = `${signal.headline} ${signal.detail}`.match(/\d{4}-\d{2}-\d{2}/);
  return match ? `${match[0]}T12:00:00.000Z` : null;
}

function setupLineForSignal(signal: Signal, pack: ReportStoryPack | null): string {
  const when = occurredAtForSignal(signal, pack);
  const date = when ? formatStoryDate(when) : null;
  const weekday = when ? formatWeekday(when) : weekdayFromText(`${signal.headline} ${signal.detail}`);
  const id = signal.id.toLowerCase();
  if (id.includes("longest")) return date ? `You really got it going on ${date}.` : "You really got it going in one sitting.";
  if (id.includes("token")) return date ? `You blew it out of the park on ${date}.` : "You blew it out of the park in a single session.";
  if (id.includes("weekday") || id.includes("weekend")) {
    const day = weekdayFromText(signal.headline) ?? weekday;
    return day ? `You really liked working on ${day}s on this project.` : "Weekends did a lot of the heavy lifting.";
  }
  if (id.includes("busiest") || id.includes("active-day")) {
    if (weekday) return `You really liked working on ${weekday}s on this project.`;
    return date ? `One day carried more of this build than the rest: ${date}.` : "Some days on this build were just different.";
  }
  if (id.includes("night")) return "The clock did not matter much on this one.";
  if (id.includes("tool") || id.includes("exec")) return "You did not stick to one way of working.";
  if (id.includes("line") || id.includes("commit")) return "The commits on this one were not small.";
  if (id.includes("cache")) return "The model remembered more of this build than you'd think.";
  if (id.includes("subagent")) return "You did not do every stretch of this one yourself.";
  if (id.includes("turn")) return date ? `The conversation got long on ${date}.` : "One conversation really ran.";
  if (signal.family === "rhythm") return date ? `Something in the rhythm shifted on ${date}.` : "Your rhythm on this build had a signature.";
  if (signal.family === "spend") return date ? `The meter jumped on ${date}.` : "One stretch of this build was expensive in the best way.";
  return date ? `This one had a moment on ${date}.` : "Here's the part you'll remember.";
}

function revealLineForSignal(signal: Signal, findingSummary?: string): string {
  const summary = findingSummary?.trim();
  if (summary && !/^\d/.test(summary)) return summary;
  const id = signal.id.toLowerCase();
  if (id.includes("longest")) return "One session, straight through.";
  if (id.includes("token")) return "In a single session.";
  if (id.includes("weekday") || id.includes("weekend")) return "That was your most active day of the week.";
  if (id.includes("busiest")) return "That day took more sessions than the rest.";
  if (id.includes("night")) return "Those sessions started after 10pm.";
  if (id.includes("tool") || id.includes("exec")) return "Different jobs, different tools.";
  if (id.includes("line") || id.includes("commit")) return "Per commit, on average.";
  if (id.includes("cache")) return "Served from cache.";
  if (id.includes("subagent")) return "Handed off, not handled solo.";
  if (id.includes("turn")) return "Back and forth in one sitting.";
  return signal.detail;
}

function factPair(signal: Signal, pack: ReportStoryPack | null, finding?: StoryPackSignalFinding): RecapSlide[] {
  const visual = illustrationForSignal(signal);
  const kicker = kickerForFamily(signal.family);
  const findingTitle = finding?.title.trim();
  const setupHeadline = findingTitle && !/\d/.test(findingTitle) ? findingTitle : setupLineForSignal(signal, pack);
  const refs = (finding?.sourceRefs.length ? finding.sourceRefs : signal.sourceRefs).slice(0, 4);
  return [
    fitSlide({
      id: `signature-${signal.id}-setup`,
      kind: "signature",
      beat: "setup",
      kicker,
      headline: setupHeadline,
      body: "",
      visual,
      textScale: "large",
      signalId: signal.id,
      family: signal.family,
      sourceRefs: refs,
    }),
    fitSlide({
      id: `signature-${signal.id}`,
      kind: "signature",
      beat: "reveal",
      kicker,
      headline: revealLineForSignal(signal, finding?.summary),
      body: finding?.summary?.trim() && finding.summary.trim() !== revealLineForSignal(signal, finding.summary)
        ? finding.summary.trim()
        : "",
      visual,
      textScale: "medium",
      signalId: signal.id,
      family: signal.family,
      sourceRefs: refs,
      howWeKnow: howWeKnowForSignal(signal),
      giantValue: formatSignalValue(signal),
      giantLabel: formatSignalUnit(signal),
    }),
  ];
}

function expandFactBeats(slides: RecapSlide[], pack: ReportStoryPack | null): RecapSlide[] {
  const signals = new Map((pack?.signals ?? []).map((signal) => [signal.id, signal]));
  const totals = new Map<string, number>();
  for (const slide of slides) {
    if (slide.kind === "signature" && slide.signalId) {
      totals.set(slide.signalId, (totals.get(slide.signalId) ?? 0) + 1);
    }
  }
  const seen = new Map<string, number>();
  const expanded: RecapSlide[] = [];
  for (const slide of slides) {
    const signal = slide.signalId ? signals.get(slide.signalId) : undefined;
    if (slide.kind === "signature" && signal) {
      const index = (seen.get(signal.id) ?? 0) + 1;
      seen.set(signal.id, index);
      const total = totals.get(signal.id) ?? 1;
      if (index === 1 && total === 1) {
        const [setup] = factPair(signal, pack);
        if (setup) expanded.push(setup);
        expanded.push(fitSlide({
          ...slide,
          id: `signature-${signal.id}`,
          beat: "reveal",
          giantValue: formatSignalValue(signal),
          giantLabel: formatSignalUnit(signal),
          family: signal.family,
          howWeKnow: slide.howWeKnow || howWeKnowForSignal(signal),
        }));
        continue;
      }
      if (index === 1) {
        expanded.push(fitSlide({
          ...slide,
          id: `signature-${signal.id}-setup`,
          beat: "setup",
          giantValue: undefined,
          giantLabel: undefined,
        }));
        continue;
      }
      expanded.push(fitSlide({
        ...slide,
        id: `signature-${signal.id}`,
        beat: "reveal",
        giantValue: formatSignalValue(signal),
        giantLabel: formatSignalUnit(signal),
        family: signal.family,
        howWeKnow: slide.howWeKnow || howWeKnowForSignal(signal),
      }));
      continue;
    }
    expanded.push(fitSlide(slide));
  }
  return capSlides(expanded);
}

function capSlides(slides: RecapSlide[]): RecapSlide[] {
  if (slides.length <= MAX_SLIDES) return slides;
  const close = slides.filter((slide) => slide.kind === "close");
  const receipt = slides.filter((slide) => slide.kind === "receipt");
  const rest = slides.filter((slide) => slide.kind !== "close" && slide.kind !== "receipt");
  const kept: RecapSlide[] = [];
  for (const slide of rest) {
    const room = MAX_SLIDES - close.length - receipt.length - kept.length;
    if (room <= 0) break;
    if (slide.beat === "setup" && room < 2) continue;
    kept.push(slide);
  }
  return [...kept, ...receipt, ...close];
}

function defaultKicker(kind: RecapSlideKind): string {
  if (kind === "title") return "Your build";
  if (kind === "scale") return "The shape of it";
  if (kind === "signature") return "The thing you'll remember";
  if (kind === "turning") return "The night it clicked";
  if (kind === "receipt") return "The receipt";
  return "Only you can see this";
}

function signatureKicker(kind: RecapSlideKind, signal: Signal | undefined, raw?: string | null): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed && trimmed.toLowerCase() !== "the thing you'll remember") return trimmed;
  if (kind === "signature" && signal) return kickerForFamily(signal.family);
  return trimmed || defaultKicker(kind);
}

function scaleSlide(context: RecapContext, widgets: RecapWidgets): RecapSlide {
  const sessions = context.sessionCount;
  const days = context.activeDays;
  const hours = context.buildHours;
  const commits = context.commits;
  let giantValue = hours > 0 ? formatRecapHours(hours) : String(sessions);
  let giantLabel = hours > 0 ? (hours === 1 ? "hour" : "hours") : sessions === 1 ? "AI session" : "AI sessions";
  let headline = hours > 0
    ? `That's ${formatRecapHours(hours)} hour${hours === 1 ? "" : "s"} on this build.`
    : sessions > 0
      ? `You ran ${sessions} AI session${sessions === 1 ? "" : "s"} on this one.`
      : `Here's the shape of ${context.projectName}.`;
  let body = "";
  if (days > 0 && sessions > 0) {
    body = `Built across ${days} day${days === 1 ? "" : "s"}${commits > 0 ? ` · ${commits} commit${commits === 1 ? "" : "s"}` : ""}.`;
  } else if (commits > 0) {
    body = `${commits} commit${commits === 1 ? "" : "s"} landed in this window.`;
  } else if (days > 0 && hours <= 0) {
    giantValue = String(days);
    giantLabel = days === 1 ? "active day" : "active days";
    headline = `You spent ${days} day${days === 1 ? "" : "s"} on this build.`;
  }
  const grid = widgets.statGrid;
  return fitSlide({
    id: "scale",
    kind: "scale",
    kicker: defaultKicker("scale"),
    headline,
    body,
    visual: illustrationForSlideKind("scale"),
    giantValue,
    giantLabel,
    textScale: "medium",
    sourceRefs: [],
    ...(grid ? { layout: "stat-grid", widget: grid } : {}),
  });
}

function hourSlide(widgets: RecapWidgets): RecapSlide | null {
  const widget = widgets.hourBars;
  if (!widget) return null;
  const peak = widget.bars.find((bar) => bar.peak);
  return fitSlide({
    id: "hours",
    kind: "turning",
    kicker: "Your hours",
    headline: "When the work actually happened.",
    body: peak
      ? `${widget.peakLabel} · ${peak.count} session${peak.count === 1 ? "" : "s"}`
      : widget.peakLabel,
    visual: illustrationForSlideKind("turning"),
    textScale: "medium",
    sourceRefs: [],
    layout: "hour-bars",
    widget,
  });
}

function weekdaySlide(widgets: RecapWidgets): RecapSlide | null {
  const widget = widgets.weekday;
  if (!widget) return null;
  const peak = widget.bars.find((bar) => bar.peak);
  return fitSlide({
    id: "weekdays",
    kind: "turning",
    kicker: "By day",
    headline: peak ? `${peak.label} carried this build.` : "Some days did more than others.",
    body: peak ? `${peak.count} session${peak.count === 1 ? "" : "s"} on your busiest weekday.` : "",
    visual: illustrationForSlideKind("turning"),
    textScale: "medium",
    sourceRefs: [],
    layout: "weekday",
    widget,
  });
}

function rankedSlide(widgets: RecapWidgets): RecapSlide | null {
  const widget = widgets.ranked;
  if (!widget) return null;
  const lead = widget.items[0];
  return fitSlide({
    id: "ranked",
    kind: "signature",
    kicker: "The mix",
    headline: lead ? `${lead.title} led this one.` : "The tools you reached for.",
    body: lead ? `#1 · ${lead.subtitle}` : "",
    visual: lead?.visual ?? illustrationForSlideKind("signature"),
    textScale: "medium",
    sourceRefs: [],
    layout: "ranked",
    widget,
  });
}

function streakSlide(widgets: RecapWidgets): RecapSlide | null {
  const streak = widgets.streak;
  if (!streak) return null;
  return fitSlide({
    id: "streak",
    kind: "signature",
    kicker: "The streak",
    headline: "You kept showing up.",
    body: streak.label,
    visual: illustrationForSlideKind("close"),
    giantValue: String(streak.days),
    giantLabel: streak.days === 1 ? "consecutive day" : "consecutive days",
    textScale: "medium",
    sourceRefs: [],
    layout: "streak",
    widget: { type: "streak", others: widgets.streakOthers },
  });
}

function hydrateSlide(slide: RecapSlide, widgets: RecapWidgets): RecapSlide | null {
  const requested = slide.layout && slide.layout !== "copy" ? slide.layout : undefined;
  const inferred = !requested && slide.kind === "scale" && widgets.statGrid ? "stat-grid" as const : undefined;
  const layout = requested ?? inferred;
  if (!layout) return slide;
  const widget = widgetForLayout(layout, widgets);
  if (!widget) {
    if (requested === "hour-bars") return null;
    return { ...slide, layout: "copy", widget: undefined };
  }
  if (layout === "streak" && widgets.streak && !slide.giantValue) {
    return fitSlide({
      ...slide,
      layout,
      widget,
      giantValue: String(widgets.streak.days),
      giantLabel: widgets.streak.days === 1 ? "consecutive day" : "consecutive days",
    });
  }
  return { ...slide, layout, widget };
}

function insertWidgetSlides(slides: RecapSlide[], widgets: RecapWidgets): RecapSlide[] {
  const present = new Set(slides.map((slide) => slide.layout).filter(Boolean));
  const extras = [
    present.has("hour-bars") ? null : hourSlide(widgets),
    present.has("weekday") ? null : weekdaySlide(widgets),
    present.has("ranked") ? null : rankedSlide(widgets),
    present.has("streak") ? null : streakSlide(widgets),
  ].filter((slide): slide is RecapSlide => Boolean(slide));
  if (!extras.length) return slides;
  const close = slides.filter((slide) => slide.kind === "close");
  const rest = slides.filter((slide) => slide.kind !== "close");
  const scaleAt = rest.reduce((found, slide, index) => (
    slide.kind === "scale" || slide.layout === "stat-grid" ? index : found
  ), -1);
  const insertAt = scaleAt >= 0 ? scaleAt + 1 : Math.min(1, rest.length);
  const room = Math.max(0, MAX_SLIDES - close.length - rest.length);
  const added = extras.slice(0, room);
  return capSlides([...rest.slice(0, insertAt), ...added, ...rest.slice(insertAt), ...close]);
}

function signatureSlides(context: RecapContext): RecapSlide[] {
  const signals = signalsOf(context);
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const fromSurprise = surpriseFacts(context.pack)
    .flatMap((finding) => {
      const signal = byId.get(finding.signalId);
      if (!signal) return [];
      return factPair(signal, context.pack, finding);
    });
  if (fromSurprise.length) return fromSurprise.slice(0, 4);
  return featuredSignals(signals, 2).flatMap((signal) => factPair(signal, context.pack));
}

function turningSlide(context: RecapContext): RecapSlide | null {
  const beat = buildTurningBeat(context.pack);
  if (!beat) return null;
  return fitSlide({
    id: "turning",
    kind: "turning",
    kicker: defaultKicker("turning"),
    headline: beat.failure,
    body: [beat.investigation, beat.outcome].filter(Boolean).join(" "),
    visual: illustrationForSlideKind("turning"),
    textScale: "medium",
    sourceRefs: beat.sourceRefs,
  });
}

function buildDeterministicRecap(context: RecapContext): RecapScript {
  const widgets = computeRecapWidgets(context);
  const signatures = signatureSlides(context);
  const turning = turningSlide(context);
  const slides: RecapSlide[] = [
    fitSlide({
      id: "title",
      kind: "title",
      kicker: "Your build",
      headline: context.projectName,
      body: "Here's how this one went.",
      visual: illustrationForArchetype(context.archetypeName),
      textScale: "large",
      sourceRefs: [],
    }),
    scaleSlide(context, widgets),
    ...[hourSlide(widgets), weekdaySlide(widgets), rankedSlide(widgets), streakSlide(widgets)].filter((slide): slide is RecapSlide => Boolean(slide)),
    ...signatures,
    ...(turning ? [turning] : []),
    {
      id: "receipt",
      kind: "receipt",
      kicker: defaultKicker("receipt"),
      headline: "The work, itemized.",
      body: "Every number on this receipt was computed from the scan.",
      visual: illustrationForSlideKind("receipt"),
      sourceRefs: [],
    },
    fitSlide({
      id: "close",
      kind: "close",
      kicker: defaultKicker("close"),
      headline: "Your private recap is ready.",
      body: "Come back anytime. Nothing is public unless you share a version.",
      visual: illustrationForSlideKind("close"),
      textScale: "large",
      sourceRefs: [],
    }),
  ];
  return { slides: capSlides(slides), source: "deterministic" };
}

export function buildRecapScript(context: RecapContext): RecapScript {
  const widgets = computeRecapWidgets(context);
  const authored = authoredRecapSlides(context.pack);
  if (authored.length >= 4) {
    const hydrated = authored.map((slide) => hydrateSlide(slide, widgets)).filter((slide): slide is RecapSlide => Boolean(slide));
    const hasClose = hydrated.some((slide) => slide.kind === "close");
    const withClose = hasClose ? hydrated : [...hydrated, fitSlide({
      id: "close",
      kind: "close" as const,
      kicker: defaultKicker("close"),
      headline: "Your private recap is ready.",
      body: "Come back anytime. Nothing is public unless you share a version.",
      visual: illustrationForSlideKind("close"),
      textScale: "large",
      sourceRefs: [],
    })];
    return { slides: insertWidgetSlides(withClose, widgets), source: "authored" };
  }
  return buildDeterministicRecap(context);
}

export function findRecapSlide(script: RecapScript, slideId: string): RecapSlide | undefined {
  return script.slides.find((item) => item.id === slideId)
    ?? script.slides.find((item) => item.signalId && `signature-${item.signalId}` === slideId)
    ?? script.slides.find((item) => item.signalId && `signature-${item.signalId}-setup` === slideId);
}

export function recapSeenStorageKey(reportId: string): string {
  return `buildstory:recap-seen:${reportId}`;
}

export function publicRecapSeenStorageKey(handle: string, slug: string): string {
  return `buildstory:recap-seen:${handle}/${slug}`;
}

export function recapMutedStorageKey(): string {
  return "buildstory:recap-muted";
}

export const COUNT_UP_MS = 1100;

export type RecapNumberParts = {
  prefix: string;
  value: number;
  decimals: number;
  suffix: string;
  commas: boolean;
  compound: boolean;
};

export function parseRecapNumber(raw: string): RecapNumberParts | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/\d\s*h\b/i.test(trimmed) && /\d\s*m\b/i.test(trimmed)) {
    return { prefix: "", value: 0, decimals: 0, suffix: trimmed, commas: false, compound: true };
  }
  const match = trimmed.match(/^([^0-9.-]*)(-?\d[\d,]*(?:\.\d+)?)([^\d]*)$/);
  if (!match) return null;
  const stem = match[2] ?? "";
  const numeric = Number(stem.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  const fraction = stem.split(".")[1];
  return {
    prefix: match[1] ?? "",
    value: numeric,
    decimals: fraction?.length ?? 0,
    suffix: match[3] ?? "",
    commas: stem.includes(","),
    compound: false,
  };
}

export function formatRecapCount(parts: RecapNumberParts, current: number): string {
  if (parts.compound) return parts.suffix;
  const absolute = Math.abs(current);
  const rounded = parts.decimals > 0 ? absolute.toFixed(parts.decimals) : String(Math.round(absolute));
  const [whole, fraction] = rounded.split(".");
  const grouped = parts.commas ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  const stem = fraction != null ? `${grouped}.${fraction}` : grouped;
  const signed = current < 0 ? `-${stem}` : stem;
  return `${parts.prefix}${signed}${parts.suffix}`;
}

export function durationForSlide(kind: RecapSlideKind, beat?: RecapBeat, layout?: RecapLayout): number {
  if (layout && layout !== "copy") return 7500;
  if (kind === "title" || kind === "close") return 5500;
  if (kind === "receipt") return 8500;
  if (beat === "setup") return 6800;
  if (beat === "reveal") return 7800;
  if (kind === "turning") return 7200;
  return 6500;
}
