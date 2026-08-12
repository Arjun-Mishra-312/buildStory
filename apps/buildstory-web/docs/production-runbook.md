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
4. Build/install the CLI from `packages/buildstory-scanner`, the newest archive in `artifacts/`, or `npm install --global buildstory-scan`.
5. In `/studio/connect`, create a session and run the displayed connect command. From the chosen Git worktree run:

   ```powershell
   buildstory-scan scan-upload --repo . --consent local-scan --upload-consent local-dashboard
   buildstory-scan status
   ```

6. Stop the local server when finished. Memory-mode records are intentionally disposable.

## Staging

1. Use a dedicated Cloudflare Worker, D1 database, Google OAuth client, hostname, and secrets. Never reuse production D1 for staging.
2. Configure all names from `.env.production.example`; use the staging HTTPS origin and exact staging host allowlist.
3. Generate and inspect schema changes with `npm run db:generate`. Commit both SQL and Drizzle metadata. The release workflow applies migrations from `drizzle/` before deploying the Worker.
4. Run `npm run build:production` in an environment containing the required names, then `npm run verify`.
5. Deploy a Worker release only through the approved release process. This repository consolidation does not deploy.
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
   - **Secrets** are never committed, and **cannot be set until the Worker
     exists** — `wrangler secret put` fails with "Worker not found" against a
     name that has never been deployed. On a brand-new environment the order is
     therefore migrate → deploy → set secrets → verify, not secrets-first:

     ```powershell
     npx wrangler secret put AUTH_SECRET -c wrangler.deploy.jsonc
     npx wrangler secret put AUTH_GOOGLE_ID -c wrangler.deploy.jsonc
     npx wrangler secret put AUTH_GOOGLE_SECRET -c wrangler.deploy.jsonc
     ```

     Between the deploy and these commands the Worker is live but unauthenticated:
     public pages render, sign-in fails, and `/api/ready` returns 503 for the
     missing `AUTH_SECRET`. Secrets apply to the running Worker immediately, with
     no redeploy. To avoid any public window, deploy once with `routes` removed,
     set the secrets, then restore `routes` and deploy again.

     `wrangler secret put` reads the value from stdin, so it never lands in shell
     history. `prepare-deploy-config.ts` throws if any secret name appears in
     `vars`. Never place secret values in `.env.production.example`, Git, command
     history, or CI output.
3. Ensure `BUILDSTORY_STORE=d1`, `BUILDSTORY_DEV_AUTH_BYPASS=false`, and `BUILDSTORY_LOCAL_API_ENABLED=false` in `vars`.
4. Apply forward-compatible migrations before routing traffic to code that needs them. This UI release adds no D1 migration: it only changes presentation. The production migration ledger was read-only verified on 2026-08-12 and contains `0000` through `0026`; the checked-in journal retains the two story-deck migrations that are already present remotely. Validate the set with `npm run migrate:d1:dry-run`. For a future SQL migration, invoke the custom runner directly as `npx tsx scripts/migrate-d1.ts --config=wrangler.deploy.jsonc` after reviewing the remote ledger; do not pass `--baseline` to the current production database. Keep the previous application version available until readiness and public-route smoke tests pass.
5. Configure edge rate limits for Auth.js, creator mutation paths, and `/api/v1/cli/*` (now reachable in production). Do not add CORS allowances for CLI routes.
6. Deploy only with explicit user/release approval. After deployment, verify health, readiness, Google callback, owner isolation, edit/publish, and a sanitized public projection.
7. **First launch only — promote the operator to admin.** Every account is created with `role = 'member'`, and every self-service role route (`/studio/admin`, `PATCH /api/admin/users/[handle]/role`) requires an existing admin to call it - so without this step nobody can ever reach `/studio/moderation`, `/studio/admin`, or action a filed content report. Set the bootstrap secret, then call the bootstrap-only route once after the operator has signed in for the first time (so their `buildstory_users` row exists):

   ```powershell
   npx wrangler secret put BUILDSTORY_ADMIN_SECRET -c wrangler.deploy.jsonc
   ```

   ```powershell
   curl -X POST https://buildstory.dev/api/internal/users/role `
     -H "authorization: Bearer <the secret you just set>" `
     -H "content-type: application/json" `
     -d "{\"handle\": \"<operator-handle>\", \"role\": \"admin\"}"
   ```

   Replace `<operator-handle>` with the operator's own Buildstory handle. From then on, manage additional moderators/admins from `/studio/admin` while signed in as that admin - the bootstrap route stays available (it's cheap to leave configured; delete the secret with `wrangler secret delete BUILDSTORY_ADMIN_SECRET` if you'd rather close it after the first promotion).

## Enable Buildstory Cloud (optional, subsidized narrative path)

Local and BYOK narrative modes need nothing from the operator — they call Ollama or the creator's own key, respectively, and work on day one. The subsidized **Buildstory Cloud** mode is different: it calls a provider using an API key *you* pay for, on the creator's behalf, budgeted per-user by `buildstory_llm_budgets`. Until you do this, `narrativeProviderConfigured("cloud")` is false, `cloudNarrativeAvailable()` is false for every account, and the Buildstory Cloud option simply doesn't appear in the dashboard — that's a safe default, not a bug to fix before launch.

`BUILDSTORY_CLOUD_PROVIDER=openrouter`, `BUILDSTORY_LLM_BASE_URL=https://openrouter.ai/api/v1`, and `BUILDSTORY_LLM_MODEL=deepseek/deepseek-v4-flash` are committed in `wrangler.deploy.jsonc`; they are non-secret and inert until the key is set. Hosted requests require a ZDR-eligible endpoint, deny data collection, require parameter support, and permit fallback only among compliant downstream endpoints for the same model. The key must never be committed:

```powershell
npx wrangler queues create buildstory-narratives
npx wrangler queues create buildstory-narratives-dlq
npx wrangler secret put BUILDSTORY_OPENROUTER_API_KEY -c wrangler.deploy.jsonc
```

Before enabling traffic, disable OpenRouter prompt logging and input/output sharing, enable ZDR for the non-frontier model group, and confirm `/api/ready` reports `openRouterZdrModel: true`. A missing eligible DeepSeek endpoint keeps Cloud hidden and readiness failed.

This prompts on stdin (nothing lands in shell history) and applies to the running Worker immediately, no redeploy needed. As soon as it's set, Buildstory Cloud appears in the dashboard for every account — there's no separate feature flag beyond the key's presence, and no `--dry-run` for a secret write, so double-check the key belongs to the account you intend to bill.

The production hosted path is OpenRouter-only; the retained OpenAI adapter is inert unless an operator explicitly enables it for future non-public use. Arbitrary OpenAI-compatible hosts are rejected. Standard evidence is capped at 80 excerpts/800 characters each/60,000 characters total; deep evidence is capped at 240 excerpts/1,500 characters each/700 KiB total and is dynamically reduced to keep the complete snapshot below its upload grant. Each hosted deep report uses an analysis request and a synthesis request, each with at most one bounded schema-repair request; raw excerpts are omitted from synthesis. The analysis map and publishable narrative are validated independently, then composed into StoryPackV3 inside the Worker so synthesis cannot weaken or corrupt the private analysis by regenerating it. Terminal schema failures retain only content-free validation stage/path/rule codes in `sections_json`; model output and source identifiers are never stored as diagnostics.

To turn Buildstory Cloud back off later (e.g. cost control), delete the secret rather than editing code:

```powershell
npx wrangler secret delete BUILDSTORY_OPENROUTER_API_KEY -c wrangler.deploy.jsonc
```

## Enable automated image moderation (required before allowing report media uploads)

Report cover/screenshot images (`POST /api/creator/reports/[reportId]/media`) are the only user-uploaded images on the platform. They are scanned with OpenAI's free `omni-moderation-latest` endpoint synchronously, before the bytes ever reach R2 - there is no async review queue for images, so this check **fails closed**: without `BUILDSTORY_MODERATION_API_KEY` configured, every media upload is rejected with `503 moderation_unavailable` rather than being stored unreviewed.

```powershell
npx wrangler secret put BUILDSTORY_MODERATION_API_KEY -c wrangler.deploy.jsonc
```

The key is a standard OpenAI API key (`https://platform.openai.com/api-keys`); the moderation endpoint itself is free to call. This is intentionally a separate key from `BUILDSTORY_OPENROUTER_API_KEY` (narrative generation) - it is billed and rate-limited independently, and rotating one never affects the other. After setting it, confirm with a real upload from `/studio/connect` that both a normal image succeeds and (optionally) that the endpoint responds `422 image_flagged` for content that should be blocked.

A flagged upload is rejected outright; nothing lands in R2 or `buildstory_report_media`. The moderator queue (`/studio/moderation`) remains the review path for content that gets past this check or is flagged after the fact by another user (via "Report").

## Enable Stripe billing (optional, Pro subscriptions)

Until this is configured, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are unset, and `/api/creator/billing/checkout`, `/api/creator/billing/portal`, and `/api/webhooks/stripe` all respond `503 billing_unavailable` rather than crash - the Billing section on `/studio/settings` still renders, it just can't start a real checkout. That's a safe default, not a bug to fix before launch, same as Buildstory Cloud above.

This step is entirely manual in the Stripe Dashboard - there is no CLI/API step to script here:

1. Create a "Buildstory Pro" product.
2. Create two recurring Prices on it: a monthly price and an annual price (with whatever discount you want against 12x the monthly price). Copy both Price IDs (`price_...`).
3. Create a webhook endpoint at `https://buildstory.dev/api/webhooks/stripe`, subscribed to `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy its signing secret (`whsec_...`).
4. Set the two secrets and two price IDs on the Worker:

   ```powershell
   npx wrangler secret put STRIPE_SECRET_KEY -c wrangler.deploy.jsonc
   npx wrangler secret put STRIPE_WEBHOOK_SECRET -c wrangler.deploy.jsonc
   npx wrangler secret put STRIPE_PRICE_ID_MONTHLY -c wrangler.deploy.jsonc
   npx wrangler secret put STRIPE_PRICE_ID_ANNUAL -c wrangler.deploy.jsonc
   ```

   Price IDs aren't sensitive, but `wrangler secret put` is the simplest way to set all four without a redeploy - each prompts on stdin and applies immediately.
5. Start in Stripe **test mode** (test secret key, test webhook endpoint, test prices) and run a full checkout with card `4242 4242 4242 4242` via `stripe listen --forward-to https://buildstory.dev/api/webhooks/stripe` (or against local dev) before switching any of the four values to live mode.

`buildstory_users.plan` becomes the real subscription plan the moment a webhook lands - it is independent of `BUILDSTORY_LAUNCH_PRO_FOR_ALL` (see `lib/narrative/entitlement.ts`), which can stay on or be turned off separately whenever the launch promotion is meant to end.

For a time-boxed launch promotion (e.g. "everyone gets Pro for the first week"), set `BUILDSTORY_LAUNCH_PRO_PROMOTION_ENDS_AT` in `wrangler.deploy.jsonc`'s `vars` block to the exact ISO 8601 moment it should end, alongside `BUILDSTORY_LAUNCH_PRO_FOR_ALL: "true"`, then deploy once:

```jsonc
"BUILDSTORY_LAUNCH_PRO_FOR_ALL": "true",
"BUILDSTORY_LAUNCH_PRO_PROMOTION_ENDS_AT": "2026-08-17T00:00:00.000Z"
```

The promotion then turns itself off at that instant with no further action - `effectivePlan()` re-checks the clock on every request, not just at deploy time. Accounts that paid for real during the promotion keep Pro afterward regardless (their `plan` column is durable and untouched by this). To go back to an indefinite promotion, remove `BUILDSTORY_LAUNCH_PRO_PROMOTION_ENDS_AT` (or leave it unset) and redeploy.

## Health and readiness

- `/api/health` proves only that the Worker can answer requests. It never checks dependencies and returns no configuration.
- `/api/ready` validates required production variable names and confirms the migrated D1 schema. It returns 503 without secrets when configuration, binding, or schema is missing.
- Remove an instance/version from traffic on readiness failure. Do not fall back to process memory.

## Jobs and failure recovery

Report generation is message-driven through Cloudflare Queues. Messages contain only `narrativeId`; the consumer uses batch size 1, concurrency 3, a 12-minute atomic D1 lease, three retries at 60-second intervals, and `buildstory-narratives-dlq`. The five-minute sweep re-enqueues pending/stale work and finalizes evidence older than two hours. Report pages poll status and never invoke inference. Terminal updates scrub excerpt text and preserve only the evidence receipt.

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

Roll back the application version through the Cloudflare Worker deployment. Prefer additive, backward-compatible D1 migrations; do not run destructive down migrations during an incident. Restore D1 from the provider's approved backup/time-travel workflow only after recording the recovery point and impact. Validate `/api/ready`, ownership checks, and public projection behavior before reopening traffic.
