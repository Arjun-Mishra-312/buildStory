"use client";

import { useState } from "react";

export type StoryInsightItem = {
  id: string;
  group: string;
  title: string;
  body: string;
};

export function StoryInsightIndex({ items }: { items: StoryInsightItem[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const groups = [...new Map(items.map((item) => [item.group, items.filter((entry) => entry.group === item.group)])).entries()];

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!items.length) return null;

  return (
    <section className="story-insight-index" aria-label="Learnings and how the build changed">
      <header>
        <span>WHAT THE BUILD TAUGHT</span>
        <strong>Expand any row for the full detail</strong>
      </header>
      <div className="story-insight-index__grid">
        {groups.map(([group, groupItems]) => (
          <article key={group}>
            <span>{group}</span>
            <ul>
              {groupItems.map((item) => {
                const open = openIds.has(item.id);
                return (
                  <li key={item.id} className={open ? "is-open" : undefined}>
                    <button type="button" aria-expanded={open} onClick={() => toggle(item.id)}>
                      <strong>{item.title}</strong>
                      <span className="story-insight-index__chevron" aria-hidden="true">▾</span>
                    </button>
                    {open ? <p>{item.body}</p> : null}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
