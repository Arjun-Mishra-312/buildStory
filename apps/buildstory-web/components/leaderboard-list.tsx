import Link from "next/link";
import { BuilderAvatar } from "@/components/leaderboard-controls";
import { LeaderboardBadgeChips } from "@/components/profile-badges";
import type { PublicBadgeAward } from "@/lib/badges/contracts";
import type { LeaderboardEntry } from "@/lib/leaderboard/contracts";
import { formatUsageSpend, formatUsageTokens } from "@/lib/usage/format";

export function LeaderboardList({
  entries,
  badgeChips,
  compact = false,
}: {
  entries: LeaderboardEntry[];
  badgeChips: Map<string, PublicBadgeAward[]>;
  compact?: boolean;
}) {
  return (
    <ol className={`leaderboard-list${compact ? " leaderboard-list--compact" : ""}`}>
      {entries.map((entry) => (
        <li key={entry.user.id} className="leaderboard-list__row">
          <span className="leaderboard-list__rank">{entry.rank}</span>
          <Link className="leaderboard-list__identity" href={`/u/${entry.user.handle}`}>
            <BuilderAvatar name={entry.user.displayName} url={entry.user.avatarUrl} className="avatar avatar--small" />
            <span>
              <strong>{entry.user.displayName}</strong>
              <small>@{entry.user.handle}</small>
            </span>
            <LeaderboardBadgeChips awards={badgeChips.get(entry.user.id) ?? []} />
          </Link>
          <span className="leaderboard-list__stat">
            <strong>{formatUsageSpend(entry.spendMicroUsd)}</strong>
            <small>est. spend</small>
          </span>
          <span className="leaderboard-list__stat">
            <strong>{formatUsageTokens(entry.tokens)}</strong>
            <small>tokens</small>
          </span>
          {compact ? null : (
            <>
              <span className="leaderboard-list__stat">
                <strong>{entry.commitCount.toLocaleString("en-US")}</strong>
                <small>commits</small>
              </span>
              <span className="leaderboard-list__stat">
                <strong>{entry.activeDays}</strong>
                <small>active days</small>
              </span>
              <span className="leaderboard-list__stat">
                <strong>{entry.lastActiveAt ?? "—"}</strong>
                <small>last active</small>
              </span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
