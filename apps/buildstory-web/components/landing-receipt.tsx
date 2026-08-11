import Link from "next/link";

const modelMix = [
  ["claude-sonnet-5", "68%", "68%"],
  ["claude-opus-5", "16%", "16%"],
  ["gpt-5.6-sol", "15%", "15%"],
  ["gpt-5.6-luna", "1%", "1%"],
] as const;

export function LandingReceipt() {
  return (
    <div className="landing-art" aria-label="Example Buildstory private report preview">
      <div className="landing-art__annotation"><span>EXAMPLE</span><p>Vibe-social · Aug 4–10, 2026</p></div>
      <article className="landing-report-preview">
        <header className="landing-report-preview__header">
          <div>
            <span className="landing-report-preview__kicker">AI BUILD REPORT / VIBE-SOCIAL</span>
            <h2>Vibe-social</h2>
            <p>51 repository-scoped AI sessions · 7 active days</p>
          </div>
          <span className="landing-report-preview__stamp">PRIVATE BY DEFAULT</span>
        </header>

        <dl className="landing-report-preview__stats">
          <div><dt>AI SESSIONS</dt><dd>51</dd></div>
          <div><dt>COMMITS</dt><dd>78</dd></div>
          <div><dt>TOKENS</dt><dd>4.2B</dd></div>
          <div><dt>EST. SPEND</dt><dd>$1,233.71</dd></div>
        </dl>

        <div className="landing-report-preview__body">
          <section className="landing-report-preview__insight">
            <span className="landing-report-preview__label">EVIDENCE-BACKED MOMENT</span>
            <h3>The Publish Button Was Disabled and Its Errors Swallowed</h3>
            <p>A silent failure became a concrete fix after tracing the exact path from button to handler.</p>
            <Link className="landing-report-preview__link" href="/u/arjun-mishra/vibe-social">View the full report <span aria-hidden="true">&rarr;</span></Link>
          </section>
          <section className="landing-report-preview__mix">
            <span className="landing-report-preview__label">MODEL MIX BY REQUESTS</span>
            {modelMix.map(([name, percentage, width]) => <div className="landing-report-preview__model" key={name}><span>{name}</span><i style={{ width }} /><strong>{percentage}</strong></div>)}
          </section>
        </div>

        <footer className="landing-report-preview__footer">
          <span><i aria-hidden="true">&#10003;</i> Snapshot verified</span>
          <span><i aria-hidden="true">&#9673;</i> Redacted locally</span>
        </footer>
      </article>
    </div>
  );
}
