import assert from "node:assert/strict";
import test from "node:test";
import { POST as connect } from "../app/api/v1/cli/connect/route";
import { GET as getLocalReportRoute } from "../app/api/v1/cli/reports/[reportId]/route";
import { PUT as uploadSnapshot } from "../app/api/v1/cli/upload-sessions/[sessionId]/snapshot/route";
import { GET as getUploadStatus } from "../app/api/v1/cli/upload-sessions/[sessionId]/status/route";
import { publicBuildStoryFromSnapshot } from "../lib/build-story";
import { sha256Digest } from "../lib/ingestion/local-contract";
import {
  createUploadSession,
  getPublishedStoryBySlug,
  getReport,
  getUploadSession,
  publishReport,
  updateReport,
} from "../lib/ingestion/mock-store";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "../lib/ingestion/scanner-project-snapshot";
import { validateProjectSnapshot } from "../lib/ingestion/validation";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

process.env.BUILDSTORY_LOCAL_API_ENABLED = "true";
process.env.BUILDSTORY_REPORT_READY_DELAY_MS = "0";

const creatorId = "dev:mina-park";

function connectBody(sessionId: string, deviceCode: string) {
  return {
    protocolVersion: "1.0",
    uploadSessionId: sessionId,
    deviceCode,
    client: { command: "buildstory", version: "0.4.0" },
    capabilities: {
      projectSnapshotSchemaVersions: [PROJECT_SNAPSHOT_SCHEMA_VERSION],
      snapshotUpload: false,
    },
  };
}

function routeContext<Key extends string>(key: Key, value: string) {
  return { params: Promise.resolve({ [key]: value }) } as {
    params: Promise<Record<Key, string>>;
  };
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("loopback connect refuses remote requests and browser cookies do not authorize it", async () => {
  const payload = connectBody("upl_unknown", "NOPE-NOPE");
  const remote = await connect(
    new Request("https://example.com/api/v1/cli/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  assert.equal(remote.status, 403);
  assert.match(JSON.stringify(await body(remote)), /loopback_required/);

  const cookieOnly = await connect(
    new Request("http://localhost/api/v1/cli/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "authjs.session-token=must-not-authorize-cli",
      },
      body: JSON.stringify(payload),
    }),
  );
  assert.equal(cookieOnly.status, 401);
  assert.match(JSON.stringify(await body(cookieOnly)), /connect_rejected/);
});

test("strict ProjectSnapshot validation rejects raw-content and unknown fields", () => {
  assert.equal(validateProjectSnapshot(scannerFixture).ok, true);

  const rawTranscript = {
    ...structuredClone(scannerFixture),
    transcript: "raw session text must never cross the boundary",
  };
  const rawResult = validateProjectSnapshot(rawTranscript);
  assert.equal(rawResult.ok, false);
  assert.match(
    rawResult.ok ? "" : rawResult.errors.join(" "),
    /forbidden.*raw source, transcript/i,
  );

  const nestedUnknown = structuredClone(scannerFixture) as typeof scannerFixture & {
    repository: typeof scannerFixture.repository & { absolutePath?: string };
  };
  nestedUnknown.repository.absolutePath = "C:\\private\\repository";
  const unknownResult = validateProjectSnapshot(nestedUnknown);
  assert.equal(unknownResult.ok, false);
  assert.match(
    unknownResult.ok ? "" : unknownResult.errors.join(" "),
    /absolutePath is forbidden/i,
  );

  for (const unsafeSummary of [
    "Codex output at https://private.example.invalid/repository",
    "Codex output from C:\\Users\\builder\\private\\source.ts",
    "Codex output with token=sk-proj-abcdefghijklmnopqrstuvwxyz123456",
    "A copied transcript body that is not a structural aggregate.",
  ]) {
    const unsafe = structuredClone(scannerFixture);
    unsafe.sessions[0].summary = unsafeSummary;
    const result = validateProjectSnapshot(unsafe);
    assert.equal(result.ok, false);
    assert.match(
      result.ok ? "" : result.errors.join(" "),
      /privacy boundary|scanner-generated aggregate/i,
    );
  }
});

test("local scanner lifecycle enforces owner, digest, size, and one-use grant boundaries", async () => {
  const created = await createUploadSession(
    creatorId,
    "Scanner route test",
    "http://localhost/",
  );
  const { sessionId, userCode } = created.deviceAuthorization;

  assert.throws(
    () => getUploadSession("creator:someone-else", sessionId),
    /Upload session not found/,
  );

  const connection = await connect(
    new Request("http://localhost/api/v1/cli/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-buildstory-client-version": "0.4.0",
      },
      body: JSON.stringify(connectBody(sessionId, userCode)),
    }),
  );
  assert.equal(connection.status, 200);
  const connectionJson = (await connection.json()) as {
    protocolVersion: string;
    status: string;
    uploadSessionId: string;
    connectionId: string;
    uploadGrant: {
      bearerToken: string;
      snapshotEndpoint: string;
      expiresAt: string;
      schemaVersion: string;
      maxBytes: number;
    };
  };
  assert.deepEqual(Object.keys(connectionJson).sort(), [
    "connectionId",
    "protocolVersion",
    "status",
    "uploadGrant",
    "uploadSessionId",
  ]);
  assert.equal(connectionJson.protocolVersion, "1.0");
  assert.equal(connectionJson.status, "connected");
  assert.equal(connectionJson.uploadSessionId, sessionId);
  assert.equal(connectionJson.uploadGrant.schemaVersion, PROJECT_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(connectionJson.uploadGrant.maxBytes, 1_000_000);
  assert.doesNotMatch(JSON.stringify(connectionJson), /deviceCode|userCode|cookie/i);

  const reusedCode = await connect(
    new Request("http://localhost/api/v1/cli/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(connectBody(sessionId, userCode)),
    }),
  );
  assert.equal(reusedCode.status, 401);
  assert.match(JSON.stringify(await body(reusedCode)), /connect_rejected/);

  const statusContext = routeContext("sessionId", sessionId);
  const noSnapshotYet = await getUploadStatus(
    new Request(`http://localhost/api/v1/cli/upload-sessions/${sessionId}/status`, {
      headers: { authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}` },
    }),
    statusContext,
  );
  assert.equal(noSnapshotYet.status, 409);
  assert.match(JSON.stringify(await body(noSnapshotYet)), /snapshot_not_uploaded/);

  const uploadContext = routeContext("sessionId", sessionId);
  const missingBearer = await uploadSnapshot(
    new Request(`http://localhost${connectionJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: "authjs.session-token=must-not-authorize-cli",
      },
      body: JSON.stringify(scannerFixture),
    }),
    uploadContext,
  );
  assert.equal(missingBearer.status, 401);

  const oversized = await uploadSnapshot(
    new Request(`http://localhost${connectionJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}`,
        "content-type": "application/json",
        "content-length": "1000001",
        "x-buildstory-schema-version": PROJECT_SNAPSHOT_SCHEMA_VERSION,
        "x-buildstory-snapshot-digest": `sha256:${"0".repeat(64)}`,
      },
      body: "{}",
    }),
    uploadContext,
  );
  assert.equal(oversized.status, 413);

  const forbiddenSnapshot = {
    ...structuredClone(scannerFixture),
    rawTranscript: "not allowed",
  };
  const forbiddenRaw = JSON.stringify(forbiddenSnapshot);
  const forbiddenUpload = await uploadSnapshot(
    new Request(`http://localhost${connectionJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}`,
        "content-type": "application/json",
        "x-buildstory-schema-version": PROJECT_SNAPSHOT_SCHEMA_VERSION,
        "x-buildstory-snapshot-digest": await sha256Digest(forbiddenRaw),
      },
      body: forbiddenRaw,
    }),
    uploadContext,
  );
  assert.equal(forbiddenUpload.status, 422);
  assert.match(JSON.stringify(await body(forbiddenUpload)), /rawTranscript.*forbidden/i);

  const snapshotRaw = JSON.stringify(scannerFixture);
  const snapshotDigest = await sha256Digest(snapshotRaw);
  const accepted = await uploadSnapshot(
    new Request(`http://localhost${connectionJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}`,
        "content-type": "application/json",
        "x-buildstory-schema-version": PROJECT_SNAPSHOT_SCHEMA_VERSION,
        "x-buildstory-snapshot-digest": snapshotDigest,
      },
      body: snapshotRaw,
    }),
    uploadContext,
  );
  assert.equal(accepted.status, 202);
  const acceptedJson = (await accepted.json()) as {
    protocolVersion: string;
    status: string;
    receipt: {
      receiptId: string;
      scanId: string;
      snapshotDigest: string;
      acceptedAt: string;
    };
    statusUrl: string;
    reportUrl: string;
  };
  assert.equal(acceptedJson.status, "accepted");
  assert.equal(acceptedJson.receipt.scanId, scannerFixture.scanId);
  assert.equal(acceptedJson.receipt.snapshotDigest, snapshotDigest);
  assert.ok(acceptedJson.statusUrl.startsWith("/api/v1/cli/"));
  assert.ok(acceptedJson.reportUrl.startsWith("/api/v1/cli/"));

  const wrongGrant = await uploadSnapshot(
    new Request(`http://localhost${connectionJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        authorization: "Bearer bsu_wrong",
        "content-type": "application/json",
        "x-buildstory-schema-version": PROJECT_SNAPSHOT_SCHEMA_VERSION,
        "x-buildstory-snapshot-digest": snapshotDigest,
      },
      body: snapshotRaw,
    }),
    uploadContext,
  );
  assert.equal(wrongGrant.status, 401);
  assert.match(JSON.stringify(await body(wrongGrant)), /invalid_upload_token/);

  const reusedGrant = await uploadSnapshot(
    new Request(`http://localhost${connectionJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}`,
        "content-type": "application/json",
        "x-buildstory-schema-version": PROJECT_SNAPSHOT_SCHEMA_VERSION,
        "x-buildstory-snapshot-digest": snapshotDigest,
      },
      body: snapshotRaw,
    }),
    uploadContext,
  );
  assert.equal(reusedGrant.status, 409);
  assert.match(JSON.stringify(await body(reusedGrant)), /upload_token_used/);

  const wrongStatusToken = await getUploadStatus(
    new Request(`http://localhost${acceptedJson.statusUrl}`, {
      headers: { authorization: "Bearer bsu_wrong" },
    }),
    statusContext,
  );
  assert.equal(wrongStatusToken.status, 401);

  const readyStatus = await getUploadStatus(
    new Request(`http://localhost${acceptedJson.statusUrl}`, {
      headers: { authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}` },
    }),
    statusContext,
  );
  assert.equal(readyStatus.status, 200);
  assert.deepEqual(await readyStatus.json(), {
    protocolVersion: "1.0",
    status: "ready",
    reportReady: true,
    narrativeStatus: "failed",
  });

  const reportId = acceptedJson.reportUrl.split("/").at(-1);
  assert.ok(reportId);
  const reportResponse = await getLocalReportRoute(
    new Request(`http://localhost${acceptedJson.reportUrl}`, {
      headers: { authorization: `Bearer ${connectionJson.uploadGrant.bearerToken}` },
    }),
    routeContext("reportId", reportId),
  );
  assert.equal(reportResponse.status, 200);
  const localReport = await reportResponse.json();
  assert.deepEqual(localReport, {
    protocolVersion: "1.0",
    status: "ready",
    report: {
      summary:
        "Private report ready for sample-project. Review it in the Buildstory dashboard before publishing.",
      sessionCount: 1,
      commitCount: 2,
      milestoneCount: 2,
      warningCount: 0,
    },
  });

  const privateReport = await getReport(creatorId, reportId);
  const publicProjection = publicBuildStoryFromSnapshot(privateReport.snapshot, [
    "tagline",
  ]);
  const publicJson = JSON.stringify(publicProjection);
  assert.equal(publicProjection.models.length, 0);
  assert.equal(publicProjection.milestones.length, 0);
  assert.equal(publicProjection.git.commits, 0);
  assert.doesNotMatch(publicJson, /scan_0123456789abcdef01234567/);
  assert.doesNotMatch(publicJson, /sha256:aaaaaaaa/);
  assert.doesNotMatch(publicJson, /Codex session with 3 user turns/);
  assert.doesNotMatch(publicJson, /github\.com/);

  assert.throws(
    () =>
      updateReport(creatorId, reportId, {
        editorial: {
          tagline: "token=sk-proj-abcdefghijklmnopqrstuvwxyz123456",
        },
      }),
    /Editorial text cannot contain secrets/i,
  );

  updateReport(creatorId, reportId, { selectedPublicFields: ["tagline"], category: "web-apps" });
  await publishReport(creatorId, reportId);
  const published = getPublishedStoryBySlug(privateReport.publication.slug);
  assert.ok(published);
  const publishedJson = JSON.stringify(published);
  assert.doesNotMatch(publishedJson, /scan_0123456789abcdef01234567/);
  assert.doesNotMatch(publishedJson, /sha256:aaaaaaaa/);
  assert.doesNotMatch(publishedJson, /Codex session with 3 user turns/);
  assert.doesNotMatch(publishedJson, /dev:mina-park|google:[a-z0-9_-]+/i);
});

function pairStartBody() {
  return {
    protocolVersion: "1.0",
    client: { command: "buildstory", version: "1.3.0" },
    projectLabel: "Pairing test",
    narrativeMode: "local",
  };
}

test("CLI pairing start is rate-limited and poll does not leak a grant before approve", async () => {
  const previousBypass = process.env.BUILDSTORY_DEV_AUTH_BYPASS;
  process.env.BUILDSTORY_DEV_AUTH_BYPASS = "true";
  const { POST: startPair } = await import("../app/api/v1/cli/pair/start/route");
  const { POST: pollPair } = await import("../app/api/v1/cli/pair/poll/route");
  const { POST: approvePair } = await import("../app/api/creator/cli-pair/approve/route");

  const start = await startPair(
    new Request("http://localhost/api/v1/cli/pair/start", {
      method: "POST",
      headers: { "content-type": "application/json", "x-buildstory-client-version": "1.3.0" },
      body: JSON.stringify(pairStartBody()),
    }),
  );
  assert.equal(start.status, 200);
  const started = (await start.json()) as {
    pairingId: string;
    userCode: string;
    verificationUrl: string;
    intervalSeconds: number;
  };
  assert.deepEqual(Object.keys(started).sort(), [
    "expiresAt",
    "intervalSeconds",
    "pairingId",
    "protocolVersion",
    "userCode",
    "verificationUrl",
  ]);
  assert.match(started.verificationUrl, /\/studio\/cli-pair\?code=/);
  assert.doesNotMatch(started.verificationUrl, /Bearer|bsu_/i);

  const pending = await pollPair(
    new Request("http://localhost/api/v1/cli/pair/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: "1.0", pairingId: started.pairingId }),
    }),
  );
  assert.equal(pending.status, 202);

  process.env.BUILDSTORY_DEV_AUTH_BYPASS = "false";
  const unauthenticated = await approvePair(
    new Request("http://localhost/api/creator/cli-pair/approve", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ userCode: started.userCode }),
    }),
  );
  assert.equal(unauthenticated.status, 401);

  process.env.BUILDSTORY_DEV_AUTH_BYPASS = "true";
  const approved = await approvePair(
    new Request("http://localhost/api/creator/cli-pair/approve", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ userCode: started.userCode }),
    }),
  );
  assert.equal(approved.status, 200, JSON.stringify(await approved.clone().json().catch(() => null)));

  const granted = await pollPair(
    new Request("http://localhost/api/v1/cli/pair/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: "1.0", pairingId: started.pairingId }),
    }),
  );
  assert.equal(granted.status, 200);
  const grantJson = (await granted.json()) as {
    status: string;
    uploadSessionId: string;
    uploadGrant: { bearerToken: string; snapshotEndpoint: string };
  };
  assert.equal(grantJson.status, "connected");
  assert.ok(grantJson.uploadGrant.bearerToken.length >= 16);

  const reused = await pollPair(
    new Request("http://localhost/api/v1/cli/pair/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: "1.0", pairingId: started.pairingId }),
    }),
  );
  assert.equal(reused.status, 410);

  const snapshotRaw = JSON.stringify({
    ...structuredClone(scannerFixture),
    generatedNarrative: {
      version: "1.0.0",
      generatedAt: "2026-08-03T12:00:00.000Z",
      mode: "local",
      provider: "ollama",
      model: "gemma4:12b",
      sections: {
        headline: "Local first",
        narrative: "The report prose was generated before upload.",
        turningPoint: "The model stayed on the builder's machine.",
        learnings: ["Keep private excerpts local."],
        decisionPatterns: ["Review before shipping."],
        standoutTraits: ["Protects the boundary."],
        growthEdge: "Validate the weak product-instinct proxy with more evidence.",
      },
      fallbacksUsed: [],
    },
  });
  const accepted = await uploadSnapshot(
    new Request(`http://localhost${grantJson.uploadGrant.snapshotEndpoint}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${grantJson.uploadGrant.bearerToken}`,
        "content-type": "application/json",
        "x-buildstory-schema-version": PROJECT_SNAPSHOT_SCHEMA_VERSION,
        "x-buildstory-snapshot-digest": await sha256Digest(snapshotRaw),
      },
      body: snapshotRaw,
    }),
    routeContext("sessionId", grantJson.uploadSessionId),
  );
  assert.equal(accepted.status, 202, JSON.stringify(await accepted.clone().json().catch(() => null)));

  const limitedStatuses: number[] = [];
  for (let index = 0; index < 31; index += 1) {
    const response = await startPair(
      new Request("http://localhost/api/v1/cli/pair/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.50",
        },
        body: JSON.stringify(pairStartBody()),
      }),
    );
    limitedStatuses.push(response.status);
    await response.body?.cancel().catch(() => undefined);
  }
  assert.equal(limitedStatuses[30], 429);

  if (previousBypass === undefined) delete process.env.BUILDSTORY_DEV_AUTH_BYPASS;
  else process.env.BUILDSTORY_DEV_AUTH_BYPASS = previousBypass;
});
