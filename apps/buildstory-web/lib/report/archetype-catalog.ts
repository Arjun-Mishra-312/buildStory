import {
  ARCHETYPES,
  archetypeFacetKey,
  canonicalArchetypeName,
  type BuilderProfile,
  type ComputedArchetype,
} from "@/lib/ingestion/profile";

export type PublicArchetypeCounts = {
  total: number;
  byKey: Record<string, number>;
};

export type ArchetypeCatalogEntry = {
  name: ComputedArchetype;
  kicker: string;
  signifies: string;
  traits: [string, string, string];
};

const CATALOG: Record<ComputedArchetype, Omit<ArchetypeCatalogEntry, "name">> = {
  "Night Owl": {
    kicker: "The build happens after dark.",
    signifies: "This card is drawn when the work refuses the ordinary day. Sessions cluster after ten, when the house is quiet and the model can run without interruption. It is not a mood — it is a measured rhythm: this build prefers the dark.",
    traits: ["Works past the conventional day", "Peak hours cluster after 10pm", "Quiet hours, long stretches"],
  },
  "Early Bird": {
    kicker: "First to the keyboard.",
    signifies: "This card is drawn when the trail starts before the day fills up. Morning hours carry the heaviest sessions, and the work is already in motion while the rest of the calendar is still empty. It reads as a preference for a clean first pass, not a slogan about mornings.",
    traits: ["Sessions start with the morning", "Peak hours before 10am", "Ships before the day fills up"],
  },
  "Weekend Warrior": {
    kicker: "Weekdays wait. Weekends don't.",
    signifies: "This card is drawn when Saturday and Sunday hold more of the build than the working week. The calendar bends around the project. It does not mean the builder is unavailable — it means the serious work happens off the clock, in blocks the weekday cannot spare.",
    traits: ["Most sessions land on Saturday or Sunday", "The calendar bends around the build", "Off-hours delivery"],
  },
  "Marathon Coder": {
    kicker: "One sitting. The whole arc.",
    signifies: "This card is drawn when a single session outruns the rest of the window. The longest block is not a spike of overtime — it is the shape of how the problem was held. The builder stays in the room until the arc closes.",
    traits: ["Sessions run far past the median", "Stays in the problem until it yields", "Longest block defines the window"],
  },
  Architect: {
    kicker: "Plans, then moves.",
    signifies: "This card is drawn when planning and engineering both score high enough to set the path. Edits arrive after a map. The trail shows structure before speed: the builder would rather be right about the shape than early with the wrong one.",
    traits: ["High planning before edits", "Engineering discipline shows up in the trail", "Structure before speed"],
  },
  "Quality Guardian": {
    kicker: "Verify, then ship.",
    signifies: "This card is drawn when verification is the loudest engineering signal. Tests, checks, and careful delivery outrun raw pace. The work is allowed to leave only after it has been made to prove itself.",
    traits: ["Engineering outruns everything else", "Tests and checks stay in the mix", "Careful delivery over raw pace"],
  },
  "Shipping Machine": {
    kicker: "The work leaves the building.",
    signifies: "This card is drawn when execution is the clearest signal in the window. Commits, tool calls, and finished sessions keep pace with each other. Deliberation is present, but it does not stall the thing from shipping.",
    traits: ["Execution is the loudest signal", "Commits and tool calls keep pace", "Delivery over deliberation"],
  },
  Explorer: {
    kicker: "A wide toolkit, one window.",
    signifies: "This card is drawn when the builder reaches for many instruments instead of one hammer. The trail is broad: reads, searches, edits, and checks in the same window. A path is chosen after the territory has been walked.",
    traits: ["Reaches for many different tools", "Explores before locking a path", "Breadth over a single hammer"],
  },
};

const RARITY_FLOOR = 8;

export function catalogEntry(name: string | null | undefined): ArchetypeCatalogEntry {
  const canonical = canonicalArchetypeName(name ?? "Shipping Machine");
  const key = (ARCHETYPES as readonly string[]).includes(canonical) ? (canonical as ComputedArchetype) : "Shipping Machine";
  return { name: key, ...CATALOG[key] };
}

export function evidenceLine(
  name: string | null | undefined,
  patterns: BuilderProfile["workPatterns"] | null | undefined,
): string | null {
  if (!patterns) return null;
  const canonical = catalogEntry(name).name;
  if (canonical === "Night Owl" && (patterns.nightShare ?? 0) > 0) {
    return `${patterns.nightShare}% of sessions started between 10pm and 5am`;
  }
  if (canonical === "Early Bird" && (patterns.morningShare ?? 0) > 0) {
    return `${patterns.morningShare}% of sessions started between 5am and 10am`;
  }
  if (canonical === "Weekend Warrior" && (patterns.weekendShare ?? 0) > 0) {
    return `${patterns.weekendShare}% of sessions landed on a weekend`;
  }
  if (canonical === "Marathon Coder" && patterns.longestSessionMinutes > 0 && patterns.medianSessionMinutes > 0) {
    const ratio = Math.round((patterns.longestSessionMinutes / patterns.medianSessionMinutes) * 10) / 10;
    return `Longest session was ${ratio}× the median`;
  }
  if (canonical === "Explorer" && (patterns.distinctToolCount ?? 0) > 0) {
    return `Reached for ${patterns.distinctToolCount} different tools`;
  }
  if (patterns.peakHours.length) {
    const hours = patterns.peakHours.slice(0, 3).map((hour) => `${String(hour).padStart(2, "0")}:00`).join(", ");
    return `Peak hours ${hours} ${patterns.timezoneLabel}`;
  }
  return null;
}

export function rarityCopy(name: string | null | undefined, counts: PublicArchetypeCounts | null | undefined): string {
  if (!counts || counts.total < RARITY_FLOOR) return "A rarer rhythm in this catalog";
  const key = archetypeFacetKey(name ?? "Shipping Machine");
  const count = counts.byKey[key] ?? 0;
  return `${count} of ${counts.total} published builds`;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function decoyArchetypes(drawn: string | null | undefined, seed: string, count = 4): ComputedArchetype[] {
  const drawnName = catalogEntry(drawn).name;
  const remaining = ARCHETYPES.filter((name) => name !== drawnName);
  let state = hashSeed(seed);
  const picked: ComputedArchetype[] = [];
  while (picked.length < count && remaining.length) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const index = state % remaining.length;
    picked.push(remaining.splice(index, 1)[0]!);
  }
  return picked;
}

export function fanArchetypes(drawn: string | null | undefined, seed: string): ComputedArchetype[] {
  const face = catalogEntry(drawn).name;
  const decoys = decoyArchetypes(face, seed, 4);
  return [decoys[0] ?? "Architect", decoys[1] ?? "Explorer", face, decoys[2] ?? "Early Bird", decoys[3] ?? "Weekend Warrior"];
}
