import type {
  ReportStoryPack,
  ReportStoryPackV3,
  StoryPackFinding,
} from "../ingestion/scanner-project-snapshot";

/**
 * Render-side de-duplication for Deep story packs (v3). The two-pass
 * generation pipeline (analysis map, then a synthesis pass reshaping that
 * same map into hero/moments/insights) has no coherence check between
 * passes, so a Deep report can restate the same finding under a different
 * label - e.g. the hero headline and deepAnalysis.openingLine, or
 * standoutTraits and deepAnalysis.signatureMoves. This module folds the
 * standalone "DEEP ANALYSIS" findings into the sections they overlap with
 * instead of rendering them a second time.
 *
 * Deliberately private-view-only for now: applying this to the public
 * projection could surface a signature move while the corresponding
 * `storyTraits`/`deepSignatureMoves` boundary field is unchecked, which
 * would violate the "unchecking a field hides only that field" contract.
 */

/** Lowercased, punctuation-stripped, whitespace-collapsed - for loose title/summary matching, not display. */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First 40 chars of the normalized summary. Below MIN_PREFIX_LENGTH a match is too likely to be coincidental to trust. */
const MIN_PREFIX_LENGTH = 20;

function summaryPrefix(value: string): string {
  return normalizeTitle(value).slice(0, 40);
}

/**
 * Returns the subset of `candidates` that don't restate an entry already
 * present in `existing` - by normalized title, or by a first-40-chars
 * summary prefix shared with any existing or earlier-accepted item (so two
 * candidates that duplicate each other, not just `existing`, both get
 * caught). Either signal alone is enough to flag a duplicate; a match
 * requires both signals to independently agree only in the sense that both
 * are checked, not that both must fire. Order of `candidates` is preserved.
 */
export function dedupeFindings<T extends { title: string; summary: string }>(
  existing: Array<{ title: string; summary: string }>,
  candidates: T[],
): T[] {
  const seenTitles = new Set(existing.map((item) => normalizeTitle(item.title)).filter(Boolean));
  const seenPrefixes = new Set(
    existing.map((item) => summaryPrefix(item.summary)).filter((prefix) => prefix.length >= MIN_PREFIX_LENGTH),
  );
  const result: T[] = [];
  for (const candidate of candidates) {
    const title = normalizeTitle(candidate.title);
    const prefix = summaryPrefix(candidate.summary);
    const isDuplicate = (title.length > 0 && seenTitles.has(title)) || (prefix.length >= MIN_PREFIX_LENGTH && seenPrefixes.has(prefix));
    if (isDuplicate) continue;
    if (title.length > 0) seenTitles.add(title);
    if (prefix.length >= MIN_PREFIX_LENGTH) seenPrefixes.add(prefix);
    result.push(candidate);
  }
  return result;
}

export type MergedTrait = {
  title: string;
  detail: string;
  sourceRefs: string[];
  confidence?: StoryPackFinding["confidence"];
};

export type MergedBreakthrough = StoryPackFinding;

export type MergedStoryPack = {
  /** Shown as a kicker near the hero only when it says something the hero doesn't already say. */
  openingLineKicker: StoryPackFinding | null;
  /** standoutTraits with any non-duplicate deepAnalysis.signatureMoves appended. */
  standoutTraits: MergedTrait[];
  /** deepAnalysis.whereItGotHard, deduped against existing moments/turningPoint - render as extra "breakthrough" cards alongside moments. */
  extraBreakthroughs: MergedBreakthrough[];
  /** deepAnalysis.chapterChanges - only meaningful when nothing else on the page already shows the chapter-over-chapter delta. */
  chapterChanges: StoryPackFinding[];
  coverage: NonNullable<ReportStoryPackV3["deepAnalysis"]>["coverage"] | null;
};

const EMPTY_MERGED: MergedStoryPack = {
  openingLineKicker: null,
  standoutTraits: [],
  extraBreakthroughs: [],
  chapterChanges: [],
  coverage: null,
};

export type MergeDeepIntoPackOptions = {
  /** Suppress chapterChanges when a ChapterDeltaSummary is already rendered elsewhere on the page. */
  hasLivePreviewDelta: boolean;
};

/**
 * Computes the merged view of a Deep pack's deepAnalysis findings against
 * its narrative sections. Returns EMPTY_MERGED (all falsy/empty) for V2
 * packs and for V3 packs with no deepAnalysis (the field is optional), so
 * callers can treat the result uniformly without a version check.
 */
export function mergeDeepIntoPack(pack: ReportStoryPack, options: MergeDeepIntoPackOptions): MergedStoryPack {
  if (pack.version !== "3.0.0" || !pack.deepAnalysis) return EMPTY_MERGED;
  const deep = pack.deepAnalysis;

  const openingLineKicker =
    deep.openingLine && normalizeTitle(deep.openingLine.title) !== normalizeTitle(pack.hero.headline)
      ? deep.openingLine
      : null;

  const existingTraits = pack.standoutTraits.map((trait) => ({ title: trait.title, summary: trait.detail }));
  const signatureMoves = dedupeFindings(existingTraits, deep.signatureMoves ?? []);
  const standoutTraits: MergedTrait[] = [
    ...pack.standoutTraits.map((trait) => ({ ...trait })),
    ...signatureMoves.map((finding) => ({
      title: finding.title,
      detail: finding.summary,
      sourceRefs: finding.sourceRefs,
      confidence: finding.confidence,
    })),
  ];

  const existingFriction = [
    ...pack.moments.filter((moment) => moment.kind === "breakthrough").map((moment) => ({
      title: moment.title,
      summary: moment.whatHappened,
    })),
    ...(pack.turningPoint.quote ? [{ title: pack.turningPoint.quote, summary: pack.turningPoint.quote }] : []),
  ];
  const extraBreakthroughs = dedupeFindings(existingFriction, deep.whereItGotHard ?? []);

  const chapterChanges = options.hasLivePreviewDelta ? [] : (deep.chapterChanges ?? []);

  return {
    openingLineKicker,
    standoutTraits,
    extraBreakthroughs,
    chapterChanges,
    coverage: deep.coverage,
  };
}
