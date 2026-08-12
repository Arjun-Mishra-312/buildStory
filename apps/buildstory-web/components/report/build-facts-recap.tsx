import type { Signal, StoryPackSignalFinding } from "@/lib/ingestion/scanner-project-snapshot";

export function BuildFactsRecap({
  signals,
  framing = [],
}: {
  signals: Signal[];
  framing?: StoryPackSignalFinding[];
}) {
  if (!signals.length) return null;
  const framingBySignal = new Map(framing.map((finding) => [finding.signalId, finding]));

  return (
    <div className="build-facts-recap" aria-label={`${signals.length} facts computed from the build`}>
      {signals.map((signal, index) => {
        const finding = framingBySignal.get(signal.id);
        return (
          <article
            className={`build-facts-recap__item${index === 0 || index === signals.length - 1 ? " build-facts-recap__item--wide" : ""}`}
            data-family={signal.family}
            key={signal.id}
          >
            <header>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <small>{signal.family.replaceAll("-", " ")}</small>
            </header>
            <h3>{signal.headline}</h3>
            {finding?.title && finding.title !== signal.headline ? <strong>{finding.title}</strong> : null}
            <p>{finding?.summary ?? signal.detail}</p>
            <footer>Straight from the build</footer>
          </article>
        );
      })}
    </div>
  );
}
