# Buildstory

Buildstory is a standalone product for publishing sanitized stories about AI-assisted software work. This repository contains both the desktop-first web application and the privacy-preserving local scanner; it has no runtime, build, or source dependency on the portfolio project.

## Repository layout

- `apps/buildstory-web` — Next.js 16/Vinext web app, Auth.js integration, strict local scanner API, D1 schema and migration, Cloudflare Sites configuration, tests, and operations documentation.
- `packages/buildstory-scanner` — read-only local CLI package exposing both `buildstory` and the compatible `story-scanner` alias.
- `artifacts/` — packed scanner archives for local install and release verification. `npm run package:scanner` writes the current one; `npm run check:artifact` asserts the newest matches the source schema.

This is an npm workspace: one root lockfile covers both `apps/buildstory-web` and `packages/buildstory-scanner`, installed together from the repository root. Use Node.js 22.13 or newer for the complete product workspace.

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
npm run package:scanner
```

`verify:product` runs the web lint, typecheck, build, rendered-route/security tests, and the scanner build/privacy/package/CLI tests. `package:scanner` writes a packed archive to `artifacts`; it does not publish to npm. The scanner publishes as `buildstory-scan` and installs one binary of the same name.

Narrative generation is local-first. A new dashboard connection defaults to local Ollama generation: redacted excerpts may be used in memory to write the report, but the uploaded snapshot carries only the generated prose and deterministic metrics. Cloud narrative mode is an explicit dashboard choice and requires reviewing the redacted excerpts before they are uploaded. Off mode uploads metrics/profile facts without prose. No mode uses non-loopback network access during scanning except the single explicitly pinned upload origin.

## Production configuration

Buildstory deploys from `apps/buildstory-web`, not the repository root. Production configuration, the D1 migration, readiness checks, security constraints, staging/release procedures, and rollback guidance are documented in [`apps/buildstory-web/docs/production-runbook.md`](apps/buildstory-web/docs/production-runbook.md). No repository command deploys or publishes the product.
