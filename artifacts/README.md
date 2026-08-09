# Local package artifacts

`buildstory-scan-0.9.1.tgz` is the current packed archive built from
`packages/buildstory-scanner`. It is the same tarball `npm publish` uploads, so
installing it locally exercises the real published layout.

```powershell
npm install --global ./artifacts/buildstory-scan-0.9.1.tgz
buildstory-scan --version
```

SHA-256 for the committed archive:

```text
be5c9cef70dd4c5020bb9f5bf0482f3ae53f67d70e18ecb19d54c753085d3dc9
```

Rebuild it with `npm run package:scanner`; update this checksum whenever package
inputs change. That command only packs - `npm publish` is a separate, deliberate
step. `npm run check:artifact` derives the expected filename from the package
manifest, so a version bump without a repack fails the check rather than
silently validating an older archive. It checks the embedded schema version
and that this README names the current archive; keeping the checksum itself
current is still a manual step every repack.

`0.9.1` is copy-only: renames every user-facing "cloud"/"cloud mode" mention
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
