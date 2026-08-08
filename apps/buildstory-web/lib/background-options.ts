export type BackgroundTheme = "light" | "dark";

export type BackgroundOption<Id extends string = string> = {
  id: Id;
  label: string;
  description: string;
  assets: Record<BackgroundTheme, string>;
};

export const STORY_BACKGROUND_OPTIONS = [
  {
    id: "repository-topography",
    label: "Repository topography",
    description: "A mapped build trail with commit routes and model-blue nodes.",
    assets: {
      light: "/assets/backgrounds/story/repository-topography-light.webp",
      dark: "/assets/backgrounds/story/repository-topography-dark.webp",
    },
  },
  {
    id: "redacted-receipt",
    label: "Redacted receipt",
    description: "Torn evidence, private details, and an editorial paper edge.",
    assets: {
      light: "/assets/backgrounds/story/redacted-receipt-light.webp",
      dark: "/assets/backgrounds/story/redacted-receipt-dark.webp",
    },
  },
  {
    id: "decision-blocks",
    label: "Decision blocks",
    description: "Connected modules that turn a build process into a visual system.",
    assets: {
      light: "/assets/backgrounds/story/decision-blocks-light.webp",
      dark: "/assets/backgrounds/story/decision-blocks-dark.webp",
    },
  },
] as const satisfies readonly BackgroundOption[];

export const SHARE_BACKGROUND_OPTIONS = [
  {
    id: "repository-topography",
    label: "Repository topography",
    description: "A mapped build trail with commit routes and model-blue nodes.",
    assets: {
      light: "/assets/backgrounds/share/repository-topography-light.webp",
      dark: "/assets/backgrounds/share/repository-topography-dark.webp",
    },
  },
  {
    id: "redacted-receipt",
    label: "Redacted receipt",
    description: "Torn evidence framing a quiet, private-first receipt.",
    assets: {
      light: "/assets/backgrounds/share/redacted-receipt-light.webp",
      dark: "/assets/backgrounds/share/redacted-receipt-dark.webp",
    },
  },
  {
    id: "decision-blocks",
    label: "Decision blocks",
    description: "A vertical chain of modules, milestones, and shipped decisions.",
    assets: {
      light: "/assets/backgrounds/share/decision-blocks-light.webp",
      dark: "/assets/backgrounds/share/decision-blocks-dark.webp",
    },
  },
  {
    id: "commit-constellation",
    label: "Commit constellation",
    description: "Sessions and milestones connected into a restrained story arc.",
    assets: {
      light: "/assets/backgrounds/share/commit-constellation-light.webp",
      dark: "/assets/backgrounds/share/commit-constellation-dark.webp",
    },
  },
  {
    id: "artifact-blueprint",
    label: "Artifact blueprint",
    description: "Construction lines and release marks from plan to artifact.",
    assets: {
      light: "/assets/backgrounds/share/artifact-blueprint-light.webp",
      dark: "/assets/backgrounds/share/artifact-blueprint-dark.webp",
    },
  },
] as const satisfies readonly BackgroundOption[];

export type StoryBackgroundId = (typeof STORY_BACKGROUND_OPTIONS)[number]["id"];
export type ShareBackgroundId = (typeof SHARE_BACKGROUND_OPTIONS)[number]["id"];

export const DEFAULT_STORY_BACKGROUND_ID: StoryBackgroundId = "repository-topography";

export function isStoryBackgroundId(value: unknown): value is StoryBackgroundId {
  return typeof value === "string" && STORY_BACKGROUND_OPTIONS.some((option) => option.id === value);
}

export function isShareBackgroundId(value: unknown): value is ShareBackgroundId {
  return typeof value === "string" && SHARE_BACKGROUND_OPTIONS.some((option) => option.id === value);
}

export function isBackgroundTheme(value: unknown): value is BackgroundTheme {
  return value === "light" || value === "dark";
}

export function storyBackgroundOption(id: unknown) {
  return STORY_BACKGROUND_OPTIONS.find((option) => option.id === id) ?? STORY_BACKGROUND_OPTIONS[0];
}

export function shareBackgroundOption(id: unknown) {
  return SHARE_BACKGROUND_OPTIONS.find((option) => option.id === id) ?? SHARE_BACKGROUND_OPTIONS[0];
}

/** Satori/workers-og reliably accepts JPEG/PNG sources but not WebP data URIs.
 * Browser thumbnails stay WebP; the renderer reads these JPEG equivalents. */
export function shareRenderBackgroundAsset(id: unknown, theme: BackgroundTheme) {
  const browserAsset = shareBackgroundOption(id).assets[theme];
  return browserAsset.replace("/share/", "/share-render/").replace(/\.webp$/, ".jpg");
}
