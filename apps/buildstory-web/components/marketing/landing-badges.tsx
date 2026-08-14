"use client";

import Link from "next/link";
import { BADGES_BY_SET, badgeEntry } from "@/lib/badges/catalog";
import type { BadgeSet } from "@/lib/badges/contracts";
import { STUDIO_CONNECT_SIGNIN_HREF } from "@/lib/marketing/generate";

const SET_LABEL: Record<BadgeSet, string> = {
  endurance: "Endurance",
  volume: "Volume",
  consistency: "Consistency",
  league: "League",
};

export function LandingBadges({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? "landing-badges landing-badges--embed" : "landing-badges section-wrap"} id={embedded ? undefined : "badges"}>
      {embedded ? (
        <p className="landing-showcase__lede">Named receipts for the work. Session badges can seal a story; league and consistency badges need a published trail.</p>
      ) : (
        <header className="landing-demo__intro">
          <div className="section-index">( BUILD BADGES )</div>
          <h2>Named receipts for the work.</h2>
          <p>Session badges can seal a story. Consistency and league badges need a published trail — that part takes an account.</p>
        </header>
      )}
      <div className="landing-badge-rail" role="list" aria-label="Build badges">
        {(Object.keys(BADGES_BY_SET) as BadgeSet[]).flatMap((set) =>
          BADGES_BY_SET[set].map((id) => {
            const badge = badgeEntry(id);
            return (
              <article className="landing-badge-rail__item" key={id} role="listitem" title={badge.kicker}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={badge.assetPath} alt="" />
                <strong>{badge.name}</strong>
                <span>{SET_LABEL[set]}</span>
                <small>{badge.kicker}</small>
              </article>
            );
          }),
        )}
      </div>
      <p className="landing-demo__caption">
        Publish a chapter to start earning league badges.{" "}
        <Link href={STUDIO_CONNECT_SIGNIN_HREF}>Open it on BuildStory</Link>
        {" "}when you want the public trail.
      </p>
    </div>
  );
}
