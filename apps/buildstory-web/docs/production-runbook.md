# Buildstory operations runbook

## Architecture and required providers

The repository root orchestrates the complete Buildstory product. The web application's deploy root is `apps/buildstory-web`; the scanner remains a separate local package and is never deployed with the web app.

Hosted Buildstory runs as a single Cloudflare Worker (the committed Vinext
Worker) with static assets, one D1 binding named `DB`, and one R2 binding named
`MEDIA`. D1 stores structured sessions, strict redacted snapshots, reports,
publication state, durable job leases, and the fixed-window rate-limit table. R2
holds only creator-uploaded artifact media (report cover images and
screenshots); no snapshot blobs or raw files are accepted. Cron Triggers drive
leaderboard recomputation, lease recovery, and session expiry — the Worker's
`scheduled()` handler is the only thing that does, so the triggers are not
optional. Google OAuth through Auth.js is the primary hosted creator identity
provider, with GitHub available as an optional second provider when both
`AUTH_GITHUB_*` values are set.

The scanner accepts a hosted ingestion destination only when explicitly pinned per connection (`buildstory-scan connect --remote`, or `--api-base-url <https-url> --allow-host <hostname>` for a non-default deployment); it refuses every other, unconfirmed, or non-HTTPS remote host. Production `/api/v1/cli/*` routes accept requests only on the deployment's configured `BUILDSTORY_PUBLIC_ORIGIN`: they return 503 if that origin is unset or invalid, and 403 for any other host.

## Local

1. Install the workspace from the repository root (one lockfile covers both projects):

   ```powershell
   npm ci
   ```

2. Copy `apps/buildstory-web/.env.example` to `.env.local`. For the documented fallback, set `BUILDSTORY_DEV_AUTH_BYPASS=true`, `BUILDSTORY_LOCAL_API_ENABLED=true`, and `BUILDSTORY_STORE=memory`.
3. Start the web app with `npm run dev:buildstory` and open `http://localhost:3000`.
4. Build/install the CLI from `packages/buildstory-scanner`, the newest archive in `artifacts/`, or `npm install --global @buildstory/scanner`.
5. In `/studio/connect`, create a session and run the displayed connect command. From the chosen Git worktree run:

   ```powershell
   buildstory-scan scan-upload --repo . --consent local-scan --upload-consent local-dashboard
   buildstory-scan status
   ```

6. Stop the local server when finished. Memory-mode records are intentionally disposable.

## Staging

1. Use a dedicated Sites project, D1 database, Google OAuth client, hostname, and secrets. Never reuse production D1 for staging.
2. Configure all names from `.env.production.example`; use the staging HTTPS origin and exact staging host allowlist.
3. Generate and inspect schema changes with `npm run db:generate`. Commit both SQL and Drizzle metadata. The Sites build copies migrations to `dist/.openai/drizzle`.
4. Run `npm run build:production` in an environment containing the required names, then `npm run verify`.
5. Save/deploy a Sites version only through the approved release process. This repository consolidation does not deploy.
6. Confirm `GET /api/health` is 200 and `GET /api/ready` is 200 after bindings/migrations are active. Confirm an unknown host is rejected, anonymous public routes render, and creator routes require Google.
7. Exercise the full CLI flow against staging's own origin: `buildstory-scan connect <session> --code <code> --api-base-url https://<staging-host>/ --allow-host <staging-host>`, then `scan-upload` and `status`. Confirm the same flow against a *different* host (e.g. production's origin, or an unrelated one) is refused - a required security result.

## Production release

1. Review the diff, migration, dependency audit, privacy tests, and deployment artifact.
2. Configuration reaches the Worker by two separate paths, and the split is enforced:
   - **Non-secret values** live in `vars` in `wrangler.deploy.jsonc`, committed.
     `prepare-deploy-config.ts` copies that block into `dist/server/wrangler.json`
     and fails the build if any required name is missing. Without it the Worker
     answers `503 host_allowlist_unconfigured` on every request, because
     `worker/index.ts` reads `BUILDSTORY_ALLOWED_HOSTS` before routing anything.
   - **Secrets** are never committed. Set each once per environment:

     ```powershell
     npx wrangler secret put AUTH_SECRET -c wrangler.deploy.jsonc
     npx wrangler secret put AUTH_GOOGLE_ID -c wrangler.deploy.jsonc
     npx wrangler secret put AUTH_GOOGLE_SECRET -c wrangler.deploy.jsonc
     ```

     `wrangler secret put` reads the value from stdin, so it never lands in shell
     history. `prepare-deploy-config.ts` throws if any secret name appears in
     `vars`. Never place secret values in `.env.production.example`, Git, command
     history, or CI output.
3. Ensure `BUILDSTORY_STORE=d1`, `BUILDSTORY_DEV_AUTH_BYPASS=false`, and `BUILDSTORY_LOCAL_API_ENABLED=false` in `vars`.
4. Apply forward-compatible migrations before routing traffic to code that needs them. Keep the previous application version available until readiness and public-route smoke tests pass.
5. Configure edge rate limits for Auth.js, creator mutation paths, and `/api/v1/cli/*` (now reachable in production). Do not add CORS allowances for CLI routes.
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
4. Disable `/api/v1/cli/*` ingestion at the edge/access layer for the duration. Never point creators at an ad hoc or unvetted endpoint as a workaround - only the deployment's own configured `BUILDSTORY_PUBLIC_ORIGIN` is ever an acceptable CLI destination.
5. Verify public pages contain only `publicBuildStoryFromSnapshot` output before restoring traffic.

## Rollback and backup

Roll back the application version through Sites. Prefer additive, backward-compatible D1 migrations; do not run destructive down migrations during an incident. Restore D1 from the provider's approved backup/time-travel workflow only after recording the recovery point and impact. Validate `/api/ready`, ownership checks, and public projection behavior before reopening traffic.
