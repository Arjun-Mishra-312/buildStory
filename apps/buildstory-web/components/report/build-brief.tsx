import type { PublicBrief } from "@/lib/report/public-brief";

export function BuildBrief({ brief, tone = "public" }: { brief: PublicBrief; tone?: "public" | "personal" }) {
  const wrong = brief.wentWrong[0] ?? null;
  const changed = brief.changed[0] ?? null;
  return (
    <section className="build-brief build-brief--masthead section-wrap" aria-label={tone === "personal" ? "Here's how this one went" : "The build in 30 seconds"}>
      <span>{tone === "personal" ? "HERE'S HOW THIS ONE WENT" : "THE BUILD IN 30 SECONDS"}</span>
      <h2>{brief.headline || brief.goal}</h2>
      <ul>
        {wrong ? <li><small>What went wrong</small><p>{wrong}</p></li> : null}
        {changed ? <li><small>What changed</small><p>{changed}</p></li> : null}
        {brief.result ? <li><small>Result</small><p>{brief.result}</p></li> : null}
      </ul>
    </section>
  );
}
