import type { ReportStoryPack, Signal } from "@/lib/ingestion/scanner-project-snapshot";

export const SCANNER_DEFAULT_TAGLINE = "A private AI build report.";
export const SCANNER_DEFAULT_DESCRIPTION =
  "Buildstory assembled this report from the validated, content-free metadata in the uploaded ProjectSnapshot. Review every field before publishing.";
export const LEGACY_SESSION_COUNT_TAGLINE =
  /^A private build report generated from \d+ repository-scoped AI sessions?\.?$/i;

export const PUBLIC_FACTS_LIMIT = 10;

export function isScannerDefaultTagline(tagline: string): boolean {
  const trimmed = tagline.trim();
  return trimmed === SCANNER_DEFAULT_TAGLINE || LEGACY_SESSION_COUNT_TAGLINE.test(trimmed);
}

export function isScannerDefaultDescription(description: string): boolean {
  return description.trim() === SCANNER_DEFAULT_DESCRIPTION;
}

export function isSessionActivityTitle(title: string): boolean {
  return /\bsession activity$/i.test(title.trim());
}

export type PublicHeroCopy = {
  productLine: string | null;
  scaleLine: string | null;
  storyHook: string | null;
};

export function buildPublicHeroCopy({
  tagline,
  description,
  pack,
  activeDays,
  sessionCount,
  commits,
}: {
  tagline: string;
  description: string;
  pack: ReportStoryPack | null;
  activeDays: number;
  sessionCount: number;
  commits: number;
}): PublicHeroCopy {
  const customDescription = description.trim() && !isScannerDefaultDescription(description) ? description.trim() : null;
  const customTagline = tagline.trim() && !isScannerDefaultTagline(tagline) ? tagline.trim() : null;
  const productLine = customDescription ?? pack?.hero.summary ?? customTagline ?? null;

  const scaleParts: string[] = [];
  if (activeDays > 0 && sessionCount > 0) {
    scaleParts.push(`Built in ${activeDays} day${activeDays === 1 ? "" : "s"} across ${sessionCount} AI session${sessionCount === 1 ? "" : "s"}`);
  } else if (sessionCount > 0) {
    scaleParts.push(`${sessionCount} AI session${sessionCount === 1 ? "" : "s"}`);
  } else if (activeDays > 0) {
    scaleParts.push(`${activeDays} active day${activeDays === 1 ? "" : "s"}`);
  }
  if (commits > 0) scaleParts.push(`${commits} commit${commits === 1 ? "" : "s"}`);

  return {
    productLine,
    scaleLine: scaleParts.length ? scaleParts.join(" · ") : null,
    storyHook: pack?.hero.headline?.trim() || null,
  };
}

export type PublicBrief = {
  headline: string;
  goal: string;
  wentWrong: string[];
  changed: string[];
  result: string;
};

export function buildPublicBrief({
  pack,
  sessionCount,
  commits,
  status,
}: {
  pack: ReportStoryPack | null;
  sessionCount: number;
  commits: number;
  status: string;
}): PublicBrief | null {
  if (!pack) return null;
  const discoverMoments = pack.moments.filter((moment) => moment.phase === "discover");
  const wentWrong = (discoverMoments.length ? discoverMoments : pack.moments)
    .slice(0, 2)
    .map((moment) => moment.whatHappened)
    .filter(Boolean);
  const changed = pack.decisions.slice(0, 3).map((decision) => decision.title).filter(Boolean);
  if (!pack.hero.headline && !pack.hero.summary && !wentWrong.length && !changed.length) return null;

  const resultParts = [
    sessionCount > 0 ? `${sessionCount} AI session${sessionCount === 1 ? "" : "s"}` : null,
    commits > 0 ? `${commits} commit${commits === 1 ? "" : "s"}` : null,
    status === "shipped" ? "production-ready" : status === "building" ? "still in motion" : null,
  ].filter((part): part is string => Boolean(part));

  return {
    headline: pack.hero.headline,
    goal: pack.hero.summary,
    wentWrong,
    changed,
    result: resultParts.length ? resultParts.join(" → ") : pack.hero.headline,
  };
}

export type TurningBeat = {
  occurredAt: string | null;
  failure: string;
  investigation: string;
  outcome: string;
  sourceRefs: string[];
};

export function buildTurningBeat(pack: ReportStoryPack | null): TurningBeat | null {
  if (!pack) return null;
  const failureMoment = pack.moments.find((moment) => moment.phase === "discover") ?? pack.moments[0];
  const decision = pack.decisions[0];
  if (!failureMoment && !decision && !pack.turningPoint.quote) return null;
  const sourceRefs = [...new Set([...(failureMoment?.sourceRefs ?? []), ...(decision?.sourceRefs ?? []), ...pack.turningPoint.sourceRefs])].slice(0, 4);
  const source = pack.sources.find((item) => sourceRefs.includes(item.ref));
  const failure = failureMoment?.whatHappened ?? pack.turningPoint.quote;
  const investigation = decision?.rationale ?? "You traced the failure to its source.";
  const outcome = decision?.outcome ?? failureMoment?.whyItMattered ?? "";
  if (!failure || !outcome) return null;
  return { occurredAt: source?.occurredAt ?? null, failure, investigation, outcome, sourceRefs };
}

export function footnoteForMetric(id: "activeDays" | "sessions" | "commits" | "linesAdded" | "models" | "tokens" | "cost", signals: Signal[]): string | undefined {
  if (id === "cost") {
    return "An estimate of what this usage would cost at published API rates — not necessarily the builder's actual spend.";
  }
  if (id === "tokens") {
    const heaviest = signals.find((signal) =>
      signal.id === "token-heaviest-session"
      || ((signal.family === "spend" || signal.family === "conversation") && signal.unit === "tokens" && /session/i.test(signal.headline)),
    );
    return heaviest?.detail;
  }
  return undefined;
}

export function receiptFilesTouchedNote(filesTouched: number): string | null {
  if (filesTouched <= 0) return null;
  return "Files touched is the sum of per-commit changed-file counts, not a unique-file count.";
}
