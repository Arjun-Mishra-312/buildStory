import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { storyBackgroundOption } from "@/lib/background-options";

export type StoryVisualStory = Pick<
  PublicBuildStoryViewModel,
  "name" | "stack" | "storyBackgroundId" | "artifactMedia"
>;

/** Shared receipt artwork used by both public Explore cards and the private Studio list. */
export function StoryVisual({ story }: { story: StoryVisualStory }) {
  const cover = story.artifactMedia?.find((media) => media.kind === "cover")?.url ?? story.artifactMedia?.[0]?.url;
  return cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cover} alt="" className="explore-story-card__cover" />
  ) : (
    <div className="explore-story-card__receipt explore-story-card__receipt--image" aria-hidden="true">
      {/* Decorative art stays in its own layer; copy sits on an opaque panel. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="background-theme-light" src={storyBackgroundOption(story.storyBackgroundId).assets.light} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="background-theme-dark" src={storyBackgroundOption(story.storyBackgroundId).assets.dark} alt="" />
      <div className="explore-story-card__receipt-copy">
        <span>BUILD / RECEIPT</span>
        <strong>{story.name}</strong>
        <i />
        <small>{story.stack.slice(0, 2).join(" · ") || "PROCESS REDACTED"}</small>
      </div>
    </div>
  );
}
