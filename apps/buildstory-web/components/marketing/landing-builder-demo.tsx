"use client";

import Link from "next/link";
import { BuilderProfilePublic } from "@/components/report/builder-profile-public";
import { EXAMPLE_STORY_HREF } from "@/lib/marketing/generate";

const DEMO_PROFILE = {
  scores: {
    planning: { value: 31, rawInputs: {}, formula: "weighted plan-before-edit ratio" },
    steering: { value: 18, rawInputs: {}, formula: "weighted course-correction ratio" },
    execution: { value: 100, rawInputs: {}, formula: "weighted completion ratio" },
    engineering: { value: 56, rawInputs: {}, formula: "weighted verification ratio" },
    productInstinct: { value: 9, rawInputs: {}, formula: "weak completion-and-feedback proxy" },
  },
  archetype: {
    name: "Night Owl" as const,
    rationale: ["Peak activity clustered around late evening sessions.", "Long release blocks combined debugging, verification, and privacy review."],
  },
  workPatterns: {
    peakHours: [22, 15, 10],
    preferredDays: ["Sunday", "Monday"],
    medianSessionMinutes: 84,
    longestSessionMinutes: 2330,
    primaryModel: "claude-sonnet-5",
    timezoneLabel: "America/Vancouver",
    nightShare: 41,
    morningShare: 12,
    weekendShare: 38,
    distinctToolCount: 58,
  },
};

const DEMO_STORY = {
  sessionCount: 51,
  activeDays: 7,
  buildHours: 38.8,
  subagentCount: 54,
  models: [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "Anthropic", requests: 9908, tokenUsage: null, costMicroUsd: 840510000, share: 68 },
    { id: "claude-opus-5", label: "Claude Opus 5", provider: "Anthropic", requests: 2331, tokenUsage: null, costMicroUsd: 190720000, share: 15 },
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", provider: "OpenAI", requests: 2186, tokenUsage: null, costMicroUsd: 184230000, share: 15 },
  ],
  tools: [
    { id: "exec", label: "exec", category: "agent" as const, sessions: 51, callCount: 4968 },
    { id: "codex", label: "codex", category: "agent" as const, sessions: 40, callCount: 812 },
    { id: "browser", label: "browser", category: "agent" as const, sessions: 28, callCount: 430 },
  ],
};

const DEMO_COUNTS = { total: 12, byKey: { "night-owl": 4 } };

export function LandingBuilderDemo({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? "landing-demo landing-demo--embed" : "landing-demo section-wrap"} id={embedded ? undefined : "builder"}>
      {embedded ? (
        <p className="landing-showcase__lede">Which kind of builder was this session? The card is drawn from the trail — not a personality quiz.</p>
      ) : (
        <header className="landing-demo__intro">
          <div className="section-index">( BUILDER PROFILE )</div>
          <h2>Which kind of builder was this session?</h2>
          <p>Each report draws a card from the trail — Night Owl, Shipping Machine, Explorer, and the rest. The reveal is computed from the session, not a personality quiz.</p>
        </header>
      )}
      <BuilderProfilePublic
        profile={DEMO_PROFILE}
        story={DEMO_STORY}
        seed="landing-vibe-social"
        archetypeCounts={DEMO_COUNTS}
        interactive
      />
      <p className="landing-demo__caption">
        Example from <Link href={EXAMPLE_STORY_HREF}>Vibe-social&apos;s public report</Link>. Draw the card, then generate your own on your machine.
      </p>
    </div>
  );
}
