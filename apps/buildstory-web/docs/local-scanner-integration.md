# Local scanner-to-dashboard integration

This is a real localhost development path, not a production service. The web
app accepts a strict, redacted `ProjectSnapshot`, queues an in-memory report,
and lets the creator review it. Restarting the web server erases every new
session, grant, uploaded snapshot, and generated report.

## Prerequisites

- Node.js 20 or newer and Git.
- The local Buildstory scanner package containing `scan-upload`.
- This web app running on a loopback URL.

`mock://local` only validates the CLI without contacting the dashboard. Use the
real loopback base URL below for an end-to-end import.

## End-to-end PowerShell flow

### 1. Start the web app

From this repository:

```powershell
npm install
Copy-Item .env.example .env.local
```

Set these local-only values in `.env.local`:

```dotenv
BUILDSTORY_DEV_AUTH_BYPASS=true
BUILDSTORY_LOCAL_API_ENABLED=true
BUILDSTORY_PUBLIC_ORIGIN=http://localhost:3000
```

Then start the documented development command:

```powershell
npm run dev
```

The default CLI API base is `http://localhost:3000/`. If the dev server prints a
different port, use that exact loopback URL.

### 2. Create an owner-bound upload session

Open `http://localhost:3000/studio/connect`, enter a project label, and click
**Create connection code**. The browser receives only the session ID and device
code. It never receives the upload bearer.

### 3. Connect the CLI

In the repository you intend to scan, run the first command copied from the
dashboard. It has this shape:

```powershell
buildstory connect "UPLOAD_SESSION_ID" --code "DEVICE_CODE" --api-base-url "http://localhost:3000/"
```

`connect` sends only the bounded protocol request to
`POST /api/v1/cli/connect`. It reads no repository or AI-session data. On
success, the CLI stores a short-lived grant in its private local state and
discards the device code and session ID.

### 4. Scan and upload with separate consent

Run the second dashboard command from the selected Git repository:

```powershell
buildstory scan-upload --repo . --consent local-scan --upload-consent local-dashboard
```

The scanner builds, canonicalizes, validates, and leak-checks the snapshot
locally. It then sends exactly those JSON bytes—no envelope—to the granted PUT
endpoint with:

- `Authorization: Bearer <one-use grant>`
- `Content-Type: application/json`
- `X-BuildStory-Schema-Version: 1.0.0`
- `X-BuildStory-Snapshot-Digest: sha256:...`

The web app recomputes the digest over the exact received bytes, enforces the
strict JSON Schema and a 1,000,000-byte limit, consumes the PUT permission, and
queues the report. A failed size, digest, or schema check does not consume a
valid grant, so the same canonical snapshot can be corrected and retried before
expiry.

### 5. Check report status

The dashboard polls its creator-owned status route automatically. The CLI can
also use the consumed bearer for read-only GETs until expiry:

```powershell
buildstory status
```

The status response contains only protocol state and `reportReady`. When ready,
the report response contains only a redacted summary and five aggregate counts.
The source snapshot is never returned through the CLI report endpoint.

Open the generated report from `/studio/connect`. Imported reports are
creator-only and remain unpublished until the creator explicitly selects public
fields and publishes.

## Loopback API contract

| Method and path | Credential | Purpose |
| --- | --- | --- |
| `POST /api/v1/cli/connect` | one-time device code in strict JSON | mint one short-lived upload grant |
| `PUT /api/v1/cli/upload-sessions/:id/snapshot` | Bearer grant | accept one strict `ProjectSnapshot` |
| `GET /api/v1/cli/upload-sessions/:id/status` | same consumed Bearer | read bounded generation status |
| `GET /api/v1/cli/reports/:reportId` | same consumed Bearer | read bounded safe report summary |

All four routes:

- are always unavailable in production builds and can also be disabled locally
  with `BUILDSTORY_LOCAL_API_ENABLED=false`;
- reject request hosts outside `localhost`, `127.0.0.0/8`, and `::1`;
- reject every browser origin except the exact loopback request origin and reject cross-site fetches;
- never read Auth.js cookies as scanner authorization;
- refuse redirects in the CLI, expose no token in URLs, and return `no-store`
  responses.

The bearer hash, never the raw bearer, is held by the in-memory server. One
successful PUT permanently disables another upload with that grant. Read-only
status/report access ends at the same expiry.

## Snapshot privacy boundary

The accepted schema is mirrored at
`lib/ingestion/project-snapshot.schema.json` and sets
`additionalProperties: false` at every object layer. It cannot represent source
or file bodies, diffs, patches, prompts, transcript bodies, assistant responses,
tool arguments/results, absolute paths, raw remotes, environment dumps, or
secret text. The route also rejects known raw-content field names before schema
validation and requires `redaction.finalLeakCheckPassed: true`.

Only the creator-owned report stores the accepted snapshot. A separate adapter
derives the report UI model. Published pages receive only
`publicBuildStoryFromSnapshot(...)`, based on explicitly selected fields; they
never receive the scanner snapshot, repository fingerprint, evidence digests,
or scan provenance.

## Actionable errors

- `local_api_disabled`: enable `BUILDSTORY_LOCAL_API_ENABLED=true` locally and
  restart the dev server.
- `loopback_required`: use the exact `http://localhost:PORT/`, `127.x.x.x`, or
  `::1` URL printed for the local app; remote hosts are intentionally refused.
- `connect_rejected`: copy the session ID and code again from the same fresh
  dashboard session, or create a new connection. The server intentionally does
  not distinguish an invalid, expired, used, or locked code to unauthenticated
  callers.
- `payload_too_large`: reduce the scanner time window; this development server
  grants at most 1 MB.
- `snapshot_digest_mismatch`: upload the exact canonical bytes whose digest was
  declared; do not reformat the JSON after hashing.
- `invalid_project_snapshot`: update the CLI/schema pair or remove the reported
  unsupported/raw field locally.
- `upload_token_used`: the snapshot was already accepted; run
  `buildstory status` instead of uploading again.
- `upload_token_expired`: create a fresh dashboard connection. Credentials and
  uploads are never silently retried.

## What this does not claim

This local workflow is deliberately development-only and uses disposable
process memory. Production uses D1-backed owner records and durable leased jobs,
but production scanner routes remain disabled: there is no public or remote
scanner endpoint, remote fallback, or hosted upload mode. See
`docs/production-runbook.md` for the separate hosted-reader/creator release
requirements.
