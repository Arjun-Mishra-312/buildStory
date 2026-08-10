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
const DONUT_SIZE = 72;
const DONUT_RADIUS = 26;
const DONUT_STROKE = 9;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
// Labels grow leftward into the open space beside the donut - the donut sits
// near the tile's right edge, so a label growing rightward would run off the
// card. Vertical placement still follows each slice's angle, so a label's
// row roughly lines up with where its slice sits (top slices label above
// center, bottom slices below), even though horizontal growth is fixed.
const LABEL_VERTICAL_RADIUS = DONUT_SIZE / 2 + 4;
const LABEL_MAX_CHARS = 14;

function truncateModelLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

type DonutArc = { slice: ModelShareSlice; dash: number; offset: number; midAngleDeg: number; color: string };

function donutArcsFrom(breakdown: ModelShareSlice[]): DonutArc[] {
  const total = breakdown.reduce((sum, slice) => sum + slice.share, 0) || 1;
  return breakdown.reduce<DonutArc[]>((arcs, slice, index) => {
    const dash = (slice.share / total) * DONUT_CIRCUMFERENCE;
    const previous = arcs[arcs.length - 1];
    const offset = previous ? previous.offset + previous.dash : 0;
    const midAngleDeg = ((offset + dash / 2) / DONUT_CIRCUMFERENCE) * 360;
    const color = MODEL_SLICE_COLORS[index % MODEL_SLICE_COLORS.length];
    return [...arcs, { slice, dash, offset, midAngleDeg, color }];
  }, []);
}

// Two slices on opposite sides of the donut can land at nearly the same
// vertical position (labels only vary by row, not by angle around a fixed
// horizontal anchor - see LABEL_VERTICAL_RADIUS above), which would stack
// their text on top of each other. Sort by each label's natural row and push
// down any row that lands within LABEL_MIN_GAP of the one above it.
const LABEL_MIN_GAP = 14;

type DonutLabel = { key: string; text: string; color: string; top: number };

function resolveLabelRows(arcs: DonutArc[]): DonutLabel[] {
  const center = DONUT_SIZE / 2;
  const withIdealTop = arcs.map((arc) => {
    const rad = ((arc.midAngleDeg - 90) * Math.PI) / 180;
    return { key: arc.slice.label, text: truncateModelLabel(arc.slice.label), color: arc.color, idealTop: center + LABEL_VERTICAL_RADIUS * Math.sin(rad) };
  });
  const sorted = [...withIdealTop].sort((a, b) => a.idealTop - b.idealTop);
  return sorted.reduce<DonutLabel[]>((rows, item) => {
    const previous = rows[rows.length - 1];
    const top = previous ? Math.max(item.idealTop, previous.top + LABEL_MIN_GAP) : item.idealTop;
    return [...rows, { key: item.key, text: item.text, color: item.color, top }];
  }, []);
}

function ModelDonut({ breakdown }: { breakdown: ModelShareSlice[] }) {
  const arcs = donutArcsFrom(breakdown);
  const center = DONUT_SIZE / 2;
  return (
    <div className="feed-tile__model-donut" aria-hidden="true" style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
      <svg viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} width={DONUT_SIZE} height={DONUT_SIZE} role="img">
        <title>Model usage breakdown</title>
        <circle cx={center} cy={center} r={DONUT_RADIUS + DONUT_STROKE / 2 + 4} fill="var(--surface-strong)" />
        <circle cx={center} cy={center} r={DONUT_RADIUS} fill="none" stroke="var(--surface-soft)" strokeWidth={DONUT_STROKE} />
        {arcs.map(({ slice, dash, offset, color }) => (
          <circle
            key={slice.label}
            cx={center}
            cy={center}
            r={DONUT_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={DONUT_STROKE}
            strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${center} ${center})`}
          >
            <title>{`${slice.label} · ${slice.share}%`}</title>
          </circle>
        ))}
      </svg>
      {resolveLabelRows(arcs).map(({ key, text, color, top }) => (
        <span key={key} className="feed-tile__model-donut-label" style={{ top, color }}>
          {text}
        </span>
      ))}
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
