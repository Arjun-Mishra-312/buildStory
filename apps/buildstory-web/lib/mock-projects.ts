import type { ProjectSnapshot } from "./project-snapshot";
import type { BuilderProfile } from "./ingestion/profile";
import type { ReportStoryPackV3, Signal } from "./ingestion/scanner-project-snapshot";
import type { ReportIntelligence } from "./narrative/v4";

const orbitSignals: Signal[] = [
  {
    id: "orbit-output-per-commit",
    family: "output",
    headline: "The build changed 284 lines per commit",
    detail: "24,711 additions and deletions across 87 commits.",
    value: 284,
    unit: "lines",
    notability: 72,
    formula: "round((additions + deletions) / commits)",
    sourceRefs: ["orbit-src-git"],
  },
  {
    id: "orbit-model-concentration",
    family: "tooling",
    headline: "GPT-5.4 Codex handled 73% of model calls",
    detail: "184 of 251 observed model requests used GPT-5.4 Codex.",
    value: 73,
    unit: "%",
    notability: 61,
    formula: "round(100 * primaryModelRequests / totalModelRequests)",
    sourceRefs: ["orbit-src-codex", "orbit-src-claude"],
  },
  {
    id: "orbit-session-depth",
    family: "rhythm",
    headline: "The median build session ran for 191 minutes",
    detail: "Seven focused sessions carried the project from schema exploration to a signed release.",
    value: 191,
    unit: "minutes",
    notability: 78,
    formula: "median(sessionDurationMinutes)",
    sourceRefs: ["orbit-src-codex", "orbit-src-cursor"],
  },
];

const orbitProfile: BuilderProfile = {
  scores: {
    planning: { value: 84, rawInputs: { planTransitions: 18, sessions: 7 }, formula: "weighted plan-before-edit ratio" },
    steering: { value: 76, rawInputs: { revisions: 11, sessions: 7 }, formula: "weighted course-correction ratio" },
    execution: { value: 91, rawInputs: { shippedMilestones: 4, milestones: 4 }, formula: "weighted completion ratio" },
    engineering: { value: 88, rawInputs: { verificationRuns: 22, sessions: 7 }, formula: "weighted verification ratio" },
    productInstinct: { value: 81, rawInputs: { feedbackMilestones: 1, shippedMilestones: 4 }, formula: "weak completion-and-feedback proxy", caveat: "A weak proxy, not a personality measurement." },
  },
  archetype: {
    name: "Night Owl",
    rationale: [
      "Most meaningful build sessions started after the conventional workday.",
      "Long evening blocks combined deliberate planning with strong verification before shipping.",
    ],
  },
  workPatterns: {
    peakHours: [18, 19, 20, 21],
    preferredDays: ["Wednesday", "Friday"],
    medianSessionMinutes: 191,
    longestSessionMinutes: 253,
    primaryModel: "gpt-5.4-codex",
    timezoneLabel: "America/Vancouver",
  },
};

const orbitStoryPack: ReportStoryPackV3 = {
  version: "3.0.0",
  analysisTier: "deep",
  sources: [
    { ref: "orbit-src-codex", provider: "codex", sessionRef: "ses_04", occurredAt: "2026-07-15T17:02:00.000Z", evidenceRefs: ["ev_merge_plan", "ev_merge_test"], metrics: { turns: 38, assistantMessages: 31, toolCalls: 54 } },
    { ref: "orbit-src-codex-plan", provider: "codex", sessionRef: "ses_03", occurredAt: "2026-07-13T16:20:00.000Z", evidenceRefs: ["ev_merge_plan"], metrics: { turns: 29, assistantMessages: 24, toolCalls: 43 } },
    { ref: "orbit-src-codex-release", provider: "codex", sessionRef: "ses_06", occurredAt: "2026-07-22T16:51:00.000Z", evidenceRefs: ["ev_merge_test"], metrics: { turns: 34, assistantMessages: 29, toolCalls: 48 } },
    { ref: "orbit-src-claude", provider: "claude-code", sessionRef: "ses_05", occurredAt: "2026-07-18T18:44:00.000Z", evidenceRefs: ["ev_feedback_synthesis"], metrics: { turns: 21, assistantMessages: 18, toolCalls: 19 } },
    { ref: "orbit-src-claude-cut", provider: "claude-code", sessionRef: "ses_05", occurredAt: "2026-07-18T19:26:00.000Z", evidenceRefs: ["ev_feedback_synthesis"], metrics: { turns: 12, assistantMessages: 10, toolCalls: 8 } },
    { ref: "orbit-src-cursor", provider: "cursor", sessionRef: "ses_02", occurredAt: "2026-07-10T18:10:00.000Z", evidenceRefs: ["ev_search_ranking"], metrics: { turns: 16, assistantMessages: 13, toolCalls: 24 } },
    { ref: "orbit-src-git", provider: "git", occurredAt: "2026-07-25T22:18:00.000Z", evidenceRefs: ["commit:a17cf09", "commit:4d2b8e7"], metrics: { turns: 0, assistantMessages: 0, toolCalls: 87 } },
    { ref: "orbit-src-git-release", provider: "git", occurredAt: "2026-07-25T22:18:00.000Z", evidenceRefs: ["commit:4d2b8e7"], metrics: { turns: 0, assistantMessages: 0, toolCalls: 1 } },
  ],
  hero: {
    headline: "The quieter the interface became, the stronger the research trail got.",
    summary: "Orbit Notes began as an ambitious graph canvas, survived a fragile offline rewrite, and shipped only after tester feedback removed the clever controls that obscured its central promise.",
  },
  buildArc: [
    { phase: "discover", headline: "Prove the trail could answer a real question", summary: "A rough import joined six scattered sources and reconstructed why a product decision had changed.", sourceRefs: ["orbit-src-cursor", "orbit-src-git"] },
    { phase: "decide", headline: "Make offline behavior deterministic", summary: "A replayable conflict fixture turned duplicate-note failures into a merge strategy the team could reason about.", sourceRefs: ["orbit-src-codex", "orbit-src-codex-plan", "orbit-src-git"] },
    { phase: "deliver", headline: "Remove controls before adding polish", summary: "Five tester recordings narrowed the canvas, simplified capture, and created a return trail worth shipping.", sourceRefs: ["orbit-src-claude", "orbit-src-claude-cut", "orbit-src-git", "orbit-src-git-release"] },
  ],
  moments: [
    { phase: "discover", kind: "breakthrough", title: "The graph answered its first real question", whatHappened: "The first import connected six sources well enough to recover the reasoning behind an old decision.", whyItMattered: "The prototype stopped being a visualization and became a useful memory aid.", sourceRefs: ["orbit-src-cursor", "orbit-src-git"] },
    { phase: "discover", kind: "discovery", title: "Search ranking favored the useful trail", whatHappened: "A relevance pass promoted notes that completed a reasoning chain instead of the most frequently opened nodes.", whyItMattered: "The graph began returning context rather than merely displaying activity.", sourceRefs: ["orbit-src-cursor", "orbit-src-codex-plan"] },
    { phase: "decide", kind: "discovery", title: "Reconnect duplicated notes", whatHappened: "Offline persistence worked until a reconnect replayed writes and produced duplicate nodes.", whyItMattered: "The failure exposed that local-first was a consistency problem, not merely a storage choice.", sourceRefs: ["orbit-src-codex"] },
    { phase: "decide", kind: "decision", title: "Turn the bug into a replayable fixture", whatHappened: "The failure sequence became a deterministic test before the merge algorithm was rewritten.", whyItMattered: "Every proposed fix could be judged against the same evidence instead of intuition.", sourceRefs: ["orbit-src-codex", "orbit-src-codex-plan", "orbit-src-git"] },
    { phase: "decide", kind: "breakthrough", title: "Migration rehearsal exposed the stale schema", whatHappened: "A copy of the oldest notebook was opened against the new merge layer before packaging.", whyItMattered: "The rehearsal found a schema assumption that unit fixtures did not contain.", sourceRefs: ["orbit-src-codex-release", "orbit-src-git"] },
    { phase: "deliver", kind: "decision", title: "Five testers cut the canvas in half", whatHappened: "Recordings showed that advanced graph controls interrupted capture and made returning feel expensive.", whyItMattered: "Removing controls clarified the product more than another round of feature work would have.", sourceRefs: ["orbit-src-claude", "orbit-src-claude-cut"] },
    { phase: "deliver", kind: "delivery", title: "The oldest notebook survived the release candidate", whatHappened: "Migration, reconnect, and smoke-test fixtures passed against the signed candidate.", whyItMattered: "Delivery evidence covered the risky path rather than only the empty-state demo.", sourceRefs: ["orbit-src-codex", "orbit-src-codex-release", "orbit-src-git-release"] },
    { phase: "deliver", kind: "delivery", title: "v0.1 reached 38 curious people", whatHappened: "A signed desktop build shipped with migration guardrails, smoke tests, and a short known-issues list.", whyItMattered: "The team preserved honest rough edges while proving the research trail survived real use.", sourceRefs: ["orbit-src-codex-release", "orbit-src-git", "orbit-src-git-release"] },
  ],
  turningPoint: {
    quote: "The product became obvious when we stopped asking how much the graph could do and started asking how little a returning researcher needed to remember.",
    sourceRefs: ["orbit-src-claude", "orbit-src-cursor"],
  },
  decisions: [
    { title: "Keep the notebook local-first", rationale: "Research context needed to remain available without a network and without turning a hosted account into a prerequisite.", outcome: "A deterministic merge strategy replaced server-authoritative sync.", sourceRefs: ["orbit-src-codex"] },
    { title: "Delete the advanced canvas controls", rationale: "Tester recordings showed they added cognitive load before they added value.", outcome: "Capture became smaller, calmer, and easier to return to.", sourceRefs: ["orbit-src-claude"] },
    { title: "Ship with explicit rough edges", rationale: "Migration guardrails and a known-issues list made a bounded release safer than another polish cycle.", outcome: "The signed v0.1 build reached 38 early users with the risky paths documented and rehearsed.", sourceRefs: ["orbit-src-codex-release", "orbit-src-git", "orbit-src-git-release"] },
  ],
  learnings: [
    { title: "A fixture can settle an architectural argument", detail: "Replaying the exact reconnect failure made tradeoffs visible and ended speculative debate.", sourceRefs: ["orbit-src-codex", "orbit-src-git"] },
    { title: "Subtraction was the decisive product move", detail: "Removing controls revealed the core workflow more clearly than adding another graph feature.", sourceRefs: ["orbit-src-claude"] },
  ],
  standoutTraits: [
    { title: "Evidence before certainty", detail: "Important choices repeatedly followed a fixture, recording, or observed failure rather than a preference.", sourceRefs: ["orbit-src-codex", "orbit-src-claude"] },
    { title: "Patient shipping discipline", detail: "Long evening sessions paired ambitious rewrites with migration checks and release guardrails.", sourceRefs: ["orbit-src-codex", "orbit-src-git"] },
  ],
  growthEdge: {
    title: "Invite product feedback before the architecture hardens",
    observation: "The most valuable simplification arrived after the offline rewrite, when earlier recordings might have narrowed the surface sooner.",
    sourceRefs: ["orbit-src-claude", "orbit-src-codex"],
  },
  signals: orbitSignals,
  deepAnalysis: {
    openingLine: { title: "Clarity arrived through deletion", summary: "The strongest product progress came when the build stopped displaying its technical ambition and focused on helping someone recover a train of thought.", sourceRefs: ["orbit-src-claude", "orbit-src-git"], confidence: "high" },
    signatureMoves: [
      { title: "Convert uncertainty into a fixture", summary: "When sync behavior became ambiguous, the build captured the failure sequence and used it as the decision surface.", sourceRefs: ["orbit-src-codex"], confidence: "high" },
      { title: "Ship with explicit rough edges", summary: "The release paired smoke tests and migration guardrails with a short known-issues list instead of pretending the first version was complete.", sourceRefs: ["orbit-src-codex", "orbit-src-git"], confidence: "high" },
    ],
    byTheNumbers: [
      { title: "Sustained sessions carried the hard decisions", summary: "The long median session aligns with work that repeatedly moved from diagnosis through verification in one focused block.", signalId: "orbit-session-depth", sourceRefs: ["orbit-src-codex", "orbit-src-cursor"], confidence: "medium" },
      { title: "One model led, but did not work alone", summary: "The model mix shows a clear primary implementation agent alongside a meaningful secondary perspective during search and product feedback work.", signalId: "orbit-model-concentration", sourceRefs: ["orbit-src-codex", "orbit-src-claude"], confidence: "medium" },
    ],
    whereItGotHard: [
      { title: "Offline-first exposed the real systems problem", summary: "Local persistence landed quickly; deterministic reconciliation required the deeper rewrite.", sourceRefs: ["orbit-src-codex"], confidence: "high" },
      { title: "The clever canvas obscured capture", summary: "The interface looked capable, but recordings showed that capability made the first useful action harder to find.", sourceRefs: ["orbit-src-claude"], confidence: "high" },
    ],
    chapterChanges: [
      { title: "From graph playground to dependable notebook", summary: "The chapter closed with fewer controls, stronger offline guarantees, and a signed build in users' hands.", sourceRefs: ["orbit-src-claude", "orbit-src-git"], confidence: "high" },
    ],
    coverage: { sessionsSeen: 7, excerptsUsed: 9, evidenceBytes: 6842, windowStart: "2026-07-08T17:42:00.000Z", windowEnd: "2026-07-25T22:18:00.000Z" },
  },
};

const orbitReportIntelligence: ReportIntelligence = {
  pipelineMode: "on",
  reportMap: {
    version: "4.0.0",
    policy: { complexityScore: 72, complexityBand: "complex", reasoningEffort: "high", maxOutputTokens: 40000, maxExcerpts: 240, maxEvidenceCharacters: 716800 },
    sessionMaps: [
      ["ses_01", "codex", "2026-07-08T17:42:00.000Z", "2026-07-08T19:58:00.000Z", ["discover"], ["orbit-src-git"], 18, 15, 29, 4, 1],
      ["ses_02", "cursor", "2026-07-10T18:10:00.000Z", "2026-07-10T20:04:00.000Z", ["discover", "decide"], ["orbit-src-cursor"], 16, 13, 24, 3, 2],
      ["ses_03", "codex", "2026-07-13T16:20:00.000Z", "2026-07-13T19:31:00.000Z", ["decide"], ["orbit-src-codex"], 29, 24, 43, 5, 1],
      ["ses_04", "codex", "2026-07-15T17:02:00.000Z", "2026-07-15T21:14:00.000Z", ["decide", "deliver"], ["orbit-src-codex"], 38, 31, 54, 6, 2],
      ["ses_05", "claude-code", "2026-07-18T18:44:00.000Z", "2026-07-18T20:26:00.000Z", ["discover", "decide"], ["orbit-src-claude"], 21, 18, 19, 2, 1],
      ["ses_06", "codex", "2026-07-22T16:51:00.000Z", "2026-07-22T20:36:00.000Z", ["decide", "deliver"], ["orbit-src-codex", "orbit-src-git"], 34, 29, 48, 5, 1],
      ["ses_07", "codex", "2026-07-25T18:05:00.000Z", "2026-07-25T22:18:00.000Z", ["deliver"], ["orbit-src-codex", "orbit-src-git"], 31, 27, 42, 3, 2],
    ].map(([sessionRef, provider, startedAt, endedAt, phases, sourceRefs, turns, assistantMessages, toolCalls, planningTurns, models]) => ({
      sessionRef: sessionRef as string, provider: provider as string, startedAt: startedAt as string, endedAt: endedAt as string, status: "completed",
      phases: phases as Array<"discover" | "decide" | "deliver">, sourceRefs: sourceRefs as string[], facts: { turns: turns as number, assistantMessages: assistantMessages as number, toolCalls: toolCalls as number, planningTurns: planningTurns as number, models: models as number, subagents: 0 }, unresolved: false,
    })),
    coverage: { sessionsMapped: 7, sessionsWithCitations: 7, reviewedExcerptsAvailable: 34, reviewedExcerptsSelected: 34 },
  },
  claimVerification: { version: "1.0.0", status: "pass", claimCount: 26, citedClaimCount: 26, citationCoverage: 100, numericClaimsChecked: 4, issues: [] },
  qualityComparison: { baseline: { citationCoverage: 100, issueCount: 2, fallbackCount: 5 }, candidate: { citationCoverage: 100, issueCount: 0, fallbackCount: 0 }, delta: { citationCoverage: 0, issueCount: -2, fallbackCount: -5 } },
  decisionAtlas: {
    version: "1.0.0",
    nodes: [
      { nodeId: "dec_orbit_local", title: "Keep the notebook local-first", rationale: "Research context needed to remain available without a network and without a hosted-account prerequisite.", outcome: "A deterministic merge strategy replaced server-authoritative sync.", sourceRefs: ["orbit-src-codex"], eventIds: ["evt_orbit_offline_003", "evt_orbit_plan_004", "evt_orbit_verify_005"], confidence: "high", chapterValid: true },
      { nodeId: "dec_orbit_delete", title: "Delete the advanced canvas controls", rationale: "Tester recordings showed that capability added cognitive load before value.", outcome: "Capture became smaller, calmer, and easier to return to.", sourceRefs: ["orbit-src-claude"], eventIds: ["evt_orbit_feedback_006"], confidence: "medium", chapterValid: true },
      { nodeId: "dec_orbit_ship", title: "Ship with explicit rough edges", rationale: "Migration guardrails and a known-issues list made a bounded release safer than another polish cycle.", outcome: "The signed v0.1 build reached 38 early users.", sourceRefs: ["orbit-src-codex", "orbit-src-git"], eventIds: ["evt_orbit_delivery_007", "evt_orbit_ship_008"], confidence: "high", chapterValid: true },
    ],
    edges: [
      { edgeId: "edge_orbit_01", from: "dec_orbit_local", to: "dec_orbit_delete", relationship: "followed-by", sourceRefs: ["orbit-src-codex", "orbit-src-claude"], chapterValid: true },
      { edgeId: "edge_orbit_02", from: "dec_orbit_delete", to: "dec_orbit_ship", relationship: "followed-by", sourceRefs: ["orbit-src-claude", "orbit-src-codex", "orbit-src-git"], chapterValid: true },
    ],
  },
  searchIndex: [
    { documentId: "ask_orbit_sync", kind: "friction", title: "Offline-first exposed the real systems problem", body: "Reconnect replayed writes and duplicated notes. A deterministic fixture isolated the consistency failure and supported the merge rewrite.", sourceRefs: ["orbit-src-codex"], eventIds: ["evt_orbit_offline_003", "evt_orbit_plan_004", "evt_orbit_verify_005"], sessionRefs: ["ses_03", "ses_04"], searchTerms: ["architecture", "bug", "conflict", "fixture", "offline", "reconnect", "repair", "sync", "verification"] },
    { documentId: "ask_orbit_controls", kind: "decision", title: "Delete the advanced canvas controls", body: "Tester recordings showed the first architecture made capture harder. The build changed direction by removing controls and adding a return trail.", sourceRefs: ["orbit-src-claude"], eventIds: ["evt_orbit_feedback_006"], sessionRefs: ["ses_05"], searchTerms: ["abandon", "architecture", "canvas", "change", "controls", "delete", "feedback", "recordings", "tester"] },
    { documentId: "ask_orbit_release", kind: "moment", title: "v0.1 reached 38 curious people", body: "Packaging, migration guardrails, smoke tests, and a signed release followed the verification pass.", sourceRefs: ["orbit-src-codex", "orbit-src-git"], eventIds: ["evt_orbit_delivery_007", "evt_orbit_ship_008"], sessionRefs: ["ses_06", "ses_07"], searchTerms: ["delivery", "release", "ship", "smoke", "verification"] },
  ],
  patterns: [
    { patternId: "pat_orbit_evidence", title: "Evidence before certainty", detail: "Important choices repeatedly followed a fixture, tester recording, or observed failure rather than preference.", confidence: "high", observationCount: 4, sessionRefs: ["ses_03", "ses_04", "ses_05", "ses_06"], sourceRefs: ["orbit-src-codex", "orbit-src-claude"], associatedOutcomes: ["deterministic merge", "smaller capture flow", "verified package"] },
    { patternId: "pat_orbit_fixture", title: "Turn failures into replayable fixtures", detail: "The build converted ambiguous sync behavior into a fixed reproduction before selecting an implementation.", confidence: "high", observationCount: 3, sessionRefs: ["ses_03", "ses_04", "ses_06"], sourceRefs: ["orbit-src-codex", "orbit-src-git"], associatedOutcomes: ["merge strategy stabilized", "migration checks passed"] },
    { patternId: "pat_orbit_subtract", title: "Prototype, observe, then subtract", detail: "The ambitious graph established capability; tester evidence then removed what obscured the central return workflow.", confidence: "medium", observationCount: 2, sessionRefs: ["ses_01", "ses_05"], sourceRefs: ["orbit-src-cursor", "orbit-src-claude"], associatedOutcomes: ["capture flow simplified"] },
  ],
  outcomeLab: {
    version: "1.0.0",
    metrics: [
      { metricId: "verification-after-mutation", label: "Mutation sessions also verified", value: 3, unit: "sessions", detail: "Three mutation-bearing sessions were followed by verification in the same work block.", sourceEventIds: ["evt_orbit_offline_003", "evt_orbit_verify_005", "evt_orbit_delivery_007"], coverage: "observed" },
      { metricId: "verification-coverage", label: "Verification coverage", value: 75, unit: "percent", detail: "Descriptive association across four mutation-bearing sessions; not a quality score.", sourceEventIds: ["evt_orbit_verify_005", "evt_orbit_delivery_007"], coverage: "observed" },
      { metricId: "model-context-shifts", label: "Model context shifts", value: 2, unit: "events", detail: "A secondary model appeared during search and feedback work.", sourceEventIds: ["evt_orbit_search_002", "evt_orbit_feedback_006"], coverage: "observed" },
      { metricId: "delivery-moments", label: "Delivery moments", value: 3, unit: "events", detail: "Verification, packaging, and release milestones observed in the delivery phase.", sourceEventIds: ["evt_orbit_verify_005", "evt_orbit_delivery_007", "evt_orbit_ship_008"], coverage: "observed" },
    ],
    modelRoles: [
      { modelRef: "gpt-5.4-codex", discoverySessions: 2, decisionSessions: 4, deliverySessions: 3 },
      { modelRef: "claude-sonnet-4", discoverySessions: 2, decisionSessions: 2, deliverySessions: 1 },
    ],
    caveats: ["Associations do not establish causation.", "AI authorship is never inferred from Git timing.", "Tool payloads and source bodies are not retained."],
  },
  constellation: {
    version: "1.0.0", seed: "dec_7f24a6c1",
    nodes: [
      { eventId: "evt_orbit_discover_001", x: 100, y: 42, radius: 4.3, phase: "discover" }, { eventId: "evt_orbit_search_002", x: 145, y: 55, radius: 2.7, phase: "decide" },
      { eventId: "evt_orbit_offline_003", x: 163, y: 100, radius: 2.7, phase: "decide" }, { eventId: "evt_orbit_plan_004", x: 147, y: 147, radius: 3.1, phase: "decide" },
      { eventId: "evt_orbit_verify_005", x: 100, y: 169, radius: 2.6, phase: "deliver" }, { eventId: "evt_orbit_feedback_006", x: 53, y: 147, radius: 2.7, phase: "discover" },
      { eventId: "evt_orbit_delivery_007", x: 36, y: 100, radius: 2.6, phase: "deliver" }, { eventId: "evt_orbit_ship_008", x: 55, y: 55, radius: 2.6, phase: "deliver" },
    ],
    path: "M100,42 L145,55 L163,100 L147,147 L100,169 L53,147 L36,100 L55,55 Z",
  },
};

export const orbitNotesSnapshot = {
  schemaVersion: "1.0",
  identity: {
    id: "prj_orbit_notes",
    slug: "orbit-notes",
    name: "Orbit Notes",
    tagline: "A calmer way to follow a research trail.",
    description:
      "Orbit Notes turns scattered tabs, highlights, and half-formed thoughts into a spatial notebook you can return to weeks later without losing the thread.",
    status: "shipped",
    visibility: "public",
    owner: {
      id: "usr_mina_park",
      name: "Mina Park",
      handle: "minabuilds",
      role: "Independent product engineer",
    },
  },
  repository: {
    provider: "github",
    repositoryName: "orbit-notes",
    remotePath: "github.com/••••/orbit-notes",
    defaultBranch: "main",
    primaryLanguage: "TypeScript",
    languages: [
      { name: "TypeScript", percentage: 72 },
      { name: "CSS", percentage: 19 },
      { name: "Rust", percentage: 9 },
    ],
    framework: "Next.js",
    packageManager: "pnpm",
    fileCount: 284,
    initialCommitAt: "2026-07-08T17:42:00.000Z",
    currentRevision: "4d2b8e7",
    isPrivate: true,
  },
  timeWindow: {
    startedAt: "2026-07-08T17:42:00.000Z",
    endedAt: "2026-07-25T22:18:00.000Z",
    activeDays: 14,
    timezone: "America/Vancouver",
  },
  sessions: [
    {
      id: "ses_01",
      startedAt: "2026-07-08T17:42:00.000Z",
      endedAt: "2026-07-08T19:58:00.000Z",
      durationMinutes: 136,
      intent: "Frame the research graph and data model",
      outcome: "Working node schema, import flow, and first canvas prototype",
      modelIds: ["gpt-5.4-codex"],
      toolIds: ["codex", "terminal"],
      touchedAreas: ["graph", "import", "schema"],
    },
    {
      id: "ses_02",
      startedAt: "2026-07-10T18:10:00.000Z",
      endedAt: "2026-07-10T20:04:00.000Z",
      durationMinutes: 114,
      intent: "Make search useful before the graph is tidy",
      outcome: "Hybrid text and relationship ranking with highlighted paths",
      modelIds: ["gpt-5.4-codex", "claude-sonnet-4"],
      toolIds: ["codex", "cursor", "terminal"],
      touchedAreas: ["search", "ranking", "ui"],
    },
    {
      id: "ses_03",
      startedAt: "2026-07-13T16:20:00.000Z",
      endedAt: "2026-07-13T19:31:00.000Z",
      durationMinutes: 191,
      intent: "Move the notebook offline-first",
      outcome: "Local persistence landed; sync conflict handling remained fragile",
      modelIds: ["gpt-5.4-codex"],
      toolIds: ["codex", "terminal"],
      touchedAreas: ["storage", "sync", "tests"],
    },
    {
      id: "ses_04",
      startedAt: "2026-07-15T17:02:00.000Z",
      endedAt: "2026-07-15T21:14:00.000Z",
      durationMinutes: 252,
      intent: "Repair duplicated notes after reconnect",
      outcome: "Deterministic merge strategy plus a replayable conflict fixture",
      modelIds: ["gpt-5.4-codex", "claude-sonnet-4"],
      toolIds: ["codex", "cursor", "terminal"],
      touchedAreas: ["sync", "fixtures", "telemetry"],
    },
    {
      id: "ses_05",
      startedAt: "2026-07-18T18:44:00.000Z",
      endedAt: "2026-07-18T20:26:00.000Z",
      durationMinutes: 102,
      intent: "Turn five tester recordings into a tighter flow",
      outcome: "Removed graph controls, simplified capture, added a return trail",
      modelIds: ["claude-sonnet-4"],
      toolIds: ["cursor", "terminal"],
      touchedAreas: ["navigation", "capture", "onboarding"],
    },
    {
      id: "ses_06",
      startedAt: "2026-07-22T16:51:00.000Z",
      endedAt: "2026-07-22T20:36:00.000Z",
      durationMinutes: 225,
      intent: "Prepare a stable desktop build",
      outcome: "Packaging, migration guardrails, and smoke tests passed",
      modelIds: ["gpt-5.4-codex"],
      toolIds: ["codex", "terminal", "github-actions"],
      touchedAreas: ["desktop", "migrations", "ci"],
    },
    {
      id: "ses_07",
      startedAt: "2026-07-25T18:05:00.000Z",
      endedAt: "2026-07-25T22:18:00.000Z",
      durationMinutes: 253,
      intent: "Ship v0.1 without sanding away the rough edges",
      outcome: "Signed release shipped to the first 38 people",
      modelIds: ["gpt-5.4-codex", "claude-sonnet-4"],
      toolIds: ["codex", "terminal", "github-actions"],
      touchedAreas: ["release", "docs", "analytics"],
    },
  ],
  usage: {
    models: [
      {
        id: "gpt-5.4-codex",
        label: "GPT-5.4 Codex",
        provider: "OpenAI",
        requests: 184,
        tokenUsage: {
          inputTokens: 590000,
          outputTokens: 118000,
          totalTokens: 708000,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          cachedInputTokens: 0,
          reasoningOutputTokens: 0,
        },
        costMicroUsd: 1917500,
      },
      {
        id: "claude-sonnet-4",
        label: "Claude Sonnet 4",
        provider: "Anthropic",
        requests: 67,
        tokenUsage: {
          inputTokens: 206750,
          outputTokens: 41696,
          totalTokens: 248446,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          cachedInputTokens: 0,
          reasoningOutputTokens: 0,
        },
        costMicroUsd: 1245690,
      },
    ],
    tools: [
      { id: "codex", label: "Codex", category: "agent", sessions: 6, callCount: 214 },
      { id: "cursor", label: "Cursor", category: "editor", sessions: 3, callCount: 58 },
      { id: "terminal", label: "Terminal", category: "terminal", sessions: 7, callCount: 96 },
      {
        id: "github-actions",
        label: "GitHub Actions",
        category: "automation",
        sessions: 2,
        callCount: 12,
      },
    ],
    tokenUsage: {
      inputTokens: 796750,
      outputTokens: 159696,
      totalTokens: 956446,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      cachedInputTokens: 0,
      reasoningOutputTokens: 0,
    },
    cost: {
      totalMicroUsd: 3163190,
      pricedTokens: 956446,
      unpricedTokens: 0,
      pricingTableVersion: "2026-08-05.1",
    },
    coverage: null,
  },
  git: {
    commits: 87,
    mergeCommits: 4,
    additions: 18420,
    deletions: 6291,
    aiAttribution: { source: "git-ai", optIn: true, humanAdditions: 6420, aiAdditions: 12000, aiAccepted: 8730, toolModels: [{ tool: "codex", model: "gpt-5.4-codex", aiAdditions: 8420, aiAccepted: 6410 }, { tool: "cursor", model: "claude-sonnet-4", aiAdditions: 3580, aiAccepted: 2320 }] },
    filesTouched: 163,
    branches: 9,
    contributors: 1,
    firstCommitSha: "a17cf09",
    lastCommitSha: "4d2b8e7",
    workingTree: { isDirty: false, stagedEntries: 0, modifiedEntries: 0, untrackedEntries: 0, conflictedEntries: 0 },
  },
  milestones: [
    {
      id: "ms_01",
      occurredAt: "2026-07-08T19:45:00.000Z",
      title: "The graph answered its first real question",
      description:
        "A rough import connected six sources well enough to reconstruct why a product decision had changed.",
      kind: "breakthrough",
      evidenceRefs: ["ses_01", "commit:a17cf09"],
    },
    {
      id: "ms_02",
      occurredAt: "2026-07-15T20:48:00.000Z",
      title: "Offline stopped meaning fragile",
      description:
        "A replayable merge fixture exposed the duplicate-note bug and made the final conflict strategy obvious.",
      kind: "decision",
      evidenceRefs: ["ses_04", "commit:b63e401"],
    },
    {
      id: "ms_03",
      occurredAt: "2026-07-18T20:02:00.000Z",
      title: "Five testers cut the canvas in half",
      description:
        "The clever controls were getting in the way, so the capture surface became deliberately smaller and calmer.",
      kind: "feedback",
      evidenceRefs: ["ses_05", "note:test-round-01"],
    },
    {
      id: "ms_04",
      occurredAt: "2026-07-25T22:18:00.000Z",
      title: "v0.1 went to 38 curious people",
      description:
        "The first signed build shipped with a short known-issues list and one clear promise: the trail will still be there tomorrow.",
      kind: "ship",
      evidenceRefs: ["ses_07", "release:v0.1.0"],
    },
  ],
  eventSpine: {
    version: "1.0.0",
    generatedAt: "2026-07-25T22:26:44.000Z",
    events: [
      { eventId: "evt_orbit_discover_001", occurredAt: "2026-07-08T17:42:00.000Z", kind: "session-start", phase: "discover", label: "Session opened", sessionRef: "ses_01", provider: "codex", magnitude: 18, measurement: "turns", temporalPrecision: "exact", sourceRefs: ["ev_search_ranking"], privacy: "metadata-only" },
      { eventId: "evt_orbit_search_002", occurredAt: "2026-07-10T19:02:00.000Z", kind: "model-shift", phase: "decide", label: "Model context changed", sessionRef: "ses_02", provider: "cursor", magnitude: 2, measurement: "models", temporalPrecision: "estimated", sourceRefs: ["ev_search_ranking"], privacy: "metadata-only" },
      { eventId: "evt_orbit_offline_003", occurredAt: "2026-07-13T17:30:00.000Z", kind: "mutation", phase: "decide", label: "Build tools observed", sessionRef: "ses_03", provider: "codex", magnitude: 2, measurement: "distinct-tools", temporalPrecision: "estimated", sourceRefs: ["ev_merge_plan"], privacy: "metadata-only" },
      { eventId: "evt_orbit_plan_004", occurredAt: "2026-07-15T17:42:00.000Z", kind: "planning", phase: "decide", label: "Plan-first work", sessionRef: "ses_04", provider: "codex", magnitude: 6, measurement: "turns", temporalPrecision: "estimated", sourceRefs: ["ev_merge_plan"], privacy: "metadata-only" },
      { eventId: "evt_orbit_verify_005", occurredAt: "2026-07-15T20:12:00.000Z", kind: "verification", phase: "deliver", label: "Verification tools observed", sessionRef: "ses_04", provider: "codex", magnitude: 1, measurement: "distinct-tools", temporalPrecision: "estimated", sourceRefs: ["ev_merge_test"], privacy: "metadata-only" },
      { eventId: "evt_orbit_feedback_006", occurredAt: "2026-07-18T18:44:00.000Z", kind: "exploration", phase: "discover", label: "Exploration tools observed", sessionRef: "ses_05", provider: "claude-code", magnitude: 2, measurement: "distinct-tools", temporalPrecision: "estimated", sourceRefs: ["ev_feedback_synthesis"], privacy: "metadata-only" },
      { eventId: "evt_orbit_delivery_007", occurredAt: "2026-07-22T19:52:00.000Z", kind: "verification", phase: "deliver", label: "Verification tools observed", sessionRef: "ses_06", provider: "codex", magnitude: 1, measurement: "distinct-tools", temporalPrecision: "estimated", sourceRefs: ["ev_merge_test"], privacy: "metadata-only" },
      { eventId: "evt_orbit_ship_008", occurredAt: "2026-07-25T22:18:00.000Z", kind: "repository-milestone", phase: "deliver", label: "Repository milestone", provider: "git", magnitude: 1, measurement: "milestone", temporalPrecision: "exact", sourceRefs: ["commit:4d2b8e7"], privacy: "metadata-only" },
    ],
    coverage: { sessions: 7, milestones: 4, events: 8 },
  },
  redaction: {
    policyVersion: "redact-2026-06",
    redactedFiles: 18,
    generalizedPaths: 6,
    secretMatchesRemoved: 3,
    tokensRemoved: 9420,
    notes: [
      "Environment files excluded before analysis",
      "Remote owner and machine paths generalized",
      "Conversation excerpts summarized, never copied verbatim",
    ],
  },
  provenance: {
    scannerVersion: "0.3.0-dev",
    scannedAt: "2026-07-25T22:26:44.000Z",
    source: "local-cli",
    machineScope: "repository-only",
    snapshotHash: "sha256:15b9a8c0d17f…91c2",
    consentVersion: "private-report-v1",
  },
  builderProfile: orbitProfile,
  signals: orbitSignals,
  narrative: {
    headline: "The quieter the interface became, the stronger the research trail got.",
    narrative: "Orbit Notes moved from an ambitious graph prototype through a difficult offline rewrite and into a deliberately smaller product shaped by real tester behavior.",
    turningPoint: "The product became obvious when the team optimized for returning to a thought instead of operating a graph.",
    learnings: ["A deterministic fixture can settle an architectural argument.", "Subtraction can be the highest-leverage product decision."],
    decisionPatterns: ["Turn failures into replayable evidence before choosing a fix.", "Prefer a smaller dependable workflow over a broader impressive surface."],
    standoutTraits: ["Evidence before certainty", "Patient shipping discipline"],
    growthEdge: "Invite product feedback before the architecture hardens.",
    storyPack: orbitStoryPack,
    fallbacksUsed: [],
    reportIntelligence: orbitReportIntelligence,
  },
} satisfies ProjectSnapshot;

const vibeSignals: Signal[] = [
  { id: "vibe-lines", family: "output", headline: "You averaged 1,799 changed lines per commit", detail: "78 commits changed 119,893 lines and removed 20,461 lines during a broad release-readiness sweep.", value: 1799, unit: "lines", notability: 92, formula: "round((additions + deletions) / commits)", sourceRefs: ["vibe-src-git"] },
  { id: "vibe-tools", family: "tooling", headline: "You reached for 58 different tools", detail: "The build moved between product inspection, implementation, verification, publishing, and media work.", value: 58, unit: "tools", notability: 88, formula: "count(distinct tools)", sourceRefs: ["vibe-src-codex-2", "vibe-src-claude-2"] },
  { id: "vibe-exec", family: "tooling", headline: "You called exec 4,968 times", detail: "Execution was the heartbeat of a verify-heavy release sprint.", value: 4968, unit: "calls", notability: 86, formula: "sum(exec calls)", sourceRefs: ["vibe-src-codex-1", "vibe-src-claude-1"] },
  { id: "vibe-longest", family: "rhythm", headline: "Your longest session ran 38h 50m", detail: "One extended session spanned privacy tracing, release preparation, and end-to-end verification.", value: 2330, unit: "minutes", notability: 94, formula: "max(session duration)", sourceRefs: ["vibe-src-claude-1"] },
  { id: "vibe-night", family: "rhythm", headline: "27% of your sessions started between 10pm and 5am", detail: "Fourteen of 51 sessions began in the night-owl window.", value: 27, unit: "%", notability: 79, formula: "round(100 * night sessions / sessions)", sourceRefs: ["vibe-src-codex-3"] },
  { id: "vibe-cache", family: "spend", headline: "3,171% of your input tokens were served from cache", detail: "683,393,024 cached tokens accompanied 21,553,774 input tokens.", value: 3171, unit: "%", notability: 89, formula: "round(100 * cached input / input)", sourceRefs: ["vibe-src-codex-1"] },
  { id: "vibe-turns", family: "rhythm", headline: "Your most active session had 39 back-and-forth turns", detail: "The most active session ran 7.8 times the five-turn median.", value: 39, unit: "turns", notability: 73, formula: "max(turns)", sourceRefs: ["vibe-src-codex-4"] },
  { id: "vibe-subagents", family: "tooling", headline: "You delegated to subagents 54 times", detail: "Work was handed to a subagent instead of handled directly.", value: 54, unit: "runs", notability: 76, formula: "sum(subagent invocations)", sourceRefs: ["vibe-src-codex-2"] },
  { id: "vibe-tokens", family: "conversation", headline: "One session alone used 734,154,854 tokens", detail: "That was 28.2 times the median session token usage.", value: 734154854, unit: "tokens", notability: 98, formula: "max(session tokens)", sourceRefs: ["vibe-src-claude-1"] },
  { id: "vibe-evidence", family: "evidence", headline: "Buildstory reviewed 268 moments and kept 240 for this story", detail: "Twenty-eight were trimmed by the evidence budget.", value: 240, unit: "excerpts", notability: 70, formula: "selected evidence excerpts", sourceRefs: ["vibe-src-codex-1", "vibe-src-claude-1"] },
];

const vibeStoryPack: ReportStoryPackV3 = {
  version: "3.0.0",
  analysisTier: "deep",
  sources: [
    { ref: "vibe-src-codex-1", provider: "codex", sessionRef: "vibe_ses_07", occurredAt: "2026-08-07T22:18:00.000Z", evidenceRefs: ["publish-flow", "error-feedback"], metrics: { turns: 39, assistantMessages: 31, toolCalls: 188 } },
    { ref: "vibe-src-codex-2", provider: "codex", sessionRef: "vibe_ses_18", occurredAt: "2026-08-08T15:12:00.000Z", evidenceRefs: ["leaderboard-cache", "shared-layer"], metrics: { turns: 18, assistantMessages: 15, toolCalls: 96 } },
    { ref: "vibe-src-codex-3", provider: "codex", sessionRef: "vibe_ses_33", occurredAt: "2026-08-09T23:46:00.000Z", evidenceRefs: ["privacy-boundary", "license-audit"], metrics: { turns: 27, assistantMessages: 22, toolCalls: 142 } },
    { ref: "vibe-src-codex-4", provider: "codex", sessionRef: "vibe_ses_47", occurredAt: "2026-08-10T18:24:00.000Z", evidenceRefs: ["feed-discovery", "release-check"], metrics: { turns: 34, assistantMessages: 28, toolCalls: 164 } },
    { ref: "vibe-src-claude-1", provider: "claude-code", sessionRef: "vibe_ses_05", occurredAt: "2026-08-05T10:08:00.000Z", evidenceRefs: ["terminal-progress", "onboarding-grid"], metrics: { turns: 24, assistantMessages: 20, toolCalls: 118 } },
    { ref: "vibe-src-claude-2", provider: "claude-code", sessionRef: "vibe_ses_29", occurredAt: "2026-08-09T14:05:00.000Z", evidenceRefs: ["scanner-audit", "public-projection"], metrics: { turns: 21, assistantMessages: 17, toolCalls: 103 } },
    { ref: "vibe-src-git", provider: "git", occurredAt: "2026-08-10T23:41:00.000Z", evidenceRefs: ["commit:7b4e9a1", "commit:d20c81f"], metrics: { turns: 0, assistantMessages: 0, toolCalls: 78 } },
  ],
  hero: {
    headline: "78 commits to make a night-owl vision public: from broken onboarding to privacy-first publishing",
    summary: "The project is done when the user experience matches the privacy promise. This chapter kept a steady cadence of fixing tiny-but-critical UI bugs, tracing each failure to its source, and regression-testing the repair before the next release step began.",
  },
  buildArc: [
    { phase: "discover", headline: "Trace the barriers between the user and the publish button", summary: "A disabled control, a stale leaderboard, and a blank terminal revealed failures that looked unrelated but shared one trust problem: the interface was hiding important system state.", sourceRefs: ["vibe-src-codex-1", "vibe-src-codex-2", "vibe-src-claude-1"] },
    { phase: "decide", headline: "Turn silent failures into actionable feedback", summary: "The build fixed shared causes instead of patching symptoms, moving privacy disclosure to a shared layer and making publish errors concrete.", sourceRefs: ["vibe-src-codex-1", "vibe-src-codex-2", "vibe-src-claude-2"] },
    { phase: "deliver", headline: "Close the last gaps before public release", summary: "Onboarding, story updates, discovery, licensing, and the publication boundary were verified as one privacy-first experience.", sourceRefs: ["vibe-src-codex-3", "vibe-src-codex-4", "vibe-src-git"] },
  ],
  moments: [
    { phase: "discover", kind: "discovery", title: "The publish button was disabled and its errors swallowed", whatHappened: "Clicking Publish produced no response because the control remained disabled until publication and its API failures were swallowed.", whyItMattered: "A silent failure was a trust failure; tracing the handlers turned a dead end into concrete error feedback.", sourceRefs: ["vibe-src-codex-1"] },
    { phase: "discover", kind: "discovery", title: "The leaderboard undercounted a two-chapter story", whatHappened: "The cached count only checked age, so a newly published chapter remained stale for up to an hour.", whyItMattered: "Fixing the D1 snapshot, in-memory store, and test layers made the visible count agree everywhere.", sourceRefs: ["vibe-src-codex-2"] },
    { phase: "discover", kind: "discovery", title: "The terminal went blank for minutes during report generation", whatHappened: "A progress renderer kept refreshing into new lines in non-TTY environments while one missing transition left the active model-resolution event spinning.", whyItMattered: "Honest progress state is critical for long-running CLI work and automation pipelines.", sourceRefs: ["vibe-src-claude-1"] },
    { phase: "decide", kind: "decision", title: "Move the privacy disclosure to a shared layer", whatHappened: "The dialog lived inside a private-report branch, so publishing from the public view did nothing.", whyItMattered: "Moving it above the view boundary made the privacy promise consistent from every entry point.", sourceRefs: ["vibe-src-codex-2", "vibe-src-claude-2"] },
    { phase: "decide", kind: "decision", title: "Fix the root cause of the onboarding grid", whatHappened: "Two steps each rendered one child, so the first track filled while most of the 1080px canvas stayed empty.", whyItMattered: "Correcting the shared modifier class prevented the same design-system bug from recurring.", sourceRefs: ["vibe-src-claude-1"] },
    { phase: "deliver", kind: "delivery", title: "The feed became social for new users", whatHappened: "The feed gained a discovery pool ranked by engagement so a new account no longer opened onto an empty product.", whyItMattered: "The first-run experience now communicates a living network immediately.", sourceRefs: ["vibe-src-codex-4"] },
    { phase: "deliver", kind: "decision", title: "Privacy and licensing became a hard requirement", whatHappened: "The scanner payload, local-retention behavior, license, and public projection were audited before publishing.", whyItMattered: "The privacy claim became a boundary users could verify instead of a promise they had to trust.", sourceRefs: ["vibe-src-codex-3", "vibe-src-claude-2"] },
    { phase: "deliver", kind: "delivery", title: "Broad sweeps stayed tied to verification", whatHappened: "Large structural changes moved the project to npm workspaces, repaired responsive layouts, and consolidated publication controls.", whyItMattered: "A 1,799-line average per commit remained purposeful because every sweep ended in lint, typecheck, tests, or build verification.", sourceRefs: ["vibe-src-git", "vibe-src-codex-4"] },
  ],
  turningPoint: { quote: "The project is done when the user experience matches the privacy promise.", sourceRefs: ["vibe-src-codex-3", "vibe-src-claude-2"] },
  decisions: [
    { title: "Surface concrete publish errors", rationale: "A disabled control and swallowed API failures left users with no recovery path.", outcome: "Missing categories now produce actionable feedback and the publish flow has one shared source of truth.", sourceRefs: ["vibe-src-codex-1"] },
    { title: "Update every leaderboard cache layer", rationale: "The same count could be stale in D1, memory, and the test projection.", outcome: "Published chapter totals now agree across the product.", sourceRefs: ["vibe-src-codex-2"] },
    { title: "Move privacy disclosure above the view boundary", rationale: "Privacy review must appear regardless of where publishing starts.", outcome: "Private, preview, and public surfaces invoke the same review flow.", sourceRefs: ["vibe-src-codex-2", "vibe-src-claude-2"] },
    { title: "Audit scanner data before publishing", rationale: "Trust required an exact account of what leaves the machine and what remains local.", outcome: "Public categories and retention behavior became explicit and testable.", sourceRefs: ["vibe-src-codex-3", "vibe-src-claude-2"] },
  ],
  learnings: [
    { title: "Trace the data flow before touching code", detail: "Following data from D1 through caches and public projections made root causes visible before the first edit.", sourceRefs: ["vibe-src-codex-2", "vibe-src-claude-2"] },
    { title: "Fix the shared root cause, not the visible symptom", detail: "Checking adjacent surfaces prevented narrow UI repairs from leaving the same defect elsewhere.", sourceRefs: ["vibe-src-codex-1", "vibe-src-claude-1"] },
    { title: "Keep verification loops tight", detail: "Each repair was followed by the narrowest useful lint, typecheck, test, or build command.", sourceRefs: ["vibe-src-codex-4", "vibe-src-git"] },
    { title: "Turn every bug into a regression test", detail: "Targeted tests made repaired publication and cache paths durable.", sourceRefs: ["vibe-src-codex-1", "vibe-src-codex-2"] },
  ],
  standoutTraits: [
    { title: "Breadth without losing the thread", detail: "Fifty-eight tools served scoped jobs across implementation, inspection, media, and verification.", sourceRefs: ["vibe-src-codex-2", "vibe-src-claude-2"] },
    { title: "Verification as a working rhythm", detail: "Execution dominated because each change moved quickly from diagnosis to a checked result.", sourceRefs: ["vibe-src-codex-4", "vibe-src-git"] },
  ],
  growthEdge: { title: "Steer with fewer, more direct prompts", observation: "Most work happened inside agent-driven loops. More frequent direct steering could surface shared cache and privacy-boundary issues earlier.", sourceRefs: ["vibe-src-codex-1", "vibe-src-codex-2"] },
  signals: vibeSignals,
  deepAnalysis: {
    openingLine: { title: "A release-readiness sprint became a trust audit", summary: "The strongest chapter was not one large feature, but a sequence of small repairs that aligned onboarding, publishing, reporting, and privacy around the same promise.", sourceRefs: ["vibe-src-codex-1", "vibe-src-codex-3", "vibe-src-git"], confidence: "high" },
    signatureMoves: [
      { title: "Trace the data flow before touching code", summary: "The build followed state through caches, UI boundaries, and public projections before editing.", sourceRefs: ["vibe-src-codex-2", "vibe-src-claude-2"], confidence: "high" },
      { title: "Fix the shared root cause", summary: "Adjacent surfaces were checked whenever one visible instance failed.", sourceRefs: ["vibe-src-codex-1", "vibe-src-claude-1"], confidence: "high" },
      { title: "Keep verification loops tight", summary: "Every repair ended with a focused check before the next task began.", sourceRefs: ["vibe-src-codex-4", "vibe-src-git"], confidence: "high" },
    ],
    byTheNumbers: vibeSignals.slice(0, 6).map((signal) => ({ title: signal.headline, summary: signal.detail, signalId: signal.id, sourceRefs: signal.sourceRefs, confidence: "medium" as const })),
    whereItGotHard: [
      { title: "Silent publish failures hid the recovery path", summary: "The UI combined a disabled control with swallowed server errors, so the user could not tell what to fix.", sourceRefs: ["vibe-src-codex-1"], confidence: "high" },
      { title: "Report progress lied in non-interactive terminals", summary: "TTY assumptions made a healthy long-running process look frozen.", sourceRefs: ["vibe-src-claude-1"], confidence: "high" },
      { title: "A chapter count was stale in more than one layer", summary: "Correctness required changing storage, memory, and tests together.", sourceRefs: ["vibe-src-codex-2"], confidence: "high" },
    ],
    chapterChanges: [
      { title: "From feature sprints to release-readiness finesse", summary: "The chapter shifted from core report construction to closing the last user-facing gaps before public release.", sourceRefs: ["vibe-src-codex-4", "vibe-src-git"], confidence: "high" },
      { title: "Privacy moved from afterthought to hard requirement", summary: "Licensing, scanner boundaries, retention, and public projection were reviewed as product behavior.", sourceRefs: ["vibe-src-codex-3", "vibe-src-claude-2"], confidence: "high" },
    ],
    coverage: { sessionsSeen: 51, excerptsUsed: 240, evidenceBytes: 72877, windowStart: "2026-08-04T08:00:00.000Z", windowEnd: "2026-08-10T23:41:00.000Z" },
  },
};

export const vibeSocialSnapshot: ProjectSnapshot = (() => {
  const snapshot = structuredClone(orbitNotesSnapshot) as ProjectSnapshot;
  snapshot.identity = {
    id: "project_vibe_social",
    slug: "vibe-social",
    name: "Vibe-social",
    tagline: "A private build report generated from 51 repository-scoped AI sessions.",
    description: "A privacy-first social product for turning AI-assisted software work into evidence-backed public build stories.",
    status: "shipped",
    visibility: "public",
    owner: { id: "usr_arjun_mishra_seed", name: "Arjun Mishra", handle: "arjun-mishra", role: "Independent builder" },
  };
  snapshot.repository = { ...snapshot.repository, repositoryName: "vibe-social", remotePath: "github.com/arjun-mishra/vibe-social", primaryLanguage: "TypeScript", framework: "Next.js", packageManager: "npm", fileCount: 1456, initialCommitAt: "2026-08-04T08:00:00.000Z", currentRevision: "d20c81f", isPrivate: true };
  snapshot.timeWindow = { startedAt: "2026-08-04T08:00:00.000Z", endedAt: "2026-08-10T23:41:00.000Z", activeDays: 7, timezone: "America/Vancouver" };
  snapshot.sessions = Array.from({ length: 51 }, (_, index) => {
    const day = 4 + (index % 7);
    const hour = index % 4 === 0 ? 22 + (index % 3) : 9 + (index % 11);
    const startedAt = new Date(Date.UTC(2026, 7, day, hour % 24, (index * 7) % 60));
    const durationMinutes = index === 4 ? 2330 : 48 + ((index * 37) % 210);
    return {
      id: `vibe_ses_${String(index + 1).padStart(2, "0")}`,
      startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + durationMinutes * 60_000).toISOString(),
      durationMinutes,
      intent: ["Trace a release blocker", "Repair a shared UI boundary", "Verify public projection", "Prepare the release"][index % 4]!,
      outcome: ["Root cause isolated", "Regression fixed and tested", "Privacy boundary verified", "Release check passed"][index % 4]!,
      modelIds: [index % 5 === 0 ? "claude-opus-5" : "claude-sonnet-5"],
      toolIds: ["exec", "codex", "browser"],
      touchedAreas: [["publishing"], ["leaderboard"], ["privacy"], ["onboarding"]][index % 4]!,
      subagentInvocations: index < 27 ? 2 : 0,
    };
  });
  const modelRows = [
    ["claude-opus-5", "Claude Opus 5", "Anthropic", 2331, 190720000],
    ["claude-sonnet-5", "Claude Sonnet 5", "Anthropic", 9908, 840510000],
    ["glm-5.2", "GLM 5.2", "Z.ai", 0, 1290000],
    ["gpt-5.6-luna", "GPT-5.6 Luna", "OpenAI", 146, 12470000],
    ["gpt-5.6-sol", "GPT-5.6 Sol", "OpenAI", 2186, 184230000],
    ["gpt-5.6-terra", "GPT-5.6 Terra", "OpenAI", 0, 4490000],
  ] as const;
  snapshot.usage.models = modelRows.map(([id, label, provider, requests, costMicroUsd]) => ({ id, label, provider, requests, tokenUsage: null, costMicroUsd }));
  snapshot.usage.tools = Array.from({ length: 58 }, (_, index) => ({ id: index === 0 ? "exec" : `tool-${index + 1}`, label: index === 0 ? "exec" : `Tool ${index + 1}`, category: index < 8 ? "agent" as const : "automation" as const, sessions: Math.max(1, 51 - index), callCount: index === 0 ? 4968 : 40 + ((index * 17) % 130) }));
  snapshot.usage.tokenUsage = { inputTokens: 21553774, outputTokens: 3495053202, totalTokens: 4199999999, cacheReadInputTokens: 683393024, cacheCreationInputTokens: 0, cachedInputTokens: 683393024, reasoningOutputTokens: 0 };
  snapshot.usage.cost = { totalMicroUsd: 1233710000, pricedTokens: 4199999999, unpricedTokens: 0, pricingTableVersion: "2026-08-05.1" };
  snapshot.git = { ...snapshot.git, commits: 78, mergeCommits: 4, additions: 119893, deletions: 20461, filesTouched: 1456, branches: 12, contributors: 1, firstCommitSha: "7b4e9a1", lastCommitSha: "d20c81f", aiAttribution: undefined };
  snapshot.milestones = vibeStoryPack.moments.map((moment, index) => ({ id: `vibe_ms_${index + 1}`, occurredAt: `2026-08-${String(4 + Math.min(6, index)).padStart(2, "0")}T${String(10 + index).padStart(2, "0")}:00:00.000Z`, title: moment.title, description: moment.whatHappened, kind: moment.kind === "delivery" ? "ship" : moment.kind === "discovery" ? "breakthrough" : moment.kind, evidenceRefs: moment.sourceRefs }));
  snapshot.builderProfile = {
    scores: {
      planning: { value: 31, rawInputs: {}, formula: "weighted plan-before-edit ratio" },
      steering: { value: 18, rawInputs: {}, formula: "weighted course-correction ratio" },
      execution: { value: 100, rawInputs: {}, formula: "weighted completion ratio" },
      engineering: { value: 56, rawInputs: {}, formula: "weighted verification ratio" },
      productInstinct: { value: 9, rawInputs: {}, formula: "weak completion-and-feedback proxy", caveat: "A weak proxy, not a personality measurement." },
    },
    archetype: { name: "Night Owl", rationale: ["Peak activity clustered around late evening sessions.", "Long release blocks combined debugging, verification, and privacy review."] },
    workPatterns: { peakHours: [22, 15, 10], preferredDays: ["Sunday", "Monday"], medianSessionMinutes: 84, longestSessionMinutes: 2330, primaryModel: "claude-sonnet-5", timezoneLabel: "America/Vancouver" },
  };
  snapshot.signals = vibeSignals;
  snapshot.narrative = {
    headline: vibeStoryPack.hero.headline,
    narrative: vibeStoryPack.hero.summary,
    turningPoint: vibeStoryPack.turningPoint.quote,
    learnings: vibeStoryPack.learnings.map((item) => item.title),
    decisionPatterns: vibeStoryPack.decisions.map((item) => item.title),
    standoutTraits: vibeStoryPack.standoutTraits.map((item) => item.title),
    growthEdge: vibeStoryPack.growthEdge.title,
    storyPack: vibeStoryPack,
    fallbacksUsed: [],
  };
  snapshot.redaction = { ...snapshot.redaction, redactedFiles: 31, generalizedPaths: 14, secretMatchesRemoved: 8, tokensRemoved: 55283 };
  snapshot.provenance = { ...snapshot.provenance, scannedAt: "2026-08-10T23:50:00.000Z", snapshotHash: "sha256:vibe-social-production-example", consentVersion: "private-report-v1" };
  return snapshot;
})();
