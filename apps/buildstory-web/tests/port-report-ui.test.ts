import assert from "node:assert/strict";
import test from "node:test";
import { POST as connect } from "../app/api/v1/cli/connect/route";
import { PUT as uploadSnapshot } from "../app/api/v1/cli/upload-sessions/[sessionId]/snapshot/route";
import { sha256Digest } from "../lib/ingestion/local-contract";
import {
  createUploadSession,
  ensureUser,
  getPublishedStory,
  getReport,
  portReportUi,
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

async function uploadThroughLoopback(sessionId: string, userCode: string, snapshot: unknown) {
  const connection = await connect(
    new Request("http://localhost/api/v1/cli/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(connectBody(sessionId, deviceCode(userCode))),
    }),
  );
  assert.equal(connection.status, 200, "connect must succeed before a snapshot can be uploaded");
  const connectionJson = (await connection.json()) as { uploadGrant: { bearerToken: string; snapshotEndpoint: string } };
  const raw = JSON.stringify(snapshot);
  const digest = await sha256Digest(raw);
  return uploadSnapshot(
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
}

function deviceCode(userCode: string) {
  return userCode;
}

test("porting a published report rebuilds the frozen public recap without a schema migration", async () => {
  const session = await createUploadSession(creatorId, "Port UI project", "http://localhost/");
  const upload = await uploadThroughLoopback(session.deviceAuthorization.sessionId, session.deviceAuthorization.userCode, scannerFixture);
  assert.equal(upload.status, 202);
  const accepted = (await upload.json()) as { reportUrl: string };
  const reportId = accepted.reportUrl.split("/").at(-1)!;
  await getReport(creatorId, reportId);
  updateReport(creatorId, reportId, {
    selectedPublicFields: ["tagline", "description", "modelMix", "gitAggregates"],
    category: "web-apps",
  });
  await publishReport(creatorId, reportId);
  const owner = await ensureUser({ creatorId, name: "Mina Park", email: "mina@buildstory.local", image: null });
  const report = await getReport(creatorId, reportId);
  const before = await getPublishedStory(owner.handle, report.snapshot.identity.slug);
  assert.equal(before?.recapEnabled, false, "a pre-sprint public selection must not expose recap until the port runs");

  const page = portReportUi("", 5, false, reportId);
  assert.equal(page.processed, 1);
  const after = await getPublishedStory(owner.handle, report.snapshot.identity.slug);
  assert.equal(after?.recapEnabled, true, "the port job rebuilds the frozen public projection with recap enabled");
  const ported = await getReport(creatorId, reportId);
  assert.ok(ported.selectedPublicFields.includes("storyRecap"));
  assert.equal(typeof ported.snapshot.builderProfile?.workPatterns.nightShare, "number");
});
