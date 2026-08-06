import type { Metadata } from "next";
import { ANTI_GAMING_MAX_COMMITS_PER_DAY } from "@/lib/leaderboard/contracts";
import { getLeaderboard } from "@/lib/leaderboard/store";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Builders ranked on verified, provenance-backed commit activity across their published build stories.",
};

export const dynamic = "force-dynamic";

async function loadEntries() {
  try {
    return { entries: await getLeaderboard("all-time", 50), unavailable: false };
  } catch {
    return { entries: [], unavailable: true };
  }
}

export default async function LeaderboardPage() {
  const { entries, unavailable } = await loadEntries();
  return (
    <section className="leaderboard-page section-wrap">
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
          <div className={`leaderboard-empty ${unavailable ? "leaderboard-empty--error" : ""}`} role={unavailable ? "alert" : "status"}>
            <strong>{unavailable ? "Leaderboard temporarily unavailable." : "No published, ranked builders yet."}</strong>
            <p>{unavailable ? "The story store did not respond. Try again in a moment." : "Publish a build story and verified activity will appear here."}</p>
            {unavailable ? <a href="/leaderboard">Try again</a> : null}
          </div>
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
    </section>
  );
}
