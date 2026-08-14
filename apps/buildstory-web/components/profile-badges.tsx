"use client";

import { useState } from "react";
import Link from "next/link";
import type { BadgeId, BadgeSet, ProfileBadgeView, PublicBadgeAward } from "@/lib/badges/contracts";

const SET_LABEL: Record<BadgeSet, string> = {
  endurance: "Endurance",
  volume: "Volume",
  consistency: "Consistency",
  league: "League",
};

type Props = {
  view: ProfileBadgeView;
  isOwner: boolean;
};

export function ProfileBadgesSection({ view: initial, isOwner }: Props) {
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState<PublicBadgeAward | null>(null);
  const [pinning, setPinning] = useState(false);
  const earned = [...view.showcase, ...view.collection];
  const hasAny = earned.length > 0 || (isOwner && view.locked.length > 0);
  if (!hasAny) return null;

  async function pin(badgeId: BadgeId) {
    if (!isOwner || pinning) return;
    const current = view.showcase.map((award) => award.badgeId).filter((id) => id !== badgeId);
    const next = current.length >= 3 ? [...current.slice(0, 2), badgeId] : [...current, badgeId];
    setPinning(true);
    try {
      const response = await fetch("/api/creator/badges", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { badges: ProfileBadgeView };
      setView(payload.badges);
    } finally {
      setPinning(false);
    }
  }

  return (
    <section className="profile-badges" aria-label="Build badges">
      <span className="section-index">( BUILD BADGES )</span>
      <p className="profile-usage__note">
        Feats from published scans — a named receipt, not a personality card. Pin three to showcase.
      </p>
      {view.completedSets.length > 0 ? (
        <p className="profile-badges__sets">
          {view.completedSets.map((set) => (
            <span key={set} className="profile-badges__ribbon">
              {SET_LABEL[set]} set complete
            </span>
          ))}
        </p>
      ) : null}
      {view.showcase.length > 0 ? (
        <ul className="profile-badges__showcase">
          {view.showcase.map((award) => (
            <li key={award.badgeId}>
              <button className={`build-badge build-badge--${award.rarity} build-badge--lg`} type="button" onClick={() => setOpen(award)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={award.assetPath} alt="" />
                <strong>{award.name}</strong>
                <small>{award.evidence.label}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {view.collection.length > 0 || view.locked.length > 0 ? (
        <ul className="profile-badges__grid">
          {view.collection.map((award) => (
            <li key={award.badgeId}>
              <button className={`build-badge build-badge--${award.rarity}`} type="button" onClick={() => setOpen(award)} title={award.evidence.label}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={award.assetPath} alt="" />
                <span>{award.name}</span>
              </button>
            </li>
          ))}
          {view.locked.map((entry) => (
            <li key={entry.badgeId}>
              <div className="build-badge build-badge--locked" title={entry.kicker}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={entry.assetPath} alt="" />
                <span>{entry.name}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div className="build-badge-dialog-backdrop" role="presentation" onClick={() => setOpen(null)}>
          <div className="build-badge-dialog" role="dialog" aria-modal="true" aria-labelledby="build-badge-title" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`build-badge__art build-badge--${open.rarity}`} src={open.assetPath} alt="" />
            <p className="build-badge-dialog__rarity">{open.rarity}</p>
            <h2 id="build-badge-title">{open.name}</h2>
            <p>{open.kicker}</p>
            <p className="build-badge-dialog__evidence">{open.evidence.label}</p>
            {open.sourceStoryHref ? <Link href={open.sourceStoryHref}>View the story that earned it</Link> : null}
            {isOwner ? (
              <button className="button button--secondary button--small" type="button" disabled={pinning} onClick={() => void pin(open.badgeId)}>
                Pin to showcase
              </button>
            ) : null}
            <button className="button button--text" type="button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function StorySeals({ awards }: { awards: PublicBadgeAward[] }) {
  if (awards.length === 0) return null;
  return (
    <ul className="story-seals" aria-label="Build badges earned on this story">
      {awards.map((award) => (
        <li key={award.badgeId} className={`build-badge build-badge--${award.rarity} build-badge--seal`} title={`${award.name} — ${award.evidence.label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={award.assetPath} alt="" />
          <span>
            <strong>{award.name}</strong>
            <small>{award.evidence.label}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LeaderboardBadgeChips({ awards }: { awards: PublicBadgeAward[] }) {
  if (awards.length === 0) return null;
  return (
    <span className="leaderboard-badges">
      {awards.map((award) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={award.badgeId} src={award.assetPath} alt={award.name} title={`${award.name} — ${award.evidence.label}`} />
      ))}
    </span>
  );
}
