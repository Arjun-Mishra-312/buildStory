import type { ScannerProjectSnapshot } from "../ingestion/scanner-project-snapshot";
import { computeBuilderProfile } from "../ingestion/profile";
import { STORY_PACK_INSIGHTS_SCHEMA, STORY_PACK_STORY_SCHEMA } from "./story-pack";

const SYSTEM_PROMPT = `You write short, honest, evidence-linked "build story" narratives for Buildstory, a site where
developers publish real, verified accounts of software they built with AI coding
agents. You are given: (1) real, deterministic facts about one project's build
(session count, commit count, active days, models used, token usage), and (2) a
small set of redacted excerpts from the actual conversation between the builder
and their AI agent.

Rules:
- Use only the facts and excerpts given to you. Never invent a feature, a
  number, a name, a company, a timeline detail, or a technical claim that
  is not directly supported by what you were given.
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
  const models = usage.models.map((model) => `${model.name} (${model.turnCount} turns)`).join(", ") || "none recorded";
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

function excerptsBlock(snapshot: ScannerProjectSnapshot): string {
  const bundle = snapshot.narrativeEvidence;
  if (!bundle || bundle.excerpts.length === 0) return "No conversation excerpts were provided for this build.";
  return bundle.excerpts
    .map((excerpt) => `[${excerpt.role}] ${excerpt.text}`)
    .join("\n\n");
}

function sourceCatalogBlock(snapshot: ScannerProjectSnapshot): string {
  return snapshot.sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionRef.localeCompare(b.sessionRef))
    .map((session, index) => `S${String(index + 1).padStart(2, "0")}: ${session.provider}, ended ${session.endedAt}, ${session.turns} turns, ${session.toolCalls} tool calls`)
    .concat(snapshot.git.commits > 0 ? [`GIT: ${snapshot.git.commits} commits, ${snapshot.git.fileTouches} file touches`] : [])
    .join("\n");
}

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
