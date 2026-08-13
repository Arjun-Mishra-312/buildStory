# Local package artifacts

`buildstory-scan-1.1.2.tgz` is the current packed archive built from
`packages/buildstory-scanner`. It is the same tarball `npm publish` uploads, so
installing it locally exercises the real published layout.

```powershell
npm install --global ./artifacts/buildstory-scan-1.1.2.tgz
buildstory-scan --version
```

SHA-256 for the committed archive:

```text
b5ecc406bcccf81520672e26b55fa97d73175fb147e936961f0c49e23f6901a2
```

Rebuild it with `npm run package:scanner`; update this checksum whenever package
inputs change. That command only packs - `npm publish` is a separate, deliberate
step. `npm run check:artifact` derives the expected filename from the package
manifest, so a version bump without a repack fails the check rather than
silently validating an older archive. It checks the embedded schema version
and that this README names the current archive; keeping the checksum itself
current is still a manual step every repack.

`1.1.2` raises Deep cloud/BYOK evidence from 240 to 400 excerpts (1,500 characters each, 700 KiB total unchanged). `PROJECT_SNAPSHOT_SCHEMA_VERSION` stays `1.7.0`; Local remains hardware-adaptive at 40/64/80 excerpts. Publish only after the hosted app is already accepting 400.

`1.1.1` is a version-sync release that adds progress reporting for local
narrative generation while keeping the `1.1.0` snapshot and story-pack
contracts unchanged.

`1.1.0` redesigns the generated report around deterministic, computed facts
instead of model-invented ones. Every story pack now carries a `signals`
array (session rhythm, tool usage, spend, output - see
`insights/signals.ts`), computed in code with no model call. Deep's
`decisionReview`/`risksAndEvidenceGaps`/`nextBuildActions` advice sections are
cut; `executiveSynthesis`/`engineeringPatterns`/`frictionAndRecovery` are
renamed to `openingLine`/`signatureMoves`/`whereItGotHard`, and a new
`byTheNumbers` section frames the most notable signals - every entry must
cite a real `signalId`, and validation rejects one that doesn't, the same way
an unknown `sourceRef` already gets rejected. `growthEdge.nextStep` is no
longer generated (kept optional on read for old stored packs).
`PROJECT_SNAPSHOT_SCHEMA_VERSION` stays `1.7.0`: the story-pack JSON Schema
was updated in place rather than versioned, since no scanner build has
shipped the old deep-analysis shape publicly.

`1.0.1` is a version-sync release only: `SCANNER_VERSION` and the package
manifest now agree at `1.0.1` with no schema or behavior change from `1.0.0`
(`PROJECT_SNAPSHOT_SCHEMA_VERSION` stays `1.7.0`). `1.0.0` is the public launch release. It makes Local evidence capacity hardware-adaptive without plan gating, raises Standard cloud/BYOK evidence to 80 excerpts/60,000 characters, and surfaces the separately queued AI narrative status through protocol 1.0 while keeping older status responses compatible. `0.9.3` fixes Deep evidence serialization: per-session selector quotas remain internal instead of leaking into the strict `narrativeEvidence.policy` wire object. `0.9.2` is the public-launch privacy hardening release. It fixes BYOK capability negotiation, adds a mandatory pre-provider review, prevents untrusted upload error bodies from reaching terminal output, expands quoted-secret/email/path/host redaction, caps standard evidence at 40 excerpts/20,000 characters and Deep at 240 excerpts/700 KiB, preserves validated V3 Deep reports through final sanitization, and makes retry behavior explicit. `0.9.1` was copy-only: it renamed every user-facing "cloud"/"cloud mode" mention
in CLI help text and confirmation prompts to "Buildstory Cloud", matching the
web app. No behavior change from `0.9.0`.

`0.9.0` adds bring-your-own-key (BYOK) narrative generation and fixes a real
privacy gap: the CLI previously let `--with-evidence` silently override a
local-mode dashboard connection into uploading excerpts, because
`effectiveNarrative()` decided the mode from the flag before ever reading the
stored grant. It now reads the grant first, so a mismatched flag is refused
(`NARRATIVE_MODE_CONFLICT`) instead of silently resolved. `0.8.0` remains here
for provenance only; `0.9.0` was the first version that closed that gap.

`0.7.0` was pulled from local distribution (never republished - npm does not
allow overwriting a published version): the CLI's "am I the entrypoint" check
compared `import.meta.url` against `process.argv[1]` without resolving
symlinks. npm's POSIX bin-linking installs a real symlink, and Linux's ESM
loader reports an entry module's `import.meta.url` as its REALPATH while
leaving `process.argv[1]` as the symlink path invoked - so the two never
matched, `runCli()` silently never ran, and every command exited 0 with zero
output. This affected every real Mac/Linux install of `buildstory-scan@0.7.0`,
not just CI; Windows was unaffected because npm links bin scripts there via
`.cmd`/`.ps1` wrappers instead of a symlink. Confirmed and fixed against a real
Linux container (`node:22-bookworm`), not just reasoned about.

The package publishes as `buildstory-scan` and installs a single binary of the
same name. The `buildstory-scanner-*.tgz` archives here predate two earlier
changes - the scoped `@buildstory/scanner` name and, before that, the retired
`buildstory` / `story-scanner` binary aliases. Keep them for provenance only;
do not hand them to creators.
