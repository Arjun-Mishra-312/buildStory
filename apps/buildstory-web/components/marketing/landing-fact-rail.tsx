"use client";

import { useRef, type KeyboardEvent } from "react";
import Link from "next/link";

type FactCard = {
  index: string;
  label: string;
  value: string;
  title: string;
  copy: string;
  tone: "coral" | "cobalt" | "ink";
};

const facts: FactCard[] = [
  { index: "01", label: "NIGHT-OWL RHYTHM", value: "27%", title: "of sessions started after 10pm", copy: "Your build had a late-night pulse, with activity peaking around 22:00 local time.", tone: "coral" },
  { index: "02", label: "TOOL BREADTH", value: "58 tools", title: "kept the build moving", copy: "The report can show the range of tools you reached for instead of flattening the work into one model name.", tone: "cobalt" },
  { index: "03", label: "LONGEST SESSION", value: "38h 50m", title: "ran far beyond the median", copy: "A single marathon session can tell a different story than the average build day.", tone: "ink" },
  { index: "04", label: "DELEGATION", value: "54", title: "subagent delegations", copy: "See how often work moved between you and other agents during the build.", tone: "cobalt" },
  { index: "05", label: "EVIDENCE-BACKED INSIGHTS", value: "8", title: "moments changed the build", copy: "The report keeps the turning points that shaped the release, with source metadata attached.", tone: "coral" },
];

export function LandingFactRail() {
  const railRef = useRef<HTMLDivElement>(null);

  function move(direction: number) {
    const rail = railRef.current;
    if (!rail) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({ left: direction * Math.min(rail.clientWidth * 0.72, 520), behavior: reducedMotion ? "auto" : "smooth" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
  }

  return (
    <section className="fact-rail-section section-wrap" id="facts" aria-labelledby="facts-heading">
      <header className="fact-rail__header">
        <div className="section-index">( WHAT YOUR BUILD REVEALS )</div>
        <div className="fact-rail__heading"><h2 id="facts-heading">What did your build reveal about you?</h2><p>These are the kinds of facts that surface when the work behind the artifact becomes visible.</p></div>
        <div className="fact-rail__controls" aria-label="Fact cards">
          <button type="button" onClick={() => move(-1)} aria-label="Show previous build fact">&larr;</button>
          <button type="button" onClick={() => move(1)} aria-label="Show next build fact">&rarr;</button>
        </div>
      </header>
      <div className="fact-rail" ref={railRef} tabIndex={0} onKeyDown={handleKeyDown} role="region" aria-label="Example facts from the Vibe-social report">
        {facts.map((fact) => <article className={`fact-card fact-card--${fact.tone}`} key={fact.index}><span className="fact-card__index">{fact.index}</span><span className="fact-card__label">{fact.label}</span><strong>{fact.value}</strong><h3>{fact.title}</h3><p>{fact.copy}</p></article>)}
      </div>
      <p className="fact-rail__caption">Example discoveries from <Link href="/u/arjun-mishra/vibe-social">Vibe-social&apos;s public report</Link>. Your report will be different.</p>
    </section>
  );
}
