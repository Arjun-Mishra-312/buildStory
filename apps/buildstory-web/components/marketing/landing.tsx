import Link from "next/link";
import { LandingReceipt } from "@/components/landing-receipt";

const principles = [
  ["01", "Your code stays local.", "The scanner turns private project history into a redacted snapshot before anything leaves your machine."],
  ["02", "Context beats output.", "Build stories foreground the decisions, failed ideas, and feedback that a repository alone cannot explain."],
  ["03", "Proof without posturing.", "Receipts show the shape of the work without pretending that tokens, commits, or hours are a scoreboard."],
] as const;

export function MarketingLanding() {
  return (
    <>
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="eyebrow"><span className="eyebrow__dot" />A community for the people building with AI</div>
          <h1>Every build has<span>a story.</span></h1>
          <p className="landing-hero__lede">Share the decisions, detours, tools, and turning points behind what you ship — with a private-first snapshot you control.</p>
          <div className="landing-hero__actions">
            <Link className="button button--primary" href="/explore">Explore build stories <span aria-hidden="true">↗</span></Link>
            <Link className="button button--text" href="/p/orbit-notes">See a real build receipt <span aria-hidden="true">→</span></Link>
          </div>
          <div className="landing-hero__trust" aria-label="Product promises"><span><i aria-hidden="true">✓</i> Private by default</span><span><i aria-hidden="true">✓</i> Redacted locally</span><span><i aria-hidden="true">✓</i> You edit every word</span></div>
        </div>
        <LandingReceipt />
      </section>
      <section className="marquee" aria-label="What Buildstory captures"><div><span>DECISIONS</span><i>✦</i><span>FALSE STARTS</span><i>✦</i><span>MODEL MIX</span><i>✦</i><span>COMMITS</span><i>✦</i><span>MILESTONES</span><i>✦</i><span>WHAT CHANGED</span></div></section>
      <section className="manifesto section-wrap" id="manifesto"><div className="section-index">( WHY BUILDSTORY )</div><div className="manifesto__statement"><p>Software has never been easier to start — or harder to understand from the outside.</p><h2>The artifact is only half the work.<span>We’re here for the other half.</span></h2></div></section>
      <section className="principles section-wrap">{principles.map(([number, title, copy]) => <article className="principle" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</section>
      <section className="how-it-works section-wrap" id="how-it-works"><div className="how-it-works__intro"><div className="section-index">( FROM REPO TO STORY )</div><h2>Private evidence in. Public story out.</h2><p>The local scanner hands one validated, redacted snapshot to your private workspace — and you decide what becomes public.</p><Link className="button button--primary" href="/signin?callbackUrl=/studio">Open the creator workflow <span aria-hidden="true">→</span></Link></div><ol className="process-list"><li><span>1</span><div><small>SCAN LOCALLY</small><h3>Read the shape of the work</h3><p>Sessions, Git history, model usage, and milestones become a typed snapshot.</p></div></li><li><span>2</span><div><small>REVIEW PRIVATELY</small><h3>See the generated report first</h3><p>Inspect provenance and redactions before choosing what the public story can say.</p></div></li><li><span>3</span><div><small>PUBLISH DELIBERATELY</small><h3>Edit the story, keep the receipt</h3><p>Your voice frames the narrative. The receipt keeps the process grounded.</p></div></li></ol></section>
      <section className="closing-cta section-wrap"><span className="closing-cta__note">BUILD IN PUBLIC, WITHOUT GIVING EVERYTHING AWAY.</span><h2>The next great project deserves more than a launch post.</h2><div><Link className="button button--inverse" href="/explore">Start with the stories <span aria-hidden="true">↗</span></Link><p>Scanner available now, local-first · <Link href="/leaderboard">Leaderboards built to resist gaming</Link>.</p></div></section>
    </>
  );
}
