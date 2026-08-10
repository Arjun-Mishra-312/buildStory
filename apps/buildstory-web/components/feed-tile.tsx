import Link from "next/link";
import { Flame, Handshake, MessageCircle, Rocket, Sparkles } from "lucide-react";
import type { FeedEntry } from "@/lib/social/contracts";
import type { ModelShareSlice } from "@/lib/social/feed-projection";
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

const MODEL_SLICE_COLORS = ["var(--cobalt)", "var(--coral)", "var(--success)", "var(--faint)"];
const DONUT_RADIUS = 24;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

type DonutArc = { slice: ModelShareSlice; dash: number; offset: number };

function donutArcsFrom(breakdown: ModelShareSlice[]): DonutArc[] {
  const total = breakdown.reduce((sum, slice) => sum + slice.share, 0) || 1;
  return breakdown.reduce<DonutArc[]>((arcs, slice) => {
    const dash = (slice.share / total) * DONUT_CIRCUMFERENCE;
    const previous = arcs[arcs.length - 1];
    const offset = previous ? previous.offset + previous.dash : 0;
    return [...arcs, { slice, dash, offset }];
  }, []);
}

function ModelDonut({ breakdown }: { breakdown: ModelShareSlice[] }) {
  const arcs = donutArcsFrom(breakdown);
  return (
    <div className="feed-tile__model-donut" aria-hidden="true">
      <svg viewBox="0 0 64 64" width="56" height="56" role="img">
        <title>Model usage breakdown</title>
        <circle cx="32" cy="32" r={DONUT_RADIUS} fill="none" stroke="var(--surface-soft)" strokeWidth="9" />
        {arcs.map(({ slice, dash, offset }, index) => (
          <circle
            key={slice.label}
            cx="32"
            cy="32"
            r={DONUT_RADIUS}
            fill="none"
            stroke={MODEL_SLICE_COLORS[index % MODEL_SLICE_COLORS.length]}
            strokeWidth="9"
            strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 32 32)"
          >
            <title>{`${slice.label} · ${slice.share}%`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function FeedTile({ entry }: { entry: FeedEntry }) {
  const { visual, stats } = entry;
  const href = `/u/${entry.author.handle}/${entry.slug}/${entry.chapterIndex}`;
  const visualStory = {
    name: visual?.projectName ?? entry.tagline,
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
          {stats?.modelBreakdown ? <ModelDonut breakdown={stats.modelBreakdown} /> : null}
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
