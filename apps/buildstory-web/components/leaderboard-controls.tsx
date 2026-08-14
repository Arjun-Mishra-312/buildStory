import Link from "next/link";

export function BuilderAvatar({
  name,
  url,
  className = "avatar",
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  const initial = name.slice(0, 1).toUpperCase() || "B";
  if (url) return <img src={url} alt="" className={className} />;
  return <span className={className}>{initial}</span>;
}

export function leaderboardHref(metric: string, period: string) {
  const params = new URLSearchParams();
  params.set("metric", metric);
  params.set("period", period);
  return `/leaderboard?${params.toString()}`;
}

export function LeaderboardToggles({ metric, period }: { metric: string; period: string }) {
  return (
    <div className="leaderboard-toolbar">
      <div className="leaderboard-toggles" role="group" aria-label="Ranking metric">
        <Link className={`button button--small ${metric === "spend" ? "button--primary" : "button--secondary"}`} href={leaderboardHref("spend", period)} aria-current={metric === "spend" ? "page" : undefined}>Spend</Link>
        <Link className={`button button--small ${metric === "tokens" ? "button--primary" : "button--secondary"}`} href={leaderboardHref("tokens", period)} aria-current={metric === "tokens" ? "page" : undefined}>Tokens</Link>
      </div>
      <div className="leaderboard-toggles" role="group" aria-label="Time window">
        <Link className={`button button--small ${period === "7d" ? "button--primary" : "button--secondary"}`} href={leaderboardHref(metric, "7d")} aria-current={period === "7d" ? "page" : undefined}>7 days</Link>
        <Link className={`button button--small ${period === "30d" ? "button--primary" : "button--secondary"}`} href={leaderboardHref(metric, "30d")} aria-current={period === "30d" ? "page" : undefined}>30 days</Link>
        <Link className={`button button--small ${period === "all-time" ? "button--primary" : "button--secondary"}`} href={leaderboardHref(metric, "all-time")} aria-current={period === "all-time" ? "page" : undefined}>All time</Link>
      </div>
    </div>
  );
}
