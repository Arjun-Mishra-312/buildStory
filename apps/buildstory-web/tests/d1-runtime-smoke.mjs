import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = new URL(process.env.BUILDSTORY_SMOKE_BASE_URL ?? "http://127.0.0.1:3000/");
const fixture = await readFile(
  new URL("./fixtures/scanner-project-snapshot.json", import.meta.url),
  "utf8",
);
const digest = `sha256:${createHash("sha256").update(fixture).digest("hex")}`;
const schemaVersion = JSON.parse(fixture).schemaVersion;

async function assertStatus(response, expected) {
  if (response.status !== expected) {
    assert.fail(`Expected HTTP ${expected}, received ${response.status}: ${await response.text()}`);
  }
}

const createdResponse = await fetch(new URL("api/creator/upload-sessions", base), {
  method: "POST",
  redirect: "error",
  headers: {
    "content-type": "application/json",
    origin: base.origin,
  },
  // Explicit "off": this test exercises D1 storage/job mechanics, not narrative
  // generation. The default mode needs either a local Ollama or a real cloud
  // LLM key, neither available here, and the job would sit in "processing"
  // forever waiting on a dependency this test was never meant to need.
  body: JSON.stringify({ projectLabel: "D1 runtime smoke", narrativeMode: "off" }),
});
await assertStatus(createdResponse, 201);
const created = await createdResponse.json();

const connectResponse = await fetch(new URL("api/v1/cli/connect", base), {
  method: "POST",
  redirect: "error",
  headers: {
    "content-type": "application/json",
    "x-buildstory-client-version": "0.4.0",
  },
  body: JSON.stringify({
    protocolVersion: "1.0",
    uploadSessionId: created.deviceAuthorization.sessionId,
    deviceCode: created.deviceAuthorization.userCode,
    client: { command: "buildstory", version: "0.4.0" },
    capabilities: {
      projectSnapshotSchemaVersions: [schemaVersion],
      snapshotUpload: false,
    },
  }),
});
await assertStatus(connectResponse, 200);
const connection = await connectResponse.json();
const token = connection.uploadGrant.bearerToken;

const uploadUrl = new URL(connection.uploadGrant.snapshotEndpoint, base);
const uploadResponse = await fetch(uploadUrl, {
  method: "PUT",
  redirect: "error",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-buildstory-schema-version": schemaVersion,
    "x-buildstory-snapshot-digest": digest,
  },
  body: fixture,
});
await assertStatus(uploadResponse, 202);
const accepted = await uploadResponse.json();
assert.equal(accepted.receipt.snapshotDigest, digest);

const replayResponse = await fetch(uploadUrl, {
  method: "PUT",
  redirect: "error",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-buildstory-schema-version": schemaVersion,
    "x-buildstory-snapshot-digest": digest,
  },
  body: fixture,
});
await assertStatus(replayResponse, 409);

const readHeaders = { authorization: `Bearer ${token}`, accept: "application/json" };
const statusResponse = await fetch(new URL(accepted.statusUrl, base), {
  redirect: "error",
  headers: readHeaders,
});
await assertStatus(statusResponse, 200);
const status = await statusResponse.json();
assert.deepEqual(status, {
  protocolVersion: "1.0",
  status: "ready",
  reportReady: true,
});

const reportResponse = await fetch(new URL(accepted.reportUrl, base), {
  redirect: "error",
  headers: readHeaders,
});
await assertStatus(reportResponse, 200);
const reportText = await reportResponse.text();
assert.doesNotMatch(
  reportText,
  /absolutePath|remoteHost|transcript|toolArguments|toolResults|sourceCode|diff|patch/i,
);
const report = JSON.parse(reportText);
assert.equal(report.status, "ready");
assert.equal(report.report.sessionCount, 1);

const reportId = accepted.reportUrl.split("/").at(-1);
assert.ok(reportId);
const unsafeEditorial = "token=sk-proj-abcdefghijklmnopqrstuvwxyz123456";
const unsafePatchResponse = await fetch(new URL(`api/creator/reports/${reportId}`, base), {
  method: "PATCH",
  redirect: "error",
  headers: {
    "content-type": "application/json",
    origin: base.origin,
  },
  body: JSON.stringify({ editorial: { tagline: unsafeEditorial } }),
});
await assertStatus(unsafePatchResponse, 422);
const unsafePatchText = await unsafePatchResponse.text();
assert.doesNotMatch(unsafePatchText, /sk-proj|abcdefghijklmnopqrstuvwxyz123456/i);

// Publish requires a category (STORY_CATEGORIES in lib/ingestion/contracts.ts);
// the rejected patch above never set one, since it's specifically testing that
// unsafe editorial content is refused, not exercising a real edit.
const categoryPatchResponse = await fetch(new URL(`api/creator/reports/${reportId}`, base), {
  method: "PATCH",
  redirect: "error",
  headers: {
    "content-type": "application/json",
    origin: base.origin,
  },
  body: JSON.stringify({ category: "developer-tools" }),
});
await assertStatus(categoryPatchResponse, 200);
const categoryPatch = await categoryPatchResponse.json();

const publishResponse = await fetch(new URL(`api/creator/reports/${reportId}/publish`, base), {
  method: "POST",
  redirect: "error",
  headers: { origin: base.origin, "content-type": "application/json" },
  body: JSON.stringify({
    confirmation: "publish-reviewed-v1",
    selectedPublicFields: categoryPatch.report.selectedPublicFields,
  }),
});
await assertStatus(publishResponse, 200);
const publication = (await publishResponse.json()).publication;
assert.equal(publication.status, "published");
assert.match(publication.publicUrl, /\/u\/[^/]+\/[^/]+$/);

const canonicalPath = new URL(publication.publicUrl).pathname;
const canonicalResponse = await fetch(new URL(canonicalPath, base), { redirect: "error" });
await assertStatus(canonicalResponse, 200);

const legacyResponse = await fetch(new URL(`p/${publication.slug}`, base), { redirect: "manual" });
await assertStatus(legacyResponse, 308);
assert.equal(new URL(legacyResponse.headers.get("location"), base).pathname, canonicalPath);

const unpublishResponse = await fetch(new URL(`api/creator/reports/${reportId}/publish`, base), {
  method: "DELETE",
  redirect: "error",
  headers: { origin: base.origin },
});
await assertStatus(unpublishResponse, 200);
assert.equal((await unpublishResponse.json()).publication.status, "not_published");

const unpublishedCanonical = await fetch(new URL(canonicalPath, base), { redirect: "manual" });
await assertStatus(unpublishedCanonical, 404);

const unpublishedLegacy = await fetch(new URL(`p/${publication.slug}`, base), { redirect: "manual" });
await assertStatus(unpublishedLegacy, 404);

console.log("D1 runtime smoke passed: durable one-use upload, job, safe reads, publication redirect, and unpublish cycle.");
