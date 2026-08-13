import assert from "node:assert/strict";
import test from "node:test";
import { POST as connect } from "../app/api/v1/cli/connect/route";
import { PUT as uploadSnapshot } from "../app/api/v1/cli/upload-sessions/[sessionId]/snapshot/route";
import { sha256Digest } from "../lib/ingestion/local-contract";
import {
  createUploadSession,
  ensureUser,
  getProjectDetail,
  getPublishedStory,
  getReport,
  listProjects,
  publishReport,
  updateReport,
} from "../lib/ingestion/mock-store";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "../lib/ingestion/scanner-project-snapshot";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

process.env.BUILDSTORY_LOCAL_API_ENABLED = "true";
process.env.BUILDSTORY_REPORT_READY_DELAY_MS = "0";

const creatorId = "dev:mina-park";

function routeContext<Key extends string>(key: Key, value: string) {
  return { params: Promise.resolve({ [key]: value }) } as { params: Promise<Record<Key, string>> };
}

function connectBody(sessionId: string, deviceCode: string) {
  return {
    protocolVersion: "1.0",
    uploadSessionId: sessionId,
    deviceCode,
    client: { command: "buildstory", version: "0.4.0" },
    capabilities: { projectSnapshotSchemaVersions: [PROJECT_SNAPSHOT_SCHEMA_VERSION], snapshotUpload: false },
  };
}

/** Drives one full connect -> PUT snapshot round trip through the real loopback API routes, exactly like the CLI does. */
async function uploadThroughLoopback(sessionId: string, userCode: string, snapshot: unknown) {
  const connection = await connect(
    new Request("http://localhost/api/v1/cli/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(connectBody(sessionId, userCode)),
    }),
  );
  assert.equal(connection.status, 200, "connect must succeed before a snapshot can be uploaded");
  const connectionJson = (await connection.json()) as { uploadGrant: { bearerToken: string; snapshotEndpoint: string } };
  const raw = JSON.stringify(snapshot);
  const digest = await sha256Digest(raw);
  const response = await uploadSnapshot(
    new Request(`http://localhost${connectionJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}`,
        "content-type": "application/json",
        "x-buildstory-schema-version": PROJECT_SNAPSHOT_SCHEMA_VERSION,
        "x-buildstory-snapshot-digest": digest,
      },
      body: raw,
    }),
    routeContext("sessionId", sessionId),
  );
  return response;
}

test("project updates: publishing a second chapter requires the same repository, carries editorial forward, and lands as chapter 2", async () => {
  // Chapter 1: a first scan with no target project, exactly like "Create a story" today.
  const first = await createUploadSession(creatorId, "Sample project", "http://localhost/");
  const firstUpload = await uploadThroughLoopback(first.deviceAuthorization.sessionId, first.deviceAuthorization.userCode, scannerFixture);
  assert.equal(firstUpload.status, 202);
  const firstAccepted = (await firstUpload.json()) as { reportUrl: string };
  const reportId1 = firstAccepted.reportUrl.split("/").at(-1)!;

  const report1 = await getReport(creatorId, reportId1);
  const projectId = report1.projectId;

  const chosenFields = ["tagline", "description", "gitAggregates", "modelMix"] as const;
  updateReport(creatorId, reportId1, {
    selectedPublicFields: [...chosenFields],
    category: "developer-tools",
    editorial: { reflection: "Learned to trust the redaction pass." },
  });
  await publishReport(creatorId, reportId1);

  // A creator explicitly targeting this project, but scanning a DIFFERENT repository,
  // must be rejected before it ever creates a stray report under the wrong fingerprint.
  const owner = await ensureUser({ creatorId, name: "Mina Park", email: "mina@buildstory.local", image: null });
  const mismatchSession = await createUploadSession(creatorId, "Sample project", "http://localhost/", owner.id, null, "off", projectId);
  const mismatchedSnapshot = {
    ...structuredClone(scannerFixture),
    scanId: "scan_1111111111abcdef11111111",
    repository: { ...scannerFixture.repository, fingerprint: `sha256:${"b".repeat(64)}` },
  };
  const mismatchResponse = await uploadThroughLoopback(mismatchSession.deviceAuthorization.sessionId, mismatchSession.deviceAuthorization.userCode, mismatchedSnapshot);
  assert.equal(mismatchResponse.status, 422);
  assert.match(JSON.stringify(await mismatchResponse.json()), /project_fingerprint_mismatch/);

  // The real update: same repository, more commits. The repository-activity milestone's
  // summary is cross-validated against git.commits (see validation.ts's
  // deterministicNarrativeViolations), so it must be updated to match.
  const updateSession = await createUploadSession(creatorId, "Sample project", "http://localhost/", owner.id, null, "off", projectId);
  const updatedCommitCount = scannerFixture.git.commits + 9;
  const chapter2Snapshot = {
    ...structuredClone(scannerFixture),
    scanId: "scan_2222222222abcdef22222222",
    git: { ...scannerFixture.git, commits: updatedCommitCount },
    milestones: scannerFixture.milestones.map((milestone) =>
      milestone.kind === "repository-activity"
        ? { ...milestone, summary: `${updatedCommitCount} commits observed in the selected time window.` }
        : milestone,
    ),
  };
  const updateResponse = await uploadThroughLoopback(updateSession.deviceAuthorization.sessionId, updateSession.deviceAuthorization.userCode, chapter2Snapshot);
  assert.equal(updateResponse.status, 202);
  const updateAccepted = (await updateResponse.json()) as { reportUrl: string };
  const reportId2 = updateAccepted.reportUrl.split("/").at(-1)!;

  const report2 = await getReport(creatorId, reportId2);
  assert.equal(report2.projectId, projectId, "the update lands on the same project, not a new one");
  assert.deepEqual(
    report2.selectedPublicFields,
    ["tagline", "description", "modelMix", "gitAggregates", "storySignals", "storyRecap", "signalHeadline"],
    "field selection carries forward, and newly introduced recap/signal keys are unioned so old projects are not stuck without them",
  );
  assert.equal(report2.category, "developer-tools", "category carries forward from the previous chapter");
  assert.equal(report2.editorial.reflection, "Learned to trust the redaction pass.", "reflection carries forward from the previous chapter");

  await publishReport(creatorId, reportId2);
  const published2 = await getReport(creatorId, reportId2);
  assert.equal(published2.publication.chapterIndex, 2);
  assert.equal(published2.chapterDelta?.build.commits.change, 9);

  const projects = await listProjects(creatorId);
  const thisProject = projects.find((project) => project.id === projectId);
  assert.equal(thisProject?.chapterCount, 2);

  const detail = await getProjectDetail(creatorId, projectId);
  assert.equal(detail.reports.length, 2);

  const publicStory = await getPublishedStory(owner.handle, report1.snapshot.identity.slug);
  assert.equal(publicStory?.reportId, reportId2, "chapter 2 is now the canonical public page");
  assert.equal(publicStory?.chapterDelta?.build.commits.change, 9, "the public band shows the same frozen delta");
});
