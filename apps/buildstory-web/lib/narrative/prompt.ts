import type { ScannerProjectSnapshot, Signal } from "../ingestion/scanner-project-snapshot";
import { computeBuilderProfile } from "../ingestion/profile";
import { STORY_PACK_DEEP_ANALYSIS_SCHEMA, STORY_PACK_DEEP_NARRATIVE_SCHEMA, STORY_PACK_INSIGHTS_SCHEMA, STORY_PACK_OUTPUT_SCHEMA, STORY_PACK_STORY_SCHEMA, buildStoryPackSources } from "./story-pack";

// Buildstory's report is not a project summary and not an audit: it is the
// receipt a builder would actually want to share - closer to a Wrapped-style
// "here's a cool, true, surprising thing about how you built this" than to a
// status update or a consulting readout. See the report-redesign sprint that
// cut Deep's decisionReview/risksAndEvidenceGaps/nextBuildActions for the
// same reason: nobody comes to Buildstory for advice.
const SYSTEM_PROMPT = `You write short, honest, evidence-linked "build story" narratives for Buildstory, a site where
developers publish real, verified accounts of software they built with AI coding
agents. This is not a project summary and not a performance review - it's the
kind of thing a builder would actually want to post: a surprising, true,
specific detail about how this particular build went, not a recap of what got
built. You are given: (1) real, deterministic facts about one project's build
(session count, commit count, active days, models used, token usage), and (2) a
small set of redacted excerpts from the actual conversation between the builder
and their AI agent.

Rules:
- Use only the facts and excerpts given to you. Never invent a feature, a
  number, a name, a company, a timeline detail, or a technical claim that
  is not directly supported by what you were given.
- Never state a number, count, or percentage that was not given to you
  verbatim in FACTS, COMPUTED SIGNALS, or NOTABLE PATTERNS. If you want to
  cite a computed statistic, use the exact wording it was given to you in.
- Never give advice, a recommendation, a next step, or a "you should."
  Report what happened and what is true about it - not what to do next.
- The excerpts have already been redacted (file paths, URLs, and hostnames
  replaced with bracketed placeholders like [absolute-path]). Do not try to
  guess or reconstruct what was redacted.
- Write like a builder describing their own project in a devlog, not like
  marketing copy. No hype words like "revolutionary", "seamless", or
  "game-changing". Short sentences are better than long ones.
- If the excerpts don't clearly support a "turning point," describe the
  most concrete decision or moment they do support instead of inventing a
  dramatic one.
- Every sourceRefs entry must be copied exactly from the available source catalog. Never invent a source, date, provider, count, confidence, or technical claim.
- Respond with JSON matching the given schema exactly, and nothing else.`;

function factsBlock(snapshot: ScannerProjectSnapshot): string {
  const usage = snapshot.usage;
  const models = usage.models.map((model) => `${model.name} (${model.turnCount} model calls)`).join(", ") || "none recorded";
  const tokenLine = usage.tokenUsage
    ? `${usage.tokenUsage.totalTokens.toLocaleString("en-US")} tokens processed (${usage.tokenUsage.inputTokens.toLocaleString("en-US")} in / ${usage.tokenUsage.outputTokens.toLocaleString("en-US")} out)`
    : "token usage not collected";
  const activeDays = new Set(snapshot.sessions.map((session) => session.startedAt.slice(0, 10))).size;

  const profile = computeBuilderProfile({ sessions: snapshot.sessions, usage: snapshot.usage, git: snapshot.git, timeWindow: snapshot.timeWindow });
  const scoreLine = Object.entries(profile.scores).map(([key, score]) => `${key}: ${score.value}/100 (raw ${JSON.stringify(score.rawInputs)})`).join(", ");
  return [
    `Repository: ${snapshot.repository.displayName}`,
    `Build window: ${snapshot.timeWindow.start} to ${snapshot.timeWindow.end} (${activeDays} active day${activeDays === 1 ? "" : "s"})`,
    `Sessions: ${snapshot.sessions.length}`,
    `Commits: ${snapshot.git.commits} (${snapshot.git.insertions} insertions, ${snapshot.git.deletions} deletions)`,
    `Models used: ${models}`,
    `Archetype: ${profile.archetype.name} (${profile.archetype.rationale.join(" ")})`,
    `Profile scores: ${scoreLine}`,
    `Work patterns: peak hours ${profile.workPatterns.peakHours.join(", ") || "none"}; preferred days ${profile.workPatterns.preferredDays.join(", ") || "none"}; median session ${profile.workPatterns.medianSessionMinutes} minutes; longest session ${profile.workPatterns.longestSessionMinutes} minutes; primary model ${profile.workPatterns.primaryModel ?? "none"}; timezone ${profile.workPatterns.timezoneLabel}`,
    tokenLine,
  ].join("\n");
}

// Ref allocation (S01, S02, ... plus GIT) has exactly one source of truth:
// buildStoryPackSources. The catalog block and the excerpt labels below both
// read from it so a citation the model copies from one always resolves in
// the other - previously this file re-minted the same S01.../GIT numbering
// by hand, and any drift between the two copies broke every citation.
function sessionRefMap(snapshot: ScannerProjectSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const source of buildStoryPackSources(snapshot)) {
    if (source.sessionRef) map.set(source.sessionRef, source.ref);
  }
  return map;
}

function excerptsBlock(snapshot: ScannerProjectSnapshot): string {
  const bundle = snapshot.narrativeEvidence;
  if (!bundle || bundle.excerpts.length === 0) return "No conversation excerpts were provided for this build.";
  const refs = sessionRefMap(snapshot);
  // Label every excerpt with its resolved source ref. Without this the model
  // has no way to know which SOURCE CATALOG entry an excerpt came from and
  // has to guess a sourceRefs citation - guesses are exactly what produces
  // "unknown source ref" validation failures. An excerpt whose session
  // doesn't resolve to a catalog ref is dropped rather than emitted
  // unlabelled, since an uncitable excerpt can't ground a citation anyway.
  const lines = bundle.excerpts
    .map((excerpt) => {
      const ref = refs.get(excerpt.sessionRef);
      return ref ? `[${ref} | ${excerpt.role}] ${excerpt.text}` : null;
    })
    .filter((line): line is string => line !== null);
  return lines.length ? lines.join("\n\n") : "No conversation excerpts resolved to a known source.";
}

/**
 * Full COMPUTED SIGNALS block with ids - used only by the Deep analysis
 * pass, whose byTheNumbers findings must cite an exact signalId (enforced by
 * validateStoryPackComponent, the same way sourceRefs provenance is
 * enforced). Every number in this block was computed in code, not written by
 * a model - see lib/ingestion/signals.ts.
 */
function signalsBlock(signals: Signal[]): string {
  if (signals.length === 0) return "COMPUTED SIGNALS:\nNone computed for this build window.";
  return ["COMPUTED SIGNALS:", ...signals.map((signal) => `- ${signal.id}: ${signal.headline} (${signal.detail})`)].join("\n");
}

/**
 * Short, id-free version folded into the Standard/combined prompt as extra
 * grounding color: the model may draw on these headlines the same way it
 * draws on any other FACTS line (they were given to it verbatim, so citing
 * one is never "inventing a number"), but Standard's schema has no signalId
 * field to validate a citation against, so it never asks the model to
 * attribute a finding to one by id the way Deep's byTheNumbers does.
 */
function notablePatternsBlock(signals: Signal[]): string {
  if (signals.length === 0) return "";
  const top = signals.slice(0, 5).map((signal) => `- ${signal.headline}`);
  return `\n\nNOTABLE PATTERNS (already verified true; draw on these for color if natural, but invent no additional statistics):\n${top.join("\n")}`;
}

function sourceCatalogBlock(snapshot: ScannerProjectSnapshot): string {
  return buildStoryPackSources(snapshot)
    .map((source) => source.ref === "GIT"
      ? `${source.ref}: ${snapshot.git.commits} commits, ${snapshot.git.fileTouches} file touches`
      : `${source.ref}: ${source.provider}, ended ${source.occurredAt}, ${source.metrics.turns} turns, ${source.metrics.toolCalls} tool calls`)
    .join("\n");
}

// Minimal structural shape shared by the STORY_PACK_* JSON Schema constants,
// used only to walk them into plain-English contract lines below.
type SchemaLike = {
  type?: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, SchemaLike>;
  items?: SchemaLike;
};

// The validator enforces cardinality, phase uniqueness, string lengths and
// ref counts, but until now none of those numbers were ever stated in the
// prompt - the model was graded on a rubric it never saw. This walks the
// same schema objects the validator and the API's response_format use, so
// the contract text can never drift from what actually gets checked.
function schemaContractLines(schema: SchemaLike, path: string): string[] {
  if (schema.properties) {
    return Object.entries(schema.properties).flatMap(([key, child]) => schemaContractLines(child, path ? `${path}.${key}` : key));
  }
  if (schema.type === "array") {
    const name = path.split(/[.[]/).pop() ?? path;
    if (name === "sourceRefs") {
      return [`${path}: ${schema.minItems ?? 0}-${schema.maxItems ?? "many"} distinct source refs, each copied verbatim from SOURCE CATALOG`];
    }
    const bounds = schema.minItems !== undefined && schema.minItems === schema.maxItems
      ? `exactly ${schema.minItems}`
      : `${schema.minItems ?? 0}-${schema.maxItems ?? "many"}`;
    const lines = [`${path}: ${bounds} items`];
    if (schema.items?.properties) {
      lines.push(...Object.entries(schema.items.properties).flatMap(([key, child]) => schemaContractLines(child, `${path}[].${key}`)));
    }
    return lines;
  }
  if (schema.enum) return [`${path}: one of ${schema.enum.join("/")}`];
  if (schema.type === "string") return [`${path}: ${schema.minLength ?? 0}-${schema.maxLength ?? "unbounded"} chars`];
  return [];
}

function outputContractBlock(schema: SchemaLike, extraRules: string[]): string {
  const lines = [...schemaContractLines(schema, ""), ...extraRules];
  return ["OUTPUT CONTRACT (hard limits; violating any of these fails validation):", ...lines.map((line) => `- ${line}`)].join("\n");
}

const BUILD_ARC_CARDINALITY_RULE = "buildArc must contain exactly one discover, one decide, and one deliver phase entry.";
const SOURCE_REF_PROVENANCE_RULE = "Every sourceRefs entry must be copied exactly, character for character, from a ref in SOURCE CATALOG. Never invent one.";
const SIGNAL_ID_PROVENANCE_RULE = "Every byTheNumbers.signalId must be copied exactly, character for character, from an id in COMPUTED SIGNALS. Never invent a signalId or a statistic that isn't backed by one.";
const NO_RESTATEMENT_RULES: string[] = [
  "standoutTraits must not restate any signatureMoves entry.",
  "moments must not restate any whereItGotHard entry - choose delivery or discovery moments instead.",
  "hero.headline must not reuse the wording of openingLine.title.",
  "turningPoint.quote must be a distinct inflection from anything in whereItGotHard.",
];

export function buildNarrativeMessages(snapshot: ScannerProjectSnapshot): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `FACTS:\n${factsBlock(snapshot)}\n\nSOURCE CATALOG:\n${sourceCatalogBlock(snapshot)}\n\nEXCERPTS:\n${excerptsBlock(snapshot)}\n\nWrite only hero, buildArc, moments, and turningPoint as JSON matching the schema.`,
    },
  ];
}

export function buildProfileMessages(snapshot: ScannerProjectSnapshot): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\nFocus only on decisionPatterns, standoutTraits, and growthEdge.` },
    {
      role: "user",
      content: `FACTS:\n${factsBlock(snapshot)}\n\nSOURCE CATALOG:\n${sourceCatalogBlock(snapshot)}\n\nEXCERPTS:\n${excerptsBlock(snapshot)}\n\nWrite only decisions, learnings, standoutTraits, and growthEdge as JSON matching the schema.`,
    },
  ];
}

export function buildCombinedMessages(snapshot: ScannerProjectSnapshot, signals: Signal[] = []): Array<{ role: "system" | "user"; content: string }> {
  const contract = outputContractBlock(STORY_PACK_OUTPUT_SCHEMA as unknown as SchemaLike, [BUILD_ARC_CARDINALITY_RULE, SOURCE_REF_PROVENANCE_RULE]);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `FACTS:\n${factsBlock(snapshot)}${notablePatternsBlock(signals)}\n\nSOURCE CATALOG:\n${sourceCatalogBlock(snapshot)}\n\n${contract}\n\nEXCERPTS:\n${excerptsBlock(snapshot)}\n\nWrite hero, buildArc, moments, turningPoint, decisions, learnings, standoutTraits, and growthEdge as one JSON object matching the schema.`,
    },
  ];
}

export function buildDeepAnalysisMessages(snapshot: ScannerProjectSnapshot, signals: Signal[] = [], previousChapter: unknown = null): Array<{ role: "system" | "user"; content: string }> {
  const contract = outputContractBlock(STORY_PACK_DEEP_ANALYSIS_SCHEMA as unknown as SchemaLike, [SOURCE_REF_PROVENANCE_RULE, SIGNAL_ID_PROVENANCE_RULE]);
  return [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\nPerform a thorough read of how this build actually went. Prefer an empty list or low confidence over an unsupported claim. Focus on: the one-line hook (openingLine), this builder's distinctive patterns (signatureMoves), framing the most notable COMPUTED SIGNALS into shareable findings (byTheNumbers), where the build genuinely got hard (whereItGotHard), and what changed since the previous chapter (chapterChanges). Each list answers a different question; do not restate the same event across signatureMoves, whereItGotHard, and byTheNumbers. Every byTheNumbers entry must cite a real signalId - it frames a signal that was already computed, never a number you calculate or estimate yourself.`,
    },
    {
      role: "user",
      content: `FACTS:\n${factsBlock(snapshot)}\n\nSOURCE CATALOG:\n${sourceCatalogBlock(snapshot)}\n\n${signalsBlock(signals)}\n\n${contract}\n\nEXCERPTS:\n${excerptsBlock(snapshot)}\n\nPREVIOUS CHAPTER (final retained report only; may be null):\n${JSON.stringify(previousChapter)}\n\nReturn the deepAnalysis JSON object only. Every finding must use only source references from SOURCE CATALOG, and every byTheNumbers entry must cite a signalId from COMPUTED SIGNALS.`,
    },
  ];
}

export function buildDeepSynthesisMessages(snapshot: ScannerProjectSnapshot, analysisMap: unknown): Array<{ role: "system" | "user"; content: string }> {
  const contract = outputContractBlock(STORY_PACK_DEEP_NARRATIVE_SCHEMA as unknown as SchemaLike, [BUILD_ARC_CARDINALITY_RULE, SOURCE_REF_PROVENANCE_RULE, ...NO_RESTATEMENT_RULES]);
  return [
    {
      role: "system",
      // Reworded from "prefer fewer supported findings over invented
      // completeness" (unqualified): that line told the model to undershoot
      // the validator's own minimums (>=3 moments, >=2 decisions/learnings/
      // traits), which is what produced most Deep validation failures. The
      // OUTPUT CONTRACT below states those minimums explicitly and this
      // clarifies they're a floor, not a suggestion to beat. This pass also
      // never receives the raw excerpts (see the comment on the user
      // message below), so SYSTEM_PROMPT's "use only the excerpts given" is
      // repointed at the analysis map, which is this pass's only evidence.
      content: `${SYSTEM_PROMPT}\nCreate a layered Pro report. Preserve the concise publishable devlog while adding the supplied private deep analysis. The OUTPUT CONTRACT minimums below are a hard floor: satisfy them using the validated analysis map rather than undershooting toward invented completeness. This pass was not given the raw excerpts - treat the VALIDATED PRIVATE ANALYSIS MAP below, not "excerpts", as your evidence for every claim and source reference.`,
    },
    {
      role: "user",
      // The first deep-analysis stage already reviewed the excerpts. Do not
      // resend them merely to turn that analysis into the final report.
      content: `FACTS:\n${factsBlock(snapshot)}\n\nSOURCE CATALOG:\n${sourceCatalogBlock(snapshot)}\n\n${contract}\n\nVALIDATED PRIVATE ANALYSIS MAP:\n${JSON.stringify(analysisMap)}\n\nWrite only hero, buildArc, moments, turningPoint, decisions, learnings, and growthEdge as one JSON object matching the schema. Do not write standoutTraits or deepAnalysis; Buildstory derives standoutTraits from the validated signatureMoves and attaches the validated private analysis map server-side. Use 6-12 moments only when the evidence supports them, but never fewer than the OUTPUT CONTRACT minimums.`,
    },
  ];
}

export const NARRATIVE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "buildstory_narrative",
    strict: true,
    schema: STORY_PACK_STORY_SCHEMA,
  },
};

export const NARRATIVE_PROFILE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "buildstory_profile_narrative",
    strict: true,
    schema: STORY_PACK_INSIGHTS_SCHEMA,
  },
};

export const NARRATIVE_COMBINED_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "buildstory_complete_narrative",
    strict: true,
    schema: {
      ...STORY_PACK_OUTPUT_SCHEMA,
      required: ["hero", "buildArc", "moments", "turningPoint", "decisions", "learnings", "standoutTraits", "growthEdge"],
    },
  },
};

export const NARRATIVE_DEEP_ANALYSIS_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: { name: "buildstory_deep_analysis", strict: true, schema: STORY_PACK_DEEP_ANALYSIS_SCHEMA },
};

export const NARRATIVE_DEEP_SYNTHESIS_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: { name: "buildstory_deep_narrative", strict: true, schema: STORY_PACK_DEEP_NARRATIVE_SCHEMA },
};
