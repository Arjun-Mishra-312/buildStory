import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ANTI_GAMING_MAX_COMMITS_PER_DAY } from "@/lib/leaderboard/contracts";
import { getLeaderboard } from "@/lib/leaderboard/store";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Builders ranked on verified, provenance-backed commit activity across their published build stories.",
};

export const dynamic = "force-dynamic";

async function loadEntries() {
  try {
    return await getLeaderboard("all-time", 50);
  } catch {
    return [];
  }
}

export default async function LeaderboardPage() {
  const entries = await loadEntries();
  return (
    <div className="page-shell">
      <SiteHeader active="leaderboard" />
      <main className="leaderboard-page section-wrap">
        <header className="explore-heading">
          <div>
            <span className="section-index">( LEADERBOARD )</span>
            <h1>Ranked on sustained<br />building, not burst.</h1>
          </div>
          <p>
            Score is verified commits across a builder&apos;s published projects, capped at{" "}
            {ANTI_GAMING_MAX_COMMITS_PER_DAY} commits per active day per project - one overnight
            run cannot outrank weeks of real work.
          </p>
        </header>
        {entries.length === 0 ? (
          <p className="leaderboard-empty">No published, ranked builders yet.</p>
        ) : (
          <ol className="leaderboard-list">
            {entries.map((entry) => (
              <li key={entry.user.id} className="leaderboard-list__row">
                <span className="leaderboard-list__rank">{entry.rank}</span>
                <span className="leaderboard-list__identity">
                  <strong>{entry.user.displayName}</strong>
                  <small>@{entry.user.handle}</small>
                </span>
                <span className="leaderboard-list__stat">
                  <strong>{entry.score}</strong>
                  <small>verified commits</small>
                </span>
                <span className="leaderboard-list__stat">
                  <strong>{entry.activeDays}</strong>
                  <small>active days</small>
                </span>
                <span className="leaderboard-list__stat">
                  <strong>{entry.storyCount}</strong>
                  <small>published {entry.storyCount === 1 ? "story" : "stories"}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
