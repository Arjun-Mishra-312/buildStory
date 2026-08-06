# Access, scanner handoff, and publication model

## Product access model

Buildstory is public by default for readers and private by default for creators.

| Surface | Identity | Data allowed |
| --- | --- | --- |
| Landing, Explore, published project URL | None | Explicit public projection only |
| Creator dashboard and creator APIs | Auth.js Google session | Records owned by the signed-in creator |
| Loopback connect endpoint | One device code | Permission to mint one scoped upload bearer |
| Loopback snapshot endpoint | Short-lived bearer | One validated `ProjectSnapshot 1.0.0` upload |
| Loopback status/report endpoints | Same consumed bearer until expiry | Bounded lifecycle and safe aggregate report only |
| Generation worker | Internal job identity in production | Accepted redacted snapshot and derived report |

The local CLI and web app interoperate over an explicit loopback API. Local
development uses disposable process memory; production automatically selects
owner-keyed D1 records plus leased durable report jobs and fails closed without
the binding or migration. The scanner remains a separate local package.

## Complete end-user flow

1. A reader can browse the landing page, Explore, and any published
   `/u/<handle>/<slug>` URL without an account. Older `/p/:slug` links remain
   valid as redirects.
2. A creator opens `/signin` and authenticates with Google through Auth.js.
3. The creator opens **Connect scanner**. The server creates a 15-minute upload
   session bound to that creator and returns a human-readable device code.
4. The creator runs `buildstory connect ... --api-base-url
   http://localhost:PORT/`. Connect reads no repository and posts only the
   strict device request to `/api/v1/cli/connect` without cookies.
5. The scanner receives and privately stores a bearer valid for ten minutes and
   one successful PUT. The creator separately runs `buildstory scan-upload
   --repo . --consent local-scan --upload-consent local-dashboard`.
6. The scanner produces a redacted `ProjectSnapshot 1.0.0` locally and uploads
   the exact canonical JSON bytes with their digest. The server stores only the
   token hash, rechecks the digest, strict schema, forbidden-field policy, and
   1 MB limit, consumes PUT permission, and queues report generation.
7. The authenticated dashboard polls the owner-scoped session endpoint. State
   advances through `queued`, `generating`, and `report_ready`.
8. The creator reviews the private report, rewrites editorial text, and selects
   individual public fields. The snapshot, raw sessions, private repository
   path, and scan provenance are not passed to the public page.
9. Publish creates a public projection at `/u/<handle>/<slug>`. Readers do not
   need to sign in; the legacy `/p/:slug` form remains available as a redirect.

## API lifecycle

### Browser / creator APIs

All endpoints call the server-side creator-session boundary and return `401`
when it is absent.

- `POST /api/creator/upload-sessions` creates an owner-bound session and device
  authorization.
- `GET /api/creator/upload-sessions` lists only the creator's sessions.
- `GET /api/creator/upload-sessions/:id` is the dashboard polling endpoint.
- `GET /api/creator/reports/:id` returns only the creator's private report.
- `PATCH /api/creator/reports/:id` saves editorial changes and selected public
  fields.
- `POST /api/creator/reports/:id/publish` changes publication state and returns
  the public URL.

### Loopback scanner APIs

These routes intentionally never call the browser-session helper. They also
require a loopback request host and reject remote browser origins.

- `POST /api/v1/cli/connect` validates protocol 1.0 and exchanges the device code
  for a one-PUT upload grant.
- `PUT /api/v1/cli/upload-sessions/:id/snapshot` requires
  `Authorization: Bearer …`, JSON, schema and digest headers, enforces a 1 MB
  limit, validates the strict scanner schema, and consumes upload permission.
- `GET /api/v1/cli/upload-sessions/:id/status` uses the same bearer for a strict
  content-free status response until expiry.
- `GET /api/v1/cli/reports/:id` uses that bearer for a strict safe aggregate
  summary only; it never returns the source snapshot.

The raw bearer is returned only to the CLI in the connect response. It is never
returned to the browser dashboard, placed in a URL, or included in status
payloads. The server retains only its hash.

## Exact trust and privacy boundary

### Stays on the creator's machine

- repository contents and untracked files;
- environment files and secrets removed by the scanner;
- raw AI conversations when the scanner policy summarizes rather than copies;
- browser cookies and the creator's Google session.

### Crosses the scanner boundary

- one redacted, versioned `ProjectSnapshot` JSON document;
- the minimum scan provenance needed to identify scanner version, scope,
  consent policy, and snapshot hash;
- a short-lived, one-use upload bearer sent only over the scanner API request.

### Stays private on the web service

- the accepted snapshot;
- session summaries, private repository metadata, full redaction notes, and
  scan provenance;
- generated report drafts and publication selections.

### Becomes universally public

Only fields copied by `publicBuildStoryFromSnapshot`, based on the creator's
explicit selection. Public pages receive a sanitized view model—not the source
snapshot—so private fields are absent from server-rendered data and client
payloads rather than merely hidden with CSS.

## Local authentication modes

### Disabled (default without environment variables)

Public routes render normally. `/signin` displays setup guidance. Creator pages
redirect to sign-in, and creator APIs return `401`.

### Explicit development identity

Set `BUILDSTORY_DEV_AUTH_BYPASS=true` in `.env.local`. The bypass works only
outside production and supplies the seeded Mina Park creator fixture. It is for
local UI and API development, not authentication testing.

Set `BUILDSTORY_LOCAL_API_ENABLED=true` for the CLI integration. This does not
make remote requests acceptable: each route separately enforces a localhost,
127/8, or ::1 request URL. Production builds disable these routes regardless of
the environment value; keep it false in production hosting as defense in depth.

### Google OAuth

Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`. Google mode takes
precedence over the development bypass. Auth.js uses a 12-hour JWT session and
accepts only a verified Google email. Provider access and refresh tokens are not
copied into the application session.

Google web client callback URLs must match exactly:

- `http://localhost:3000/api/auth/callback/google`
- `https://YOUR_DOMAIN/api/auth/callback/google`

Production Google OAuth requires a verified domain, HTTPS, an accurate consent
screen, and public privacy/home-page information. Review Google's current
[OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies)
before launch.

## Production deployment boundary

No deployment is performed as part of this change. The code now includes the
production D1 schema/migration, atomic one-use grant consumption, leased durable
jobs with bounded retries, persistent ownership checks, partial unique published
slugs, same-origin creator-write protection, strict host handling, readiness,
security headers, and content-free structured error logging.

Operators must still complete the release-specific work in
`docs/production-runbook.md`: provision Sites/D1, apply migrations, store Auth.js
and Google credentials in the hosted secret manager, register the exact HTTPS
callback, configure the host allowlist and edge rate limits, establish backup
and retention policy, complete privacy/terms/deletion processes, and obtain
explicit deployment approval. Missing production configuration or D1 state
returns readiness failure; it never falls back to memory.
