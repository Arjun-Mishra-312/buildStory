"use client";

import { useEffect, useState } from "react";
import { LandingBadges } from "@/components/marketing/landing-badges";
import { LandingBuilderDemo } from "@/components/marketing/landing-builder-demo";
import { LandingFactRail } from "@/components/marketing/landing-fact-rail";

const TABS = [
  { id: "facts", label: "The receipt" },
  { id: "builder", label: "Builder card" },
  { id: "badges", label: "Badges" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, "");
  if (id === "builder" || id === "badges" || id === "facts") return id;
  return "facts";
}

export function LandingShowcase() {
  const [tab, setTab] = useState<TabId>("facts");

  useEffect(() => {
    function sync() {
      setTab(tabFromHash(window.location.hash));
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function select(id: TabId) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <section className="landing-showcase section-wrap" id="inside" aria-labelledby="inside-heading">
      <header className="landing-showcase__intro">
        <div className="section-index">( INSIDE THE REPORT )</div>
        <h2 id="inside-heading">The same report, opened.</h2>
        <p>The hero is a still. Flip through what that example actually holds — facts, the builder card, and the badges a published trail can earn.</p>
      </header>
      <div className="landing-showcase__tabs" role="tablist" aria-label="Example report surfaces">
        {TABS.map((item) => (
          <button
            key={item.id}
            className="landing-showcase__tab"
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => select(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="landing-showcase__stage">
        <div className="landing-showcase__panel" id="facts" role="tabpanel" aria-labelledby="tab-facts" hidden={tab !== "facts"}>
          <LandingFactRail embedded />
        </div>
        <div className="landing-showcase__panel" id="builder" role="tabpanel" aria-labelledby="tab-builder" hidden={tab !== "builder"}>
          <LandingBuilderDemo embedded />
        </div>
        <div className="landing-showcase__panel" id="badges" role="tabpanel" aria-labelledby="tab-badges" hidden={tab !== "badges"}>
          <LandingBadges embedded />
        </div>
      </div>
    </section>
  );
}
