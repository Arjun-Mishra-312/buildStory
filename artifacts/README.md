# Local package artifacts

`buildstory-scanner-0.7.0.tgz` is the current packed archive built from
`packages/buildstory-scanner`. It is the same tarball `npm publish` uploads, so
installing it locally exercises the real published layout.

```powershell
npm install --global ./artifacts/buildstory-scanner-0.7.0.tgz
buildstory-scan --version
```

SHA-256 for the committed archive:

```text
0c5d080728d7b4af25f466fcf0c35e0384725bf9f501884235948fc552c321b6
```

Rebuild it with `npm run package:scanner`; update this checksum whenever package
inputs change. That command only packs - `npm publish` is a separate, deliberate
step.

The package publishes as `@buildstory/scanner` and installs a single binary,
`buildstory-scan`. Older archives in this directory predate that rename and
still install the retired `buildstory` / `story-scanner` aliases; keep them for
provenance only and do not hand them to creators.
