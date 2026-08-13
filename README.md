# Buildstory

Buildstory turns AI-assisted software work into an evidence-backed build story.

- The **report engine** is open source: [`buildstory-scan`](https://github.com/Arjun-Mishra-312/buildstory-scan). You can inspect how a repository is processed, or generate a report on your own machine with no account.
- This repository is the **hosted product**: authentication, the interactive report UI, publishing, profiles, and discovery.

```powershell
npx buildstory-scan generate --repo . --consent local-scan
```

## This workspace

- `apps/buildstory-web` — Next.js / Vinext web app (closed source)
- The scanner package is developed in the public `buildstory-scan` repository and consumed here as a dependency

## Local setup

```powershell
npm ci
Copy-Item apps/buildstory-web/.env.example apps/buildstory-web/.env.local
npm run dev:buildstory
```

The development-only authentication fallback and loopback scanner API must be explicitly enabled in `.env.local`; see [`apps/buildstory-web/README.md`](apps/buildstory-web/README.md) for the required values and local scanner flow.

## Useful commands

```powershell
npm run verify:product
npm run build:buildstory
```

`verify:product` runs the web lint, typecheck, build, and rendered-route/security tests. The scanner is developed and published from [`buildstory-scan`](https://github.com/Arjun-Mishra-312/buildstory-scan).

Narrative generation is local-first. A new dashboard connection defaults to local Ollama generation: redacted excerpts may be used in memory to write the report, but the uploaded snapshot carries only the generated prose and deterministic metrics. Cloud narrative mode is an explicit dashboard choice and requires reviewing the redacted excerpts before they are uploaded. Off mode uploads metrics/profile facts without prose. No mode uses non-loopback network access during scanning except the single explicitly pinned upload origin.

## Production configuration

Buildstory deploys from `apps/buildstory-web`, not the repository root. Production configuration, the D1 migration, readiness checks, security constraints, staging/release procedures, and rollback guidance are documented in [`apps/buildstory-web/docs/production-runbook.md`](apps/buildstory-web/docs/production-runbook.md). No repository command deploys or publishes the product.
