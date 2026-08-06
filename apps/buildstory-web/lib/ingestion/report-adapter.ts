import type { ProjectSnapshot } from "@/lib/project-snapshot";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";
import { computeBuilderProfile } from "./profile";

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
      initialCommitAt: snapshot.timeWindow.start,
      currentRevision:
        snapshot.repository.headCommit?.slice(0, 12) ??
        snapshot.repository.fingerprint.slice("sha256:".length, 12 + "sha256:".length),
      isPrivate: true,
    },
    timeWindow: {
      startedAt: snapshot.timeWindow.start,
      endedAt: snapshot.timeWindow.end,
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
      modelIds: session.modelRefs,
      toolIds: session.toolRefs,
      touchedAreas: [],
    })),
    usage: {
      models: snapshot.usage.models.map((model) => ({
        id: `${model.provider}:${model.name}`,
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
            }
          : null,
        costMicroUsd: model.costMicroUsd ?? null,
      })),
      tools: snapshot.usage.tools.map((tool) => ({
        id: tool.name,
        label: tool.name,
        category: "agent" as const,
        sessions: tool.sessionCount,
      })),
      tokenUsage: snapshot.usage.tokenUsage
        ? {
            inputTokens: snapshot.usage.tokenUsage.inputTokens,
            outputTokens: snapshot.usage.tokenUsage.outputTokens,
            totalTokens: snapshot.usage.tokenUsage.totalTokens,
            cacheReadInputTokens: snapshot.usage.tokenUsage.cacheReadInputTokens ?? 0,
            cacheCreationInputTokens: snapshot.usage.tokenUsage.cacheCreationInputTokens ?? 0,
          }
        : null,
      // Absent on a snapshot from a scanner older than 1.6.0 - "no cost data," same as an unpriced model.
      cost: snapshot.usage.cost ?? null,
    },
    git: {
      commits: snapshot.git.commits,
      additions: snapshot.git.insertions,
      deletions: snapshot.git.deletions,
      filesTouched: snapshot.git.fileTouches,
      branches: snapshot.repository.branch ? 1 : 0,
      contributors: snapshot.git.contributors,
      firstCommitSha: snapshot.repository.headCommit?.slice(0, 12) ?? "not-collected",
      lastCommitSha: snapshot.repository.headCommit?.slice(0, 12) ?? "not-collected",
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
    builderProfile: computeBuilderProfile({
      sessions: snapshot.sessions,
      usage: snapshot.usage,
      git: snapshot.git,
      timeWindow: snapshot.timeWindow,
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
