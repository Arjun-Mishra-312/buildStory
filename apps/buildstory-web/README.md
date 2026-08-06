# Buildstory web

Desktop-first Buildstory product for publishing sanitized stories about AI-assisted software work. The web app is a Next.js 16/Vinext application built for Cloudflare Sites and lives in the standalone Buildstory repository.

## Product surfaces

Anonymous readers can use `/`, `/about`, `/explore`, and published `/u/<handle>/<slug>` pages. `/p/orbit-notes` remains a legacy redirect to the seeded public example. Creator pages under `/studio/**` and creator APIs require a verified Google identity through Auth.js, or the explicit development-only fallback.

The scanner control and data plane is local-only:

- `POST /api/v1/cli/connect` exchanges one short-lived device code;
- one bearer grant permits exactly one validated snapshot `PUT`;
- the consumed bearer can read only bounded status/report summaries until expiry;
- every CLI route rejects non-loopback URLs, cross-origin browser calls, production runtimes, cookies as credentials, and redirects.

Only strict `ProjectSnapshot 1.0.0` JSON is accepted. Schema validation, forbidden-key traversal, byte limits, canonical digest verification, and a final secret scan run before storage. Public pages receive the explicit projection from `publicBuildStoryFromSnapshot`, never the private snapshot/report object.

## Local development

From the repository root:

```powershell
npm --prefix apps/buildstory-web ci
Copy-Item apps/buildstory-web/.env.example apps/buildstory-web/.env.local
npm run dev:buildstory
```

With no Google credentials, set these explicit local values:

```dotenv
BUILDSTORY_DEV_AUTH_BYPASS=true
BUILDSTORY_LOCAL_API_ENABLED=true
BUILDSTORY_STORE=memory
```

The fallback identity and loopback API are impossible to enable when `NODE_ENV=production`. Development memory is intentionally disposable and includes the seeded Orbit Notes report.

Build and install the co-located scanner separately:

```powershell
npm --prefix packages/buildstory-scanner ci
npm run build:scanner
npm install --global ./artifacts/buildstory-scanner-0.4.0.tgz
buildstory --version
```

The dashboard provides the exact `buildstory connect ... --api-base-url http://localhost:3000/` command. A scan/upload still requires both `--consent local-scan` and `--upload-consent local-dashboard`.

## Google/Auth.js

Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` together. Generate the secret with `npx auth secret`. Register exact Google OAuth callbacks:

- local: `http://localhost:3000/api/auth/callback/google`
- hosted: `https://YOUR_HOST/api/auth/callback/google`

JWT sessions expire after 12 hours. Only verified Google profiles are accepted. The Worker host allowlist runs before Auth.js, so `trustHost` cannot be used to admit an arbitrary forwarded host.

## Persistence and jobs

Development and tests use `lib/ingestion/mock-store.ts`. Production always selects `lib/ingestion/d1-store.ts`; setting `BUILDSTORY_STORE=memory` cannot make a production process use memory.

The D1 migration creates owner-keyed upload sessions, private reports, and durable report jobs. Snapshot acceptance transactionally:

1. verifies the unexpired bearer and strict redacted snapshot;
2. inserts the private report and pending job only if the grant is still unused;
3. consumes the grant and records its digest-bound receipt.

Jobs use a durable lease, idempotent status transitions, and at most three attempts. The current deterministic report adapter needs no external compute, so pending jobs are processed by bounded status/dashboard reads rather than an in-memory timer. No R2 binding is declared because Buildstory stores no file/blob uploads. Missing D1 bindings or migrations fail closed; `/api/ready` returns 503.

## Production configuration

`.env.production.example` lists every required name. Secret values belong in the Sites secret manager, never source control or build logs. Production requires:

- Cloudflare Sites/Vinext and the logical D1 binding `DB`;
- the committed Drizzle migration under `drizzle/`;
- Google OAuth credentials and a 32+ character Auth.js secret;
- an HTTPS `BUILDSTORY_PUBLIC_ORIGIN`;
- an exact comma-separated `BUILDSTORY_ALLOWED_HOSTS` allowlist;
- `BUILDSTORY_STORE=d1`, `BUILDSTORY_DEV_AUTH_BYPASS=false`, and `BUILDSTORY_LOCAL_API_ENABLED=false`.

The Worker adds a host gate, HSTS on HTTPS, CSP, clickjacking, MIME-sniffing, referrer, and permissions headers. Creator mutations require exact same-origin `Origin` headers and bounded JSON. No permissive CORS headers are emitted. Application logs contain fixed event names/status codes only—never request URLs, bodies, credentials, snapshot fields, or stack traces.

See [`docs/production-runbook.md`](docs/production-runbook.md) for local, staging, release, rollback, readiness, and incident procedures. No deployment or package publication is performed by this repository setup.

## Verification

```powershell
npm --prefix apps/buildstory-web run verify
npm --prefix packages/buildstory-scanner test
```

The web verification runs lint, strict TypeScript, a deployment build, rendered-route/privacy tests, and local API lifecycle tests. The scanner suite builds, tests privacy/redaction and loopback restrictions, packs into a clean prefix, verifies both `buildstory` and `story-scanner`, and exercises the one-PUT flow.

Contract details:

- [`docs/local-scanner-integration.md`](docs/local-scanner-integration.md)
- [`docs/access-and-scanner-handoff.md`](docs/access-and-scanner-handoff.md)
- [`lib/ingestion/project-snapshot.schema.json`](lib/ingestion/project-snapshot.schema.json)
- [`../../packages/buildstory-scanner/docs/privacy.md`](../../packages/buildstory-scanner/docs/privacy.md)
