import type { ProjectSnapshot } from "./project-snapshot";
import type { PublicFieldKey } from "./ingestion/contracts";
import { sanitizePublicText } from "./publication/sanitization";

export type BuildStoryViewModel = ReturnType<typeof buildStoryFromSnapshot>;
export type PublicBuildStoryViewModel = ReturnType<typeof publicBuildStoryFromSnapshot>;

const shortMonthDay = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const longDate = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function buildStoryFromSnapshot(snapshot: ProjectSnapshot) {
  const minutes = snapshot.sessions.reduce(
    (sum, session) => sum + session.durationMinutes,
    0,
  );
  const modelRequests = snapshot.usage.models.reduce(
    (sum, model) => sum + model.requests,
    0,
  );

  return {
    id: snapshot.identity.id,
    slug: snapshot.identity.slug,
    name: snapshot.identity.name,
    tagline: snapshot.identity.tagline,
    description: snapshot.identity.description,
    status: snapshot.identity.status,
    owner: snapshot.identity.owner,
    repository: snapshot.repository,
    dateRange: `${shortMonthDay.format(new Date(snapshot.timeWindow.startedAt))} — ${shortMonthDay.format(new Date(snapshot.timeWindow.endedAt))}, 2026`,
    activeDays: snapshot.timeWindow.activeDays,
    sessionCount: snapshot.sessions.length,
    buildHours: Math.round((minutes / 60) * 10) / 10,
    modelRequests,
    models: snapshot.usage.models.map((model) => ({
      ...model,
      share:
        modelRequests > 0
          ? Math.round((model.requests / modelRequests) * 100)
          : 0,
      totalTokens: model.inputTokens + model.outputTokens,
    })),
    tools: snapshot.usage.tools,
    git: snapshot.git,
    milestones: snapshot.milestones.map((milestone, index) => ({
      ...milestone,
      index: index + 1,
      date: longDate.format(new Date(milestone.occurredAt)),
    })),
    sessions: snapshot.sessions.map((session, index) => ({
      ...session,
      index: index + 1,
      date: shortMonthDay.format(new Date(session.startedAt)),
      duration: `${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m`,
    })),
    redaction: snapshot.redaction,
    provenance: snapshot.provenance,
    receiptId: `BR-${snapshot.timeWindow.endedAt.slice(2, 10).replaceAll("-", "")}-${snapshot.repository.currentRevision.toUpperCase()}`,
  };
}

/**
 * Explicit publication boundary. Public routes receive this projection rather
 * than the source snapshot or full private report.
 */
export function publicBuildStoryFromSnapshot(
  snapshot: ProjectSnapshot,
  selectedPublicFields: PublicFieldKey[],
) {
  const story = buildStoryFromSnapshot(snapshot);
  const selected = new Set(selectedPublicFields);
  const publicName = sanitizePublicText(story.name, 160).value;
  const publicTagline = sanitizePublicText(story.tagline, 300).value;
  const publicDescription = sanitizePublicText(story.description, 4_000).value;
  return {
    id: story.id,
    slug: story.slug,
    name: publicName,
    tagline: selected.has("tagline") ? publicTagline : "",
    description: selected.has("description") ? publicDescription : "",
    status: story.status,
    owner: {
      name: sanitizePublicText(story.owner.name, 160).value,
      handle: sanitizePublicText(story.owner.handle, 80).value,
      role: sanitizePublicText(story.owner.role, 160).value,
    },
    dateRange: selected.has("timeWindow") ? story.dateRange : "Private build window",
    activeDays: selected.has("timeWindow") ? story.activeDays : 0,
    sessionCount: selected.has("sessionSummary") ? story.sessionCount : 0,
    buildHours: selected.has("sessionSummary") ? story.buildHours : 0,
    modelRequests: selected.has("modelMix") ? story.modelRequests : 0,
    models: selected.has("modelMix") ? story.models : [],
    tools: selected.has("toolUsage") ? story.tools : [],
    git: selected.has("gitAggregates")
      ? story.git
      : { ...story.git, commits: 0, additions: 0, deletions: 0, filesTouched: 0, branches: 0 },
    milestones: selected.has("milestones") ? story.milestones : [],
    redaction: {
      tokensRemoved: selected.has("redactionSummary") ? story.redaction.tokensRemoved : 0,
    },
    stack: [story.repository.framework, story.repository.primaryLanguage]
      .filter((value): value is string => Boolean(value)),
    receiptId: story.receiptId,
  };
}
