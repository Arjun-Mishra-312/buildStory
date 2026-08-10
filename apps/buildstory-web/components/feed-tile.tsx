import Link from "next/link";
import { Flame, Handshake, MessageCircle, Rocket, Sparkles } from "lucide-react";
import type { FeedEntry } from "@/lib/social/contracts";
import { initialsFrom } from "@/lib/identity/initials";
import { categoryLabel, formatBuildTime, statusClass } from "@/lib/story/display-labels";
import { DEFAULT_STORY_BACKGROUND_ID } from "@/lib/background-options";
import { StoryVisual } from "@/components/story-visual";

const REACTION_ICONS = {
  fire: Flame,
  mindblown: Sparkles,
  relatable: Handshake,
  shipped: Rocket,
} as const;

export function FeedTile({ entry }: { entry: FeedEntry }) {
  const { visual, stats } = entry;
  const href = `/u/${entry.author.handle}/${entry.slug}/${entry.chapterIndex}`;
  const visualStory = {
    name: entry.tagline,
    stack: visual?.stack ?? [],
    storyBackgroundId: visual?.storyBackgroundId ?? DEFAULT_STORY_BACKGROUND_ID,
    artifactMedia: visual?.coverUrl ? [{ id: "cover", kind: "cover" as const, url: visual.coverUrl }] : [],
  };

  return (
    <article className="feed-tile">
      <Link href={href}>
        <div className="feed-tile__visual">
          <StoryVisual story={visualStory} variant="compact" />
          {visual ? (
            <>
              <span className="feed-tile__status">
                <span className={`status-dot status-dot--${statusClass[visual.status]}`} aria-hidden="true" />
                {visual.status}
              </span>
              <span className="feed-tile__category">{categoryLabel(visual.category)}</span>
            </>
          ) : null}
          {entry.chapterIndex > 1 ? <span className="feed-tile__update-badge">UPDATE · CH. {entry.chapterIndex}</span> : null}
        </div>
        <div className="feed-tile__body">
          <h3 className="feed-tile__title">{entry.tagline}</h3>
          {stats?.headlineFact ? (
            <div className="feed-tile__fact">
              <small>Key finding</small>
              <strong>{stats.headlineFact}</strong>
            </div>
          ) : null}
          {stats ? (
            <div className="feed-tile__stats" aria-label="Build statistics">
              <span><small>Sessions</small><strong>{stats.sessionCount}</strong></span>
              <span><small>Commits</small><strong>{stats.commits}</strong></span>
              <span><small>Build time</small><strong>{formatBuildTime(stats.buildHours)}</strong></span>
              <span><small>Model</small><strong>{stats.primaryModel?.label ?? "Not shared"}</strong></span>
            </div>
          ) : null}
          <div className="feed-tile__byline story-byline">
            <span className="avatar avatar--small">{initialsFrom(entry.author.displayName)}</span>
            <span><strong>{entry.author.displayName}</strong><small>@{entry.author.handle}</small></span>
          </div>
        </div>
      </Link>
      <footer className="feed-tile__footer">
        {(Object.keys(REACTION_ICONS) as Array<keyof typeof REACTION_ICONS>).map((kind) => {
          const Icon = REACTION_ICONS[kind];
          return (
            <span key={kind}>
              <Icon size={14} strokeWidth={2} aria-hidden="true" /> {entry.reactionCounts[kind]}
            </span>
          );
        })}
        <span className="feed-tile__footer-comments">
          <MessageCircle size={14} strokeWidth={2} aria-hidden="true" /> {entry.commentCount}
        </span>
      </footer>
    </article>
  );
}
