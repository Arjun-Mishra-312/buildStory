export const GUIDE_VERSION = 1;

export const GUIDE_KEYS = [
  "studio-overview",
  "create-story",
  "projects",
  "project-detail",
  "story-workbench",
  "scan-updates",
] as const;

export type GuideKey = (typeof GUIDE_KEYS)[number];
export type GuideState = "completed" | "dismissed";

export type GuidanceRecord = {
  guideKey: GuideKey;
  guideVersion: number;
  state: GuideState;
  updatedAt: string;
};

export function isGuideKey(value: unknown): value is GuideKey {
  return typeof value === "string" && (GUIDE_KEYS as readonly string[]).includes(value);
}

export function isGuideState(value: unknown): value is GuideState {
  return value === "completed" || value === "dismissed";
}
