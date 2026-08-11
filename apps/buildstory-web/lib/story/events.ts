export const STORY_EVENT_TYPES = [
  "story_open",
  "story_frame_view",
  "story_complete",
  "story_report_click",
  "story_share_open",
  "story_frame_download",
  "story_copy_link",
  "story_device_share",
] as const;

export type StoryEventType = (typeof STORY_EVENT_TYPES)[number];

export function isStoryEventType(value: unknown): value is StoryEventType {
  return typeof value === "string" && (STORY_EVENT_TYPES as readonly string[]).includes(value);
}

export function safeStoryEventFrameId(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80) : "";
}
