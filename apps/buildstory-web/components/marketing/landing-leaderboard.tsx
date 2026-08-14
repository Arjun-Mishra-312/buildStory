import Link from "next/link";
import { LeaderboardList } from "@/components/leaderboard-list";
import type { PublicBadgeAward } from "@/lib/badges/contracts";
import type { LeaderboardEntry } from "@/lib/leaderboard/contracts";

const EXAMPLE_ENTRIES: LeaderboardEntry[] = [
  {
    rank: 1,
    user: { id: "example-1", handle: "example", displayName: "Example builder", avatarUrl: null },
    spendMicroUsd: 1233710000,
    tokens: 4_199_999_999,
    commitCount: 78,
    activeDays: 7,
    lastActiveAt: "2026-08-10",
    sessionCount: 51,
    storyCount: 1,
  },
];

export function LandingLeaderboard({
  entries,
  badgeChips,
  unavailable,
}: {
  entries: LeaderboardEntry[];
  badgeChips: Map<string, PublicBadgeAward[]>;
  unavailable: boolean;
}) {
  const live = entries.length > 0 && !unavailable;
  const rows = live ? entries : EXAMPLE_ENTRIES;
  const chips = live ? badgeChips : new Map<string, PublicBadgeAward[]>();

  return (
    <section className="landing-board section-wrap" id="board">
      <header className="landing-demo__intro">
        <div className="section-index">( LEADERBOARD )</div>
        <h2>Who is on the board.</h2>
        <p>
          {live
            ? "Live ranking, last 30 days, from published scans — a rate-card estimate, not billed invoices."
            : unavailable
              ? "The live board is temporarily unavailable. This is a labeled example of how ranking reads."
              : "No published ranking yet. This is a labeled example of how the board will read."}
        </p>
      </header>
      <LeaderboardList entries={rows} badgeChips={chips} compact />
      <p className="landing-demo__caption">
        {live ? null : <span className="landing-board__example">EXAMPLE · </span>}
        <Link href="/leaderboard">Open the full leaderboard</Link>
      </p>
    </section>
  );
}
