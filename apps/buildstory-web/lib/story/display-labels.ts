/** Human-readable label for a story category value; falls back to a title-cased version of unknown values. */
export function categoryLabel(value: string) {
  return (
    {
      saas: "SaaS",
      "ai-ml": "AI / ML",
      "web-apps": "Web apps",
      "developer-tools": "Developer tools",
      "design-tools": "Design tools",
      automation: "Automation",
      "data-analytics": "Data & analytics",
      productivity: "Productivity",
      games: "Games",
      other: "Other",
    }[value] ?? value.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ")
  );
}

/** Maps a public story's status to the `.status-dot--*` / `.status-pill--*` CSS suffix. */
export const statusClass: Record<"shipped" | "building" | "prototype", string> = {
  shipped: "shipped",
  building: "building",
  prototype: "experiment",
};

export function formatBuildTime(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}
