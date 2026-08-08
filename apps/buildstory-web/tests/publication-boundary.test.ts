import assert from "node:assert/strict";
import test from "node:test";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { publicBuildStoryFromSnapshot, type PublicBuildStoryViewModel } from "../lib/build-story";
import type { ProjectSnapshot } from "../lib/project-snapshot";
import type { PublicFieldKey } from "../lib/ingestion/contracts";
import type { BuilderProfile } from "../lib/ingestion/profile";
import type { ReportStoryPackV2 } from "../lib/ingestion/scanner-project-snapshot";

/**
 * Regression net for the publication boundary (lib/build-story.ts's
 * publicBuildStoryFromSnapshot). Three real bugs shipped here because a field's
 * gate was accidentally OR'd with another field's checkbox, or a whole group of
 * fields shared one gate: "Profile narrative" force-included all seven story-pack
 * sections regardless of their own checkboxes, "Growth edge" force-included "Story
 * growth edge", and the builder profile (archetype/scores/workPatterns) was
 * all-or-nothing. This test asserts every one of the 26 PublicFieldKeys is
 * independent: removing exactly one key changes only that key's own output.
 */

const ALL_FIELDS: PublicFieldKey[] = [
  "tagline",
  "description",
  "timeWindow",
  "sessionSummary",
  "milestones",
  "modelMix",
  "costEstimate",
  "toolUsage",
  "gitAggregates",
  "redactionSummary",
  "archetype",
  "profileScores",
  "workPatterns",
  "narrative",
  "storyBuildArc",
  "storyMoments",
  "storyTurningPoint",
  "storyDecisions",
  "storyLearnings",
  "storyTraits",
  "storyGrowthEdge",
  "decisionPatterns",
  "standoutTraits",
  "growthEdge",
  "artifactLinks",
  "artifactMedia",
];

const builderProfile: BuilderProfile = {
  scores: {
    planning: { value: 70, rawInputs: { a: 1 }, formula: "x" },
    steering: { value: 60, rawInputs: { a: 1 }, formula: "x" },
    execution: { value: 80, rawInputs: { a: 1 }, formula: "x" },
    engineering: { value: 65, rawInputs: { a: 1 }, formula: "x" },
    productInstinct: { value: 55, rawInputs: { a: 1 }, formula: "x" },
  },
  archetype: { name: "Architect", rationale: ["Ships deliberately."] },
  workPatterns: {
    peakHours: [9, 10, 14],
    preferredDays: ["Tuesday", "Wednesday"],
    medianSessionMinutes: 42,
    longestSessionMinutes: 120,
    primaryModel: "gpt-5.4-codex",
    timezoneLabel: "UTC",
  },
};

const storyPack: ReportStoryPackV2 = {
  version: "2.0.0",
  sources: [
    {
      ref: "src_1",
      provider: "codex",
      occurredAt: "2026-07-10T00:00:00.000Z",
      evidenceRefs: ["ev_1"],
      metrics: { turns: 4, assistantMessages: 4, toolCalls: 3 },
    },
  ],
  hero: { headline: "How Orbit Notes came together", summary: "A research trail that finally held still." },
  buildArc: [{ phase: "discover", headline: "Discover", summary: "Explored the space.", sourceRefs: ["src_1"] }],
  moments: [
    {
      phase: "decide",
      kind: "decision",
      title: "Chose local-first sync",
      whatHappened: "Swapped a server-authoritative model for CRDT-style merges.",
      whyItMattered: "Removed the fragile reconnect bug testers kept hitting.",
      sourceRefs: ["src_1"],
    },
  ],
  turningPoint: { quote: "It clicked once offline stopped meaning fragile.", sourceRefs: ["src_1"] },
  decisions: [{ title: "Picked SQLite", rationale: "Simpler ops than a hosted DB.", outcome: "Shipped faster.", sourceRefs: ["src_1"] }],
  learnings: [{ title: "Test earlier", detail: "Caught the merge bug two weeks late.", sourceRefs: ["src_1"] }],
  standoutTraits: [{ title: "Methodical", detail: "Verified every merge path before shipping.", sourceRefs: ["src_1"] }],
  growthEdge: { title: "Delegate more", observation: "Did every session solo.", nextStep: "Pair on the next release.", sourceRefs: ["src_1"] },
};

const snapshot: ProjectSnapshot = {
  ...(structuredClone(orbitNotesSnapshot) as ProjectSnapshot),
  builderProfile,
  narrative: {
    headline: "Narrative headline",
    narrative: "Narrative body text.",
    turningPoint: "Plain-text turning point.",
    learnings: ["Learning one."],
    decisionPatterns: ["Pattern one."],
    standoutTraits: ["Trait one."],
    growthEdge: "Plain-text growth edge.",
    storyPack,
    fallbacksUsed: [],
  },
};

const editorial = { tagline: "Public tagline", description: "Public description.", reflection: "What changed my mind.", category: "web-apps" as const };
const artifact = {
  projectUrl: "https://example.com",
  repoUrl: "https://github.com/example/example",
  videoUrl: "https://www.youtube.com/watch?v=abc123",
  media: [{ id: "m1", url: "https://cdn.example.com/a.png", kind: "cover" as const }],
};

type Public = PublicBuildStoryViewModel;

const accessors: Record<PublicFieldKey, (p: Public) => unknown> = {
  tagline: (p) => p.tagline,
  description: (p) => [p.description, p.reflection],
  timeWindow: (p) => [p.dateRange, p.activeDays],
  sessionSummary: (p) => [p.sessionCount, p.subagentCount, p.buildHours],
  milestones: (p) => p.milestones,
  modelMix: (p) => ({ modelRequests: p.modelRequests, ids: p.models.map((m) => m.id), tokenUsage: p.tokenUsage }),
  costEstimate: (p) => p.cost,
  toolUsage: (p) => p.tools,
  gitAggregates: (p) => ({ commits: p.git.commits, additions: p.git.additions, deletions: p.git.deletions, filesTouched: p.git.filesTouched, branches: p.git.branches }),
  redactionSummary: (p) => p.redaction.tokensRemoved,
  archetype: (p) => p.profile?.archetype ?? null,
  profileScores: (p) => p.profile?.scores ?? null,
  workPatterns: (p) => p.profile?.workPatterns ?? null,
  narrative: (p) => (p.narrative ? { headline: p.narrative.headline, narrative: p.narrative.narrative, turningPoint: p.narrative.turningPoint, learnings: p.narrative.learnings } : null),
  storyBuildArc: (p) => p.storyPack?.buildArc ?? [],
  storyMoments: (p) => p.storyPack?.moments ?? [],
  storyTurningPoint: (p) => p.storyPack?.turningPoint.quote ?? "",
  storyDecisions: (p) => p.storyPack?.decisions ?? [],
  storyLearnings: (p) => p.storyPack?.learnings ?? [],
  storyTraits: (p) => p.storyPack?.standoutTraits ?? [],
  storyGrowthEdge: (p) => p.storyPack?.growthEdge.title ?? "",
  decisionPatterns: (p) => p.decisionPatterns,
  standoutTraits: (p) => p.standoutTraits,
  growthEdge: (p) => p.growthEdge,
  artifactLinks: (p) => p.artifactLinks,
  artifactMedia: (p) => p.artifactMedia,
};

const hiddenValue: Record<PublicFieldKey, unknown> = {
  tagline: "",
  description: ["", ""],
  timeWindow: ["Private build window", 0],
  sessionSummary: [0, 0, 0],
  milestones: [],
  modelMix: { modelRequests: 0, ids: [], tokenUsage: null },
  costEstimate: null,
  toolUsage: [],
  gitAggregates: { commits: 0, additions: 0, deletions: 0, filesTouched: 0, branches: 0 },
  redactionSummary: 0,
  archetype: null,
  profileScores: null,
  workPatterns: null,
  narrative: null,
  storyBuildArc: [],
  storyMoments: [],
  storyTurningPoint: "",
  storyDecisions: [],
  storyLearnings: [],
  storyTraits: [],
  storyGrowthEdge: "",
  decisionPatterns: [],
  standoutTraits: [],
  growthEdge: "",
  artifactLinks: { projectUrl: null, repoUrl: null, videoUrl: null },
  artifactMedia: [],
};

function project(fields: PublicFieldKey[]): Public {
  return publicBuildStoryFromSnapshot(snapshot, fields, editorial, artifact, {});
}

const full = project(ALL_FIELDS);

// Sanity check: every accessor must observe *something* on the fully-selected
// projection, or a field removal test below could pass for the wrong reason
// (comparing empty against empty).
test("fixture sanity: every field is non-empty when fully selected", () => {
  for (const field of ALL_FIELDS) {
    const value = accessors[field](full);
    assert.notDeepEqual(value, hiddenValue[field], `${field} fixture must produce a non-hidden value`);
  }
});

for (const field of ALL_FIELDS) {
  test(`removing "${field}" hides only that field`, () => {
    const withoutField = project(ALL_FIELDS.filter((candidate) => candidate !== field));
    assert.deepEqual(accessors[field](withoutField), hiddenValue[field], `${field} should be hidden when its own key is removed`);
    for (const other of ALL_FIELDS) {
      if (other === field) continue;
      assert.deepEqual(
        accessors[other](withoutField),
        accessors[other](full),
        `${other} should be unaffected by removing ${field}`,
      );
    }
  });
}

// Direct regressions for the three bugs this file exists to catch, spelled out by
// name rather than only relying on the generic matrix above.
test("regression: 'narrative' no longer force-includes every story-pack section", () => {
  const narrativeOnly = project(["tagline", "narrative"]);
  assert.equal(narrativeOnly.storyPack, null, "no story-pack section was selected, so storyPack must be absent entirely");
});

test("regression: 'growthEdge' no longer force-includes 'storyGrowthEdge'", () => {
  const withoutStoryGrowthEdge = project(ALL_FIELDS.filter((field) => field !== "storyGrowthEdge"));
  assert.equal(withoutStoryGrowthEdge.storyPack?.growthEdge.title, "", "storyGrowthEdge must hide even while growthEdge stays selected");
});

test("regression: builder profile sub-fields are independently gated", () => {
  const scoresOnly = project(["tagline", "profileScores"]);
  assert.notEqual(scoresOnly.profile?.scores, null, "profileScores selected alone must still show scores");
  assert.equal(scoresOnly.profile?.archetype, null, "archetype must stay hidden when only profileScores is selected");
  assert.equal(scoresOnly.profile?.workPatterns, null, "workPatterns must stay hidden when only profileScores is selected");
});
