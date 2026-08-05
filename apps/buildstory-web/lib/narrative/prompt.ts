import type { ScannerProjectSnapshot } from "../ingestion/scanner-project-snapshot";
import { NARRATIVE_OUTPUT_JSON_SCHEMA } from "./schema";

const SYSTEM_PROMPT = `You write short, honest "build story" narratives for Buildstory, a site where
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
- Respond with JSON matching the given schema exactly, and nothing else.`;

function factsBlock(snapshot: ScannerProjectSnapshot): string {
  const usage = snapshot.usage;
  const models = usage.models.map((model) => `${model.name} (${model.turnCount} turns)`).join(", ") || "none recorded";
  const tokenLine = usage.tokenUsage
    ? `${usage.tokenUsage.totalTokens.toLocaleString("en-US")} tokens processed (${usage.tokenUsage.inputTokens.toLocaleString("en-US")} in / ${usage.tokenUsage.outputTokens.toLocaleString("en-US")} out)`
    : "token usage not collected";
  const activeDays = new Set(snapshot.sessions.map((session) => session.startedAt.slice(0, 10))).size;

  return [
    `Repository: ${snapshot.repository.displayName}`,
    `Build window: ${snapshot.timeWindow.start} to ${snapshot.timeWindow.end} (${activeDays} active day${activeDays === 1 ? "" : "s"})`,
    `Sessions: ${snapshot.sessions.length}`,
    `Commits: ${snapshot.git.commits} (${snapshot.git.insertions} insertions, ${snapshot.git.deletions} deletions)`,
    `Models used: ${models}`,
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

export function buildNarrativeMessages(snapshot: ScannerProjectSnapshot): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `FACTS:\n${factsBlock(snapshot)}\n\nEXCERPTS:\n${excerptsBlock(snapshot)}\n\nWrite the build story now, as JSON matching the schema.`,
    },
  ];
}

export const NARRATIVE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "buildstory_narrative",
    strict: true,
    schema: NARRATIVE_OUTPUT_JSON_SCHEMA,
  },
};
