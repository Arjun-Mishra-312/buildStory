# Buildstory operations runbook

## Architecture and required providers

The repository root orchestrates the complete Buildstory product. The web application's deploy root is `apps/buildstory-web`; the scanner remains a separate local package and is never deployed with the web app.

Hosted Buildstory requires Cloudflare Sites with the committed Vinext Worker and one D1 binding named `DB`. D1 stores structured sessions, strict redacted snapshots, reports, publication state, and durable job leases. R2 is deliberately `null`: the product accepts no blobs or raw files. Google OAuth through Auth.js is the only hosted creator identity provider.

The scanner is not a hosted ingestion client. It refuses every non-loopback destination, and production builds return 404 for scanner APIs. Run the complete scanner workflow only against an explicitly started local development app.

## Local

1. Install each independent project:

   ```powershell
   npm --prefix apps/buildstory-web ci
   npm --prefix packages/buildstory-scanner ci
   ```

2. Copy `apps/buildstory-web/.env.example` to `.env.local`. For the documented fallback, set `BUILDSTORY_DEV_AUTH_BYPASS=true`, `BUILDSTORY_LOCAL_API_ENABLED=true`, and `BUILDSTORY_STORE=memory`.
3. Start the web app with `npm run dev:buildstory` and open `http://localhost:3000`.
4. Build/install the CLI from `packages/buildstory-scanner` or `artifacts/buildstory-scanner-0.3.0.tgz`.
5. In `/dashboard/connect`, create a session and run the displayed connect command. From the chosen Git worktree run:

   ```powershell
   buildstory scan-upload --repo . --consent local-scan --upload-consent local-dashboard
   buildstory status
   ```

6. Stop the local server when finished. Memory-mode records are intentionally disposable.

## Staging

1. Use a dedicated Sites project, D1 database, Google OAuth client, hostname, and secrets. Never reuse production D1 for staging.
2. Configure all names from `.env.production.example`; use the staging HTTPS origin and exact staging host allowlist.
3. Generate and inspect schema changes with `npm run db:generate`. Commit both SQL and Drizzle metadata. The Sites build copies migrations to `dist/.openai/drizzle`.
4. Run `npm run build:production` in an environment containing the required names, then `npm run verify`.
5. Save/deploy a Sites version only through the approved release process. This repository consolidation does not deploy.
6. Confirm `GET /api/health` is 200 and `GET /api/ready` is 200 after bindings/migrations are active. Confirm an unknown host is rejected, anonymous public routes render, creator routes require Google, and scanner routes are unavailable.
7. Exercise the CLI flow locally, not against staging. Its refusal of the staging URL is a required security result.

## Production release

1. Review the diff, migration, dependency audit, privacy tests, and deployment artifact.
2. Store `AUTH_SECRET` and `AUTH_GOOGLE_SECRET` as hosted secrets. Store non-secret runtime configuration as Sites values. Never place secret values in `.env.production.example`, Git, command history, or CI output.
3. Ensure `BUILDSTORY_STORE=d1`, `BUILDSTORY_DEV_AUTH_BYPASS=false`, and `BUILDSTORY_LOCAL_API_ENABLED=false`.
4. Apply forward-compatible migrations before routing traffic to code that needs them. Keep the previous application version available until readiness and public-route smoke tests pass.
5. Configure edge rate limits for Auth.js and creator mutation paths. Do not add CORS allowances for CLI routes.
6. Deploy only with explicit user/release approval. After deployment, verify health, readiness, Google callback, owner isolation, edit/publish, and a sanitized public projection.

## Health and readiness

- `/api/health` proves only that the Worker can answer requests. It never checks dependencies and returns no configuration.
- `/api/ready` validates required production variable names and confirms the migrated D1 schema. It returns 503 without secrets when configuration, binding, or schema is missing.
- Remove an instance/version from traffic on readiness failure. Do not fall back to process memory.

## Jobs and failure recovery

Report generation is deterministic and bounded. D1 is the durable queue: pending jobs are claimed with a 30-second lease, status transitions are idempotent, and failures retry at most three times with content-free error codes. A terminal failure marks both report and session failed. There is no background retry of uploads and no second use of a consumed grant.

For stuck jobs, inspect counts/status/timestamps only. Never print `snapshot_json`, `source_snapshot_json`, bearer hashes, device-code hashes, or user-provided strings into tickets or logs. Resolve the underlying provider problem, then use an audited maintenance procedure to move an eligible content-free job state back to `pending`; do not edit snapshot content.

## Logging and incidents

Runtime logs are structured JSON with timestamp, level, service, fixed event, code, and status. They intentionally omit URLs, hosts, creator identity, bodies, cookies, OAuth values, device codes, tokens, snapshots, report text, paths, and stack traces. Route responses expose stable error codes and generic messages.

During an auth or data incident:

1. Restrict traffic at the hosting access/edge layer; do not enable a weaker fallback.
2. Rotate Auth.js/Google secrets and revoke affected OAuth credentials.
3. Preserve D1 backups and content-free audit evidence according to the operator's retention policy.
4. Keep scanner routes disabled. A remote URL must never be offered as a workaround.
5. Verify public pages contain only `publicBuildStoryFromSnapshot` output before restoring traffic.

## Rollback and backup

Roll back the application version through Sites. Prefer additive, backward-compatible D1 migrations; do not run destructive down migrations during an incident. Restore D1 from the provider's approved backup/time-travel workflow only after recording the recovery point and impact. Validate `/api/ready`, ownership checks, and public projection behavior before reopening traffic.
