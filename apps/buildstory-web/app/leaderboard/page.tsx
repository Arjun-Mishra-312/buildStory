import type { Metadata } from "next";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { LeaderboardToggles } from "@/components/leaderboard-controls";
import { LeaderboardList } from "@/components/leaderboard-list";
import {
  DEFAULT_LEADERBOARD_METRIC,
  DEFAULT_LEADERBOARD_PERIOD,
  isLeaderboardMetric,
  isLeaderboardPeriod,
} from "@/lib/leaderboard/contracts";
import { getLeaderboard } from "@/lib/leaderboard/store";
import { getPinnedBadgesByUserIds } from "@/lib/badges/store";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Builders ranked on estimated API-equivalent spend and tokens across their published build stories.",
};

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ metric?: string; period?: string }> };

async function loadEntries(period: ReturnType<typeof parsePeriod>, metric: ReturnType<typeof parseMetric>) {
  try {
    return { entries: await getLeaderboard(period, 50, metric), unavailable: false };
  } catch {
    return { entries: [], unavailable: true };
  }
}

function parsePeriod(value: string | undefined) {
  return isLeaderboardPeriod(value) ? value : DEFAULT_LEADERBOARD_PERIOD;
}

function parseMetric(value: string | undefined) {
  return isLeaderboardMetric(value) ? value : DEFAULT_LEADERBOARD_METRIC;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const metric = parseMetric(params.metric);
  const { entries, unavailable } = await loadEntries(period, metric);
  const badgeChips = await getPinnedBadgesByUserIds(entries.map((entry) => entry.user.id)).catch(() => new Map());
  return (
    <section className="leaderboard-page section-wrap">
        <header className="explore-heading">
          <div>
            <span className="section-index">( LEADERBOARD )</span>
            <h1>Ranked on estimated<br />API spend and tokens.</h1>
          </div>
          <p>
            Rank is estimated API-equivalent spend or tokens from published scans — a rate-card
            estimate, not billed invoices. Cursor sessions count toward active days when timestamps
            exist, but not toward spend or tokens today.
          </p>
        </header>
        <LeaderboardToggles metric={metric} period={period} />
        {entries.length === 0 ? (
          <div className={`leaderboard-empty ${unavailable ? "leaderboard-empty--error" : ""}`} role={unavailable ? "alert" : "status"}>
            {!unavailable ? <div className="leaderboard-empty__art"><EditorialIllustration kind="leaderboard-first-rank" /></div> : null}
            <strong>{unavailable ? "Leaderboard temporarily unavailable." : "No published, ranked builders yet."}</strong>
            <p>{unavailable ? "The story store did not respond. Try again in a moment." : "Publish a build story and estimated usage from that scan will appear here."}</p>
            {unavailable ? <a href="/leaderboard">Try again</a> : null}
          </div>
        ) : (
          <LeaderboardList entries={entries} badgeChips={badgeChips} />
        )}
    </section>
  );
}
