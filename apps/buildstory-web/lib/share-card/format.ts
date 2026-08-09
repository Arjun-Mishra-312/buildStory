import type { PublicBuildStoryViewModel } from "@/lib/build-story";

export type ShareCardStat = { value: string; label: string };
export type ShareCardModel = { id: string; label: string; share: number | null };

export type ShareCardData = {
  name: string;
  handle: string;
  tagline: string | null;
  archetype: string | null;
  stats: ShareCardStat[];
  models: ShareCardModel[];
  /** The single most notable computed fact, gated by the signalHeadline PublicFieldKey. Never model-written. */
  headlineFact: string | null;
};

const usdFormat = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Maps a published story into card-ready display data. Unpublished fields
 * arrive zeroed/empty rather than omitted (git.commits === 0, tagline === "",
 * models === [], cost === null) - a creator's opt-out, not a fact worth
 * printing. This is the one place that decides what to hide versus what's a
 * legitimately reportable zero, so every card layout stays consistent and
 * never renders "0 commits" as though it happened.
 */
export function formatShareCardData(story: PublicBuildStoryViewModel): ShareCardData {
  const stats: ShareCardStat[] = [];
  if (story.activeDays > 0) {
    stats.push({ value: String(story.activeDays), label: story.activeDays === 1 ? "active day" : "active days" });
  }
  if (story.sessionCount > 0) {
    stats.push({ value: String(story.sessionCount), label: "AI sessions" });
  }
  if (story.git.commits > 0) {
    stats.push({ value: compactNumber.format(story.git.commits), label: "commits" });
  }
  if (story.cost?.totalMicroUsd != null) {
    stats.push({ value: usdFormat.format(story.cost.totalMicroUsd / 1_000_000), label: "est. spend" });
  }

  const models: ShareCardModel[] = story.models
    .slice(0, 3)
    .map((model) => ({ id: model.id, label: model.label, share: model.share }));

  return {
    name: story.name,
    handle: story.owner.handle,
    tagline: story.tagline || null,
    archetype: story.profile?.archetype?.name ?? null,
    stats,
    models,
    headlineFact: story.headlineFact || null,
  };
}
