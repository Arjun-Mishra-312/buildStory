import Link from "next/link";
import type { ActiveHighlight } from "@/lib/ingestion/contracts";

/**
 * Additive to Explore only - never touches the real organic ranking below it.
 * Renders nothing when there are no active highlights (no empty-state clutter).
 */
export function ProPicksRail({ highlights }: { highlights: ActiveHighlight[] }) {
  if (highlights.length === 0) return null;

  return (
    <section className="pro-picks-rail" aria-label="Pro Picks">
      <div className="pro-picks-rail__heading">
        <span className="section-index">( PRO PICKS )</span>
        <span className="pro-picks-rail__note">Spotlighted by their creators - not a ranking.</span>
      </div>
      <div className="pro-picks-rail__track">
        {highlights.map((highlight) => (
          <Link key={highlight.reportId} href={highlight.publicUrl} className="pro-picks-card">
            {highlight.coverUrl ? (
              <span className="pro-picks-card__cover" style={{ backgroundImage: `url(${highlight.coverUrl})` }} aria-hidden="true" />
            ) : (
              <span className="pro-picks-card__cover pro-picks-card__cover--empty" aria-hidden="true" />
            )}
            <span className="pro-picks-card__body">
              <strong>{highlight.tagline}</strong>
              <span>@{highlight.ownerHandle}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
