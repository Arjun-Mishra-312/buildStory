import Link from "next/link";
import { GithubStarButton } from "@/components/github-star-button";
import { LandingReceipt } from "@/components/landing-receipt";
import { GenerateCommand } from "@/components/marketing/generate-command";
import { LandingLeaderboard } from "@/components/marketing/landing-leaderboard";
import { LandingShowcase } from "@/components/marketing/landing-showcase";
import { getPinnedBadgesByUserIds } from "@/lib/badges/store";
import { getLeaderboard } from "@/lib/leaderboard/store";
import {
  EXAMPLE_STORY_HREF,
  STUDIO_CONNECT_SIGNIN_HREF,
} from "@/lib/marketing/generate";

async function loadLeaderboard() {
  try {
    const entries = await getLeaderboard("30d", 5, "spend");
    const badgeChips = await getPinnedBadgesByUserIds(entries.map((entry) => entry.user.id)).catch(
      () => new Map(),
    );
    return { entries, badgeChips, unavailable: false };
  } catch {
    return { entries: [], badgeChips: new Map(), unavailable: true };
  }
}

export async function MarketingLanding() {
  const board = await loadLeaderboard();
  return (
    <>
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="eyebrow"><span className="eyebrow__dot" />A private report for every AI-assisted build</div>
          <h1>Your AI build,<span>decoded.</span></h1>
          <p className="landing-hero__lede">Generate a report on your machine with no account. The scanner is open source. BuildStory.com is optional when you want the interactive report, a public chapter, or the community.</p>
          <div className="landing-hero__actions">
            <GenerateCommand />
            <Link className="button button--text" href={EXAMPLE_STORY_HREF}>View a real report <span aria-hidden="true">&rarr;</span></Link>
          </div>
          <p className="landing-hero__engine">
            <GithubStarButton />
          </p>
          <div className="landing-hero__trust" aria-label="Product promises">
            <span><i aria-hidden="true">&#10003;</i> No account required</span>
            <span><i aria-hidden="true">&#10003;</i> Redacted locally</span>
            <span><i aria-hidden="true">&#10003;</i> Scanner is open source</span>
            <span><i aria-hidden="true">&#10003;</i> Private by default</span>
          </div>
        </div>
        <LandingReceipt />
      </section>

      <LandingShowcase />
      <LandingLeaderboard entries={board.entries} badgeChips={board.badgeChips} unavailable={board.unavailable} />

      <section className="how-it-works how-it-works--tight section-wrap" id="how-it-works">
        <div className="how-it-works__intro">
          <div className="section-index">( FROM REPO TO REPORT )</div>
          <h2>Every build has a story. Start on your machine.</h2>
          <p>The local scanner writes a redacted report next to the repo. Connecting to BuildStory is optional — only when you want the hosted interactive report, history, or a public chapter.</p>
        </div>
        <ol className="process-list process-list--tight">
          <li><span>1</span><div><small>SCAN LOCALLY</small><h3>No account. One command.</h3><p>Sessions, Git counts, model usage, and milestones become a typed snapshot on your machine.</p></div></li>
          <li><span>2</span><div><small>READ THE REPORT</small><h3>Stay on your machine</h3><p>Inspect the story, receipt, signals, and evidence before anything is offered to a hosted product.</p></div></li>
          <li><span>3</span><div><small>OPTIONAL</small><h3>Open it on BuildStory</h3><p>Sign in to connect, upload one snapshot, and choose what, if anything, becomes public.</p></div></li>
        </ol>
      </section>

      <section className="privacy-callout privacy-callout--tight section-wrap" id="privacy-boundary">
        <div className="section-index">( PRIVACY BOUNDARY )</div>
        <div className="privacy-callout__body">
          <h2>Private until you say otherwise.</h2>
          <p>Recognized emails, file paths, URLs, hostnames, and known secret formats are redacted locally. Local generate never phones home. Publishing is an explicit review step.</p>
          <Link className="button button--text" href="/privacy">Read how privacy works <span aria-hidden="true">&rarr;</span></Link>
        </div>
        <div className="privacy-callout__facts" aria-label="Privacy guarantees">
          <span><strong>01</strong> Redacted locally</span>
          <span><strong>02</strong> Report private by default</span>
          <span><strong>03</strong> You choose what becomes public</span>
        </div>
      </section>

      <section className="closing-cta section-wrap">
        <span className="closing-cta__note">YOUR BUILD HAS MORE TO SAY.</span>
        <h2>Find out what your build knows about itself.</h2>
        <div>
          <GenerateCommand className="landing-command--on-ink" />
          <p>Then, if you want history and a public chapter, <Link href={STUDIO_CONNECT_SIGNIN_HREF}>open it on BuildStory</Link>.</p>
        </div>
      </section>
    </>
  );
}
