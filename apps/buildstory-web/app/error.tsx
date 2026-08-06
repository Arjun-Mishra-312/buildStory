"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="error-state" role="alert">
      <span className="section-index">( SOMETHING WENT OFF TRAIL )</span>
      <h1>That page hit an unexpected snag.</h1>
      <p>Try once more. If it keeps happening, the issue is likely on our side.</p>
      <button className="button button--primary" type="button" onClick={() => reset()}>Try again</button>
    </section>
  );
}
