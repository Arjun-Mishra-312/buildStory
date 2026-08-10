import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { DEFAULT_STORY_BACKGROUND_ID, isStoryBackgroundId, type StoryBackgroundId } from "@/lib/background-options";

export type FeedTileVisual = {
  category: string;
  status: PublicBuildStoryViewModel["status"];
  coverUrl: string | null;
  storyBackgroundId: StoryBackgroundId;
  stack: string[];
};

export type FeedTileStats = {
  sessionCount: number;
  activeDays: number;
  buildHours: number;
  commits: number;
  primaryModel: { label: string; share: number | null } | null;
  headlineFact: string | null;
};

export type FeedTileProjection = { visual: FeedTileVisual; stats: FeedTileStats };

/**
 * Projects the frozen public story view-model (buildstory_public_story_index's
 * story_json in D1, or the mock store's shadow copy of the same object) into
 * what a feed tile needs. Shared by lib/social/d1-store.ts and
 * lib/social/mock-store.ts so dev/prod never drift on this mapping. Returns
 * null when the story is missing or malformed - legacy/unindexed reports
 * degrade to the bare-tile rendering rather than a crash.
 */
export function feedTileFromStory(story: PublicBuildStoryViewModel | null | undefined): FeedTileProjection | null {
  if (!story || typeof story.name !== "string" || !Array.isArray(story.stack) || !Array.isArray(story.models)) return null;
  const primary = story.models[0];
  return {
    visual: {
      category: story.category,
      status: story.status,
      coverUrl: story.artifactMedia?.find((media) => media.kind === "cover")?.url ?? story.artifactMedia?.[0]?.url ?? null,
      storyBackgroundId: isStoryBackgroundId(story.storyBackgroundId) ? story.storyBackgroundId : DEFAULT_STORY_BACKGROUND_ID,
      stack: story.stack,
    },
    stats: {
      sessionCount: story.sessionCount,
      activeDays: story.activeDays,
      buildHours: story.buildHours,
      commits: story.git.commits,
      primaryModel: primary ? { label: primary.label, share: primary.share } : null,
      headlineFact: story.headlineFact,
    },
  };
}

/** Defensive JSON.parse for a frozen story_json column - never throws, since one malformed row must not break the whole feed. */
export function parseFeedStoryJson(json: string | null | undefined): PublicBuildStoryViewModel | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PublicBuildStoryViewModel;
  } catch {
    return null;
  }
}
