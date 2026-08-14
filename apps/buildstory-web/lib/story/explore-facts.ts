import { formatBuildTime } from "@/lib/story/display-labels";
import { formatUsageSpend } from "@/lib/usage/format";

export type ExploreTrailStory = {
  name: string;
  slug: string;
  owner: { name: string; handle: string };
  headlineFact: string | null;
  signals?: Array<{
    id: string;
    family: string;
    headline: string;
    detail: string;
    value: number;
    unit: string;
    notability: number;
  }>;
  profile?: {
    archetype?: { name: string } | null;
    workPatterns?: {
      nightShare?: number;
      distinctToolCount?: number;
      longestSessionMinutes?: number;
    } | null;
  } | null;
  tools: Array<{ label: string }>;
  git: { commits: number };
  subagentCount: number;
  sessionCount: number;
  buildHours: number;
  cost?: { totalMicroUsd?: number | null } | null;
};

export type ExploreTrailFact = {
  id: string;
  href: string;
  kind: string;
  index: string;
  label: string;
  value: string;
  title: string;
  copy: string;
  tone: "coral" | "cobalt" | "ink";
};

export type ExploreExcerptStat = { label: string; value: string };

const TONES: Array<ExploreTrailFact["tone"]> = ["coral", "cobalt", "ink"];

function hrefFor(story: ExploreTrailStory) {
  return `/u/${story.owner.handle}/${story.slug}`;
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const mins = Math.round(value % 60);
  if (hours >= 1) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${Math.round(value)}m`;
}

function formatSignalDisplay(value: number, unit: string) {
  if (unit === "minutes") return formatMinutes(value);
  if (unit === "%") return `${Math.round(value)}%`;
  if (unit === "tokens" || value >= 10_000) {
    return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function candidatesFrom(story: ExploreTrailStory): ExploreTrailFact[] {
  const href = hrefFor(story);
  const handle = `@${story.owner.handle}`;
  const facts: ExploreTrailFact[] = [];
  const signal = [...(story.signals ?? [])]
    .filter((item) => item.notability > 0)
    .sort((left, right) => right.notability - left.notability || left.id.localeCompare(right.id))[0];
  if (signal) {
    facts.push({
      id: `${story.slug}:${signal.id}`,
      href,
      kind: `signal:${signal.id}`,
      index: "",
      label: signal.family.replace(/-/g, " "),
      value: formatSignalDisplay(signal.value, signal.unit),
      title: signal.headline,
      copy: `${story.name} · ${handle}`,
      tone: "coral",
    });
  } else if (story.headlineFact) {
    facts.push({
      id: `${story.slug}:headline`,
      href,
      kind: "headline",
      index: "",
      label: "Key finding",
      value: story.name,
      title: story.headlineFact,
      copy: handle,
      tone: "coral",
    });
  }
  const night = story.profile?.workPatterns?.nightShare;
  if (typeof night === "number" && night > 0) {
    facts.push({
      id: `${story.slug}:night`,
      href,
      kind: "night",
      index: "",
      label: "Night work",
      value: `${Math.round(night)}%`,
      title: "of sessions started after 10pm",
      copy: `${story.name} · ${handle}`,
      tone: "cobalt",
    });
  }
  const tools = story.profile?.workPatterns?.distinctToolCount || story.tools.length;
  if (tools >= 8) {
    facts.push({
      id: `${story.slug}:tools`,
      href,
      kind: "tools",
      index: "",
      label: "The toolkit",
      value: String(tools),
      title: "tools kept the build moving",
      copy: `${story.name} · ${handle}`,
      tone: "ink",
    });
  }
  if (story.subagentCount >= 8) {
    facts.push({
      id: `${story.slug}:subagents`,
      href,
      kind: "subagents",
      index: "",
      label: "Delegation",
      value: String(story.subagentCount),
      title: "subagent delegations",
      copy: `${story.name} · ${handle}`,
      tone: "cobalt",
    });
  }
  const longest = story.profile?.workPatterns?.longestSessionMinutes;
  if (typeof longest === "number" && longest >= 180) {
    facts.push({
      id: `${story.slug}:marathon`,
      href,
      kind: "marathon",
      index: "",
      label: "Longest session",
      value: formatMinutes(longest),
      title: "ran far beyond the median",
      copy: `${story.name} · ${handle}`,
      tone: "coral",
    });
  }
  const archetype = story.profile?.archetype?.name;
  if (archetype) {
    facts.push({
      id: `${story.slug}:archetype`,
      href,
      kind: "archetype",
      index: "",
      label: "Builder card",
      value: archetype,
      title: "computed from the trail, not a quiz",
      copy: `${story.name} · ${handle}`,
      tone: "ink",
    });
  }
  const spend = story.cost?.totalMicroUsd;
  if (typeof spend === "number" && spend > 0) {
    facts.push({
      id: `${story.slug}:spend`,
      href,
      kind: "spend",
      index: "",
      label: "Est. spend",
      value: formatUsageSpend(spend),
      title: "API-equivalent, not an invoice",
      copy: `${story.name} · ${handle}`,
      tone: "cobalt",
    });
  }
  return facts;
}

/** Distinct decoded facts from the current Explore result set, one kind per card. */
export function trailFactsFromStories(stories: ExploreTrailStory[], limit = 4): ExploreTrailFact[] {
  const seen = new Set<string>();
  const picked: ExploreTrailFact[] = [];
  for (const story of stories) {
    for (const fact of candidatesFrom(story)) {
      if (seen.has(fact.kind) || seen.has(fact.id)) continue;
      seen.add(fact.kind);
      picked.push({
        ...fact,
        index: String(picked.length + 1).padStart(2, "0"),
        tone: TONES[picked.length % TONES.length]!,
      });
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
}

/** Three stats for the featured report excerpt, preferring published work-pattern facts. */
export function excerptStatsFromStory(story: ExploreTrailStory): ExploreExcerptStat[] {
  const stats: ExploreExcerptStat[] = [];
  const night = story.profile?.workPatterns?.nightShare;
  if (typeof night === "number" && night > 0) stats.push({ label: "Night sessions", value: `${Math.round(night)}%` });
  const tools = story.profile?.workPatterns?.distinctToolCount || story.tools.length;
  if (tools > 0) stats.push({ label: "Tools", value: String(tools) });
  const longest = story.profile?.workPatterns?.longestSessionMinutes;
  if (typeof longest === "number" && longest > 0) stats.push({ label: "Longest session", value: formatMinutes(longest) });
  if (stats.length < 3 && story.sessionCount > 0) stats.push({ label: "Sessions", value: String(story.sessionCount) });
  if (stats.length < 3 && story.git.commits > 0) stats.push({ label: "Commits", value: String(story.git.commits) });
  if (stats.length < 3 && story.buildHours > 0) stats.push({ label: "Build time", value: formatBuildTime(story.buildHours) });
  return stats.slice(0, 3);
}
