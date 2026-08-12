import type { ProjectSnapshot } from "@/lib/project-snapshot";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";
import { computeBuilderProfile } from "./profile";
import { computeSignals } from "./signals";
import { buildStoryPackSources } from "../narrative/story-pack";

export type ReportOwner = {
  id: string;
  name: string;
  handle: string;
  role: string;
};

function activeDays(snapshot: ScannerProjectSnapshot) {
  const days = new Set(
    snapshot.sessions.map((session) => session.startedAt.slice(0, 10)),
  );
  return days.size;
}

function durationMinutes(startedAt: string, endedAt: string) {
  const duration = Date.parse(endedAt) - Date.parse(startedAt);
  return Math.max(0, Math.round(duration / 60_000));
}

function observedActivityWindow(snapshot: ScannerProjectSnapshot) {
  if (snapshot.sessions.length === 0) {
    return { startedAt: snapshot.timeWindow.start, endedAt: snapshot.timeWindow.end };
  }
  return {
    startedAt: snapshot.sessions.reduce(
      (earliest, session) => session.startedAt < earliest ? session.startedAt : earliest,
      snapshot.sessions[0]!.startedAt,
    ),
    endedAt: snapshot.sessions.reduce(
      (latest, session) => session.endedAt > latest ? session.endedAt : latest,
      snapshot.sessions[0]!.endedAt,
    ),
  };
}

function isSyntheticModel(name: string) {
  return name.trim().toLocaleLowerCase("en-US") === "<synthetic>";
}

/**
 * Escapes "\" and ":" so `${escapeIdPart(provider)}:${escapeIdPart(name)}`
 * is injective - a literal colon inside `provider` or `name` can no longer
 * be mistaken for the field separator and collide two distinct models onto
 * the same id (which then collapses their cost shares onto one entry - see
 * build-story.ts's costShares).
 */
function escapeIdPart(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

/**
 * Turns the strict content-free scanner transport into the private report input
 * already consumed by the validated UI. No source snapshot field is invented,
 * and private scanner provenance stays on the private report only.
 */
export function reportSnapshotFromScanner(
  snapshot: ScannerProjectSnapshot,
  project: { id: string; slug: string },
  owner: ReportOwner,
): ProjectSnapshot {
  const repositoryName = snapshot.repository.displayName;
  const activityWindow = observedActivityWindow(snapshot);
  const reportModels = snapshot.usage.models.filter((model) => !isSyntheticModel(model.name));

  return {
    schemaVersion: "1.0",
    identity: {
      id: project.id,
      slug: project.slug,
      name: repositoryName,
      tagline: `A private build report generated from ${snapshot.sessions.length} repository-scoped AI session${snapshot.sessions.length === 1 ? "" : "s"}.`,
      description:
        "Buildstory assembled this report from the validated, content-free metadata in the uploaded ProjectSnapshot. Review every field before publishing.",
      status: "building",
      visibility: "private",
      owner,
    },
    repository: {
      provider: "local",
      repositoryName,
      remotePath: null,
      defaultBranch:
        snapshot.repository.branch ??
        (snapshot.repository.detachedHead ? "detached HEAD" : "unknown"),
      primaryLanguage: "Not collected",
      languages: [],
      framework: null,
      packageManager: null,
      fileCount: null,
      initialCommitAt: activityWindow.startedAt,
      currentRevision:
        snapshot.repository.headCommit?.slice(0, 12) ??
        snapshot.repository.fingerprint.slice("sha256:".length, 12 + "sha256:".length),
      isPrivate: true,
    },
    timeWindow: {
      startedAt: activityWindow.startedAt,
      endedAt: activityWindow.endedAt,
      activeDays: activeDays(snapshot),
      timezone: snapshot.timeWindow.timezone,
    },
    sessions: snapshot.sessions.map((session) => ({
      id: session.sessionRef,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMinutes: durationMinutes(session.startedAt, session.endedAt),
      intent: session.summary,
      outcome: `Session status: ${session.status}. ${session.turns} turns and ${session.toolCalls} tool calls were counted; message and tool bodies were discarded locally.`,
      modelIds: session.modelRefs.filter((model) => !isSyntheticModel(model)),
      toolIds: session.toolRefs,
      touchedAreas: [],
      ...(session.subagentInvocations !== undefined ? { subagentInvocations: session.subagentInvocations } : {}),
    })),
    usage: {
      models: reportModels.map((model) => ({
        id: `${escapeIdPart(model.provider)}:${escapeIdPart(model.name)}`,
        label: model.name,
        provider: model.provider,
        requests: model.turnCount,
        tokenUsage: model.tokenUsage
          ? {
              inputTokens: model.tokenUsage.inputTokens,
              outputTokens: model.tokenUsage.outputTokens,
              totalTokens: model.tokenUsage.totalTokens,
              cacheReadInputTokens: model.tokenUsage.cacheReadInputTokens ?? 0,
              cacheCreationInputTokens: model.tokenUsage.cacheCreationInputTokens ?? 0,
              cachedInputTokens: model.tokenUsage.cachedInputTokens,
              reasoningOutputTokens: model.tokenUsage.reasoningOutputTokens,
            }
          : null,
        costMicroUsd: model.costMicroUsd ?? null,
      })),
      tools: snapshot.usage.tools.map((tool) => ({
        id: tool.name,
        label: tool.name,
        category: "agent" as const,
        sessions: tool.sessionCount,
        callCount: tool.callCount,
      })),
      tokenUsage: snapshot.usage.tokenUsage
        ? {
            inputTokens: snapshot.usage.tokenUsage.inputTokens,
            outputTokens: snapshot.usage.tokenUsage.outputTokens,
            totalTokens: snapshot.usage.tokenUsage.totalTokens,
            cacheReadInputTokens: snapshot.usage.tokenUsage.cacheReadInputTokens ?? 0,
            cacheCreationInputTokens: snapshot.usage.tokenUsage.cacheCreationInputTokens ?? 0,
            cachedInputTokens: snapshot.usage.tokenUsage.cachedInputTokens,
            reasoningOutputTokens: snapshot.usage.tokenUsage.reasoningOutputTokens,
          }
        : null,
      // Absent on a snapshot from a scanner older than 1.6.0 - "no cost data," same as an unpriced model.
      cost: snapshot.usage.cost ?? null,
      // Absent on a snapshot from a scanner older than 1.7.0 - coverage is unknown, not zero.
      coverage: snapshot.usage.coverage ?? null,
    },
    git: {
      commits: snapshot.git.commits,
      mergeCommits: snapshot.git.mergeCommits,
      additions: snapshot.git.insertions,
      deletions: snapshot.git.deletions,
      filesTouched: snapshot.git.fileTouches,
      branches: snapshot.repository.branch ? 1 : 0,
      contributors: snapshot.git.contributors,
      firstCommitSha: snapshot.repository.headCommit?.slice(0, 12) ?? "not-collected",
      lastCommitSha: snapshot.repository.headCommit?.slice(0, 12) ?? "not-collected",
      ...(snapshot.git.aiAttribution ? { aiAttribution: structuredClone(snapshot.git.aiAttribution) } : {}),
      workingTree: { ...snapshot.git.workingTree },
    },
    milestones: snapshot.milestones.map((milestone, index) => ({
      id: milestone.milestoneId,
      occurredAt: milestone.occurredAt,
      title: milestone.title,
      description: milestone.summary,
      kind:
        milestone.kind === "repository-activity"
          ? index === snapshot.milestones.length - 1
            ? "ship"
            : "decision"
          : "breakthrough",
      evidenceRefs: milestone.evidenceRefs,
    })),
    redaction: {
      policyVersion: `scanner-project-snapshot-${PROJECT_SNAPSHOT_SCHEMA_VERSION}`,
      redactedFiles: snapshot.provenance.sourceFilesSkipped,
      generalizedPaths: snapshot.repository.rootPathIncluded ? 0 : 1,
      secretMatchesRemoved: snapshot.redaction.findings,
      tokensRemoved:
        snapshot.redaction.transcriptBodiesDiscarded +
        snapshot.redaction.toolPayloadsDiscarded,
      notes: [
        ...snapshot.redaction.limitations,
        `${snapshot.redaction.transcriptBodiesDiscarded} transcript bodies and ${snapshot.redaction.toolPayloadsDiscarded} tool payloads were discarded locally.`,
      ],
    },
    provenance: {
      scannerVersion: snapshot.provenance.scanner.version,
      scannedAt: snapshot.generatedAt,
      source: "local-cli",
      machineScope: "repository-only",
      snapshotHash: snapshot.repository.fingerprint,
      consentVersion: snapshot.sourceSelection.consent.statementVersion,
    },
    sourceSelection: snapshot.sourceSelection,
    ...(snapshot.eventSpine ? { eventSpine: snapshot.eventSpine } : {}),
    builderProfile: computeBuilderProfile({
      sessions: snapshot.sessions,
      usage: snapshot.usage,
      git: snapshot.git,
      timeWindow: snapshot.timeWindow,
    }),
    // Computed here - before and independent of any narrative decision - so
    // signals are a property of the report, not of the narrative. That is
    // what makes "off" and "local" narrative mode first-class report
    // recipients rather than degraded ones: they need no model, no key, and
    // no network for the facts half of the report.
    signals: computeSignals({
      sessions: snapshot.sessions,
      usage: snapshot.usage,
      git: snapshot.git,
      timeWindow: snapshot.timeWindow,
      narrativeEvidence: snapshot.narrativeEvidence,
      sources: buildStoryPackSources(snapshot),
    }),
    ...(snapshot.generatedNarrative ? {
      narrative: {
        ...snapshot.generatedNarrative.sections,
        ...(snapshot.generatedNarrative.storyPack ? { storyPack: snapshot.generatedNarrative.storyPack } : {}),
        fallbacksUsed: snapshot.generatedNarrative.fallbacksUsed,
      },
    } : {}),
  };
}
