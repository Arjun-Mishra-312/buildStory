import Link from "next/link";
import { LandingReceipt } from "@/components/landing-receipt";
import { LandingFactRail } from "@/components/marketing/landing-fact-rail";

const principles = [
  ["01", "See the work behind the work.", "Understand the decisions, detours, and turning points that a repository alone cannot explain."],
  ["02", "Find patterns you can reuse.", "Surface your rhythms, model mix, tool habits, and the ways you move from idea to shipped software."],
  ["03", "Keep the proof, choose the audience.", "Your report stays private while you review it. Publishing is a deliberate choice, not the starting point."],
] as const;

const reportLayers = [
  ["01", "Facts", "Computed straight from the build", "Sessions, commits, models, tokens, costs, active time, and the other numbers hiding in your build history."],
  ["02", "Patterns", "A mirror for your process", "Night-owl rhythms, tool breadth, delegation habits, and the small signals that make your way of building distinct."],
  ["03", "Turning points", "Evidence-backed, not invented", "Moments that changed the direction of the build, linked back to the validated metadata behind the report."],
] as const;

export function MarketingLanding() {
  return (
    <>
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="eyebrow"><span className="eyebrow__dot" />A private report for every AI-assisted build</div>
          <h1>Your AI build,<span>decoded.</span></h1>
          <p className="landing-hero__lede">Turn your AI coding history into a private report of decisions, patterns, costs, and progress — then decide what, if anything, becomes public.</p>
          <div className="landing-hero__actions">
            <Link className="button button--primary" href="/signin?callbackUrl=%2Fstudio%2Fconnect">Generate my report <span aria-hidden="true">&rarr;</span></Link>
            <Link className="button button--text" href="/u/arjun-mishra/vibe-social">View a real report <span aria-hidden="true">&rarr;</span></Link>
          </div>
          <div className="landing-hero__trust" aria-label="Product promises">
            <span><i aria-hidden="true">&#10003;</i> Private by default</span>
            <span><i aria-hidden="true">&#10003;</i> Redacted locally</span>
            <span><i aria-hidden="true">&#10003;</i> Publishing is optional</span>
          </div>
        </div>
        <LandingReceipt />
      </section>

      <section className="marquee" aria-label="What Buildstory reveals">
        <div><span>FACTS</span><i aria-hidden="true">&#10022;</i><span>PATTERNS</span><i aria-hidden="true">&#10022;</i><span>TURNING POINTS</span><i aria-hidden="true">&#10022;</i><span>RECEIPTS</span><i aria-hidden="true">&#10022;</i><span>PRIVACY</span></div>
      </section>

      <LandingFactRail />

      <section className="landing-layers section-wrap" id="what-you-learn">
        <div className="landing-layers__intro">
          <div className="section-index">( WHAT THE REPORT HOLDS )</div>
          <h2>More than a dashboard. A mirror for the build.</h2>
          <p>Buildstory brings the quantitative shape of the work and the qualitative story around it into one report you can inspect, edit, and keep private.</p>
        </div>
        <div className="landing-layers__grid">
          {reportLayers.map(([number, title, label, copy]) => (
            <article className="landing-layer" key={number}>
              <span className="landing-layer__number">{number}</span>
              <span className="landing-layer__label">{label}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto section-wrap" id="manifesto">
        <div className="section-index">( WHY BUILDSTORY )</div>
        <div className="manifesto__statement">
          <p>Software has never been easier to start — or harder to understand from the outside.</p>
          <h2>Every build has a story.<span>Buildstory gives you the evidence behind it.</span></h2>
        </div>
      </section>

      <section className="principles section-wrap" aria-label="Buildstory principles">
        {principles.map(([number, title, copy]) => <article className="principle" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </section>

      <section className="how-it-works section-wrap" id="how-it-works">
        <div className="how-it-works__intro">
          <div className="section-index">( FROM REPO TO REPORT )</div>
          <h2>Private evidence in. Your choice out.</h2>
          <p>The local scanner hands one validated, redacted snapshot to your private workspace. Review the report first, then publish selected fields only if you want to.</p>
          <Link className="button button--primary" href="/signin?callbackUrl=%2Fstudio%2Fconnect">Start a private report <span aria-hidden="true">&rarr;</span></Link>
        </div>
        <ol className="process-list">
          <li><span>1</span><div><small>SCAN LOCALLY</small><h3>Read the shape of the work</h3><p>Sessions, Git history, model usage, and milestones become a typed, content-free snapshot.</p></div></li>
          <li><span>2</span><div><small>REVIEW PRIVATELY</small><h3>See the generated report first</h3><p>Inspect provenance, redactions, facts, and narrative before deciding what the public story can say.</p></div></li>
          <li><span>3</span><div><small>PUBLISH OPTIONALLY</small><h3>Keep it private or share selected fields</h3><p>Your voice frames the narrative. The receipt keeps the process grounded. Nothing is public until you choose it.</p></div></li>
        </ol>
      </section>

      <section className="privacy-callout section-wrap" id="privacy-boundary">
        <div className="section-index">( PRIVACY BOUNDARY )</div>
        <div className="privacy-callout__body">
          <h2>Private until you say otherwise.</h2>
          <p>Recognized emails, file paths, URLs, hostnames, and known secret formats are redacted locally before an excerpt can leave your machine. Your report stays private in your workspace; publishing is an explicit review step.</p>
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
          <Link className="button button--inverse" href="/signin?callbackUrl=%2Fstudio%2Fconnect">Generate my report <span aria-hidden="true">&rarr;</span></Link>
          <p>Publishing is optional · <Link href="/explore">Browse public reports</Link></p>
        </div>
      </section>
    </>
  );
}
