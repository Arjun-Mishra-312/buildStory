export function LandingReceipt() {
  return (
    <div className="landing-art" aria-label="Example Buildstory report preview">
      <div className="landing-art__annotation">
        <span>03</span>
        <p>the useful part was the wrong turn</p>
      </div>
      <article className="landing-story-card">
        <div className="landing-story-card__eyebrow">
          <span className="avatar avatar--coral">AR</span>
          <span>
            <strong>Contrast FM</strong>
            <small>by Anika Rao</small>
          </span>
          <small>3 day build</small>
        </div>
        <h2>Listen to a color palette before you ship it.</h2>
        <p>
          A failed sonification made contrast easier to hear — and turned the
          whole interaction inside out.
        </p>
        <div className="landing-story-card__milestone">
          <span className="milestone-pin" aria-hidden="true" />
          <span>
            <small>Turning point · Day 2</small>
            <strong>The graph was accurate. The rhythm was useful.</strong>
          </span>
        </div>
      </article>

      <article className="landing-mini-receipt">
        <div className="landing-mini-receipt__top">
          <span>AI BUILD RECEIPT</span>
          <span>✓</span>
        </div>
        <div className="mini-receipt-row">
          <span>ACTIVE DAYS</span>
          <strong>03</strong>
        </div>
        <div className="mini-receipt-row">
          <span>SESSIONS</span>
          <strong>04</strong>
        </div>
        <div className="mini-receipt-row">
          <span>COMMITS</span>
          <strong>31</strong>
        </div>
        <div className="mini-receipt-models">
          <span>MODEL MIX</span>
          <div><i style={{ width: "68%" }} /></div>
          <small>Gemini 68% · Cursor 32%</small>
        </div>
        <div className="landing-mini-receipt__stamp">LOCALLY REDACTED</div>
      </article>
      <span className="landing-art__tape" aria-hidden="true" />
    </div>
  );
}
