import type { Signal } from "@/lib/ingestion/scanner-project-snapshot";

export type RecapSlideKind = "title" | "scale" | "signature" | "turning" | "receipt" | "close";

const ILLUSTRATION = {
  nightOwl: "/assets/illustrations/build-profiles/night-owl.webp",
  weekendWarrior: "/assets/illustrations/build-profiles/weekend-warrior.webp",
  marathon: "/assets/illustrations/build-profiles/marathon-coder.webp",
  sprinter: "/assets/illustrations/build-profiles/sprinter.webp",
  earlyBird: "/assets/illustrations/build-profiles/early-bird.webp",
  explorer: "/assets/illustrations/build-profiles/explorer.webp",
  debugDetective: "/assets/illustrations/build-profiles/debug-detective.webp",
  deepThinker: "/assets/illustrations/build-profiles/deep-thinker.webp",
  perfectionist: "/assets/illustrations/build-profiles/perfectionist.webp",
  rapidPrototyper: "/assets/illustrations/build-profiles/rapid-prototyper.webp",
  refactorMachine: "/assets/illustrations/build-profiles/refactor-machine.webp",
  shippingMachine: "/assets/illustrations/build-profiles/shipping-machine.webp",
  moon: "/assets/illustrations/tools/moon.webp",
  sunrise: "/assets/illustrations/tools/sunrise.webp",
  toolbox: "/assets/illustrations/tools/tool-box.webp",
  coffee: "/assets/illustrations/tools/coffee.webp",
  keyboard: "/assets/illustrations/tools/keyboard.webp",
  commitTree: "/assets/illustrations/tools/commit-tree.webp",
  filePile: "/assets/illustrations/tools/file-pile.webp",
  longContext: "/assets/illustrations/tools/long-context-scroll.webp",
  magnifying: "/assets/illustrations/story-moments/magnifying-glass-investigation.webp",
  bug: "/assets/illustrations/story-moments/bug.webp",
  rocket: "/assets/illustrations/story-moments/rocket-launch.webp",
  shipped: "/assets/illustrations/story-moments/successful-deployment.webp",
  path: "/assets/illustrations/story-moments/path-journey.webp",
  mountain: "/assets/illustrations/story-moments/mountain-milestone.webp",
  lock: "/assets/illustrations/story-moments/privacy-lock.webp",
  puzzle: "/assets/illustrations/story-moments/puzzle-pieces.webp",
  receipt: "/assets/illustrations/models/receipt.webp",
  tokens: "/assets/illustrations/models/token-stacks.webp",
  coins: "/assets/illustrations/models/coins.webp",
} as const;

const SIGNAL_ART: Record<string, string> = {
  "night-owl-share": ILLUSTRATION.nightOwl,
  "weekend-share": ILLUSTRATION.weekendWarrior,
  "longest-session": ILLUSTRATION.marathon,
  "busiest-day": ILLUSTRATION.sprinter,
  "busiest-weekday": ILLUSTRATION.weekendWarrior,
  "longest-gap": ILLUSTRATION.path,
  "tool-dominance": ILLUSTRATION.toolbox,
  "tool-breadth": ILLUSTRATION.toolbox,
  "subagent-usage": ILLUSTRATION.puzzle,
  "most-talkative-session": ILLUSTRATION.keyboard,
  "completion-rate": ILLUSTRATION.mountain,
  "plan-mode-discipline": ILLUSTRATION.deepThinker,
  "cache-hit-ratio": ILLUSTRATION.tokens,
  "reasoning-share": ILLUSTRATION.deepThinker,
  "token-heaviest-session": ILLUSTRATION.tokens,
  "lines-per-commit": ILLUSTRATION.commitTree,
  "merge-ratio": ILLUSTRATION.commitTree,
  "evidence-selectivity": ILLUSTRATION.magnifying,
};

const FAMILY_ART: Record<Signal["family"], string> = {
  rhythm: ILLUSTRATION.moon,
  tooling: ILLUSTRATION.toolbox,
  conversation: ILLUSTRATION.keyboard,
  spend: ILLUSTRATION.coins,
  output: ILLUSTRATION.commitTree,
  evidence: ILLUSTRATION.magnifying,
};

const SLIDE_ART: Record<RecapSlideKind, string> = {
  title: ILLUSTRATION.path,
  scale: ILLUSTRATION.mountain,
  signature: ILLUSTRATION.nightOwl,
  turning: ILLUSTRATION.magnifying,
  receipt: ILLUSTRATION.receipt,
  close: ILLUSTRATION.rocket,
};

const ARCHETYPE_ART: Record<string, string> = {
  "Night Owl": ILLUSTRATION.nightOwl,
  Architect: ILLUSTRATION.deepThinker,
  "Quality Guardian": ILLUSTRATION.perfectionist,
  "Shipping Machine": ILLUSTRATION.shippingMachine,
  "Velocity Machine": ILLUSTRATION.shippingMachine,
  "Early Bird": ILLUSTRATION.earlyBird,
  Explorer: ILLUSTRATION.explorer,
  "Debug Detective": ILLUSTRATION.debugDetective,
  "Rapid Prototyper": ILLUSTRATION.rapidPrototyper,
  "Refactor Machine": ILLUSTRATION.refactorMachine,
  Sprinter: ILLUSTRATION.sprinter,
  "Weekend Warrior": ILLUSTRATION.weekendWarrior,
  "Marathon Coder": ILLUSTRATION.marathon,
};

export function kickerForFamily(family: Signal["family"]): string {
  if (family === "rhythm") return "Night work";
  if (family === "spend") return "The spend";
  if (family === "tooling") return "The toolkit";
  if (family === "output") return "By the numbers";
  if (family === "conversation") return "The talk";
  return "How we know";
}

export function formatSignalValue(signal: Pick<Signal, "value" | "unit">): string {
  if (signal.unit === "minutes") {
    const hours = Math.floor(signal.value / 60);
    const mins = Math.round(signal.value % 60);
    if (hours >= 1) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    return `${Math.round(signal.value)}m`;
  }
  if (signal.unit === "%") return `${Math.round(signal.value)}%`;
  if (signal.unit === "tokens" || signal.value >= 10_000) {
    return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(signal.value);
  }
  if (Number.isInteger(signal.value)) return String(signal.value);
  return String(Math.round(signal.value * 10) / 10);
}

export function formatSignalUnit(signal: Pick<Signal, "value" | "unit">): string {
  if (signal.unit === "minutes") return "";
  if (signal.unit === "%") return "";
  return signal.unit;
}

export function illustrationForSignal(signal: Pick<Signal, "id" | "family">): string {
  const id = signal.id.toLowerCase();
  if (id.includes("token")) return ILLUSTRATION.tokens;
  if (id.includes("longest")) return ILLUSTRATION.marathon;
  if (id.includes("night")) return ILLUSTRATION.nightOwl;
  if (id.includes("weekday") || id.includes("weekend")) return ILLUSTRATION.weekendWarrior;
  if (id.includes("tool")) return ILLUSTRATION.toolbox;
  if (id.includes("line")) return ILLUSTRATION.commitTree;
  return SIGNAL_ART[signal.id] ?? FAMILY_ART[signal.family] ?? ILLUSTRATION.mountain;
}

export function illustrationForArchetype(name: string | null | undefined): string {
  if (!name) return ILLUSTRATION.shippingMachine;
  return ARCHETYPE_ART[name] ?? ILLUSTRATION.shippingMachine;
}

export function illustrationForSlideKind(kind: RecapSlideKind, signal?: Pick<Signal, "id" | "family"> | null): string {
  if (signal) return illustrationForSignal(signal);
  return SLIDE_ART[kind];
}

export function howWeKnowForSignal(signal: Pick<Signal, "detail" | "formula">): string {
  return signal.detail.trim() || `Computed from ${signal.formula}.`;
}

export function featuredSignals(signals: Signal[], limit = 3): Signal[] {
  return [...signals]
    .filter((signal) => signal.notability > 0)
    .sort((left, right) => right.notability - left.notability || left.id.localeCompare(right.id))
    .slice(0, limit);
}
