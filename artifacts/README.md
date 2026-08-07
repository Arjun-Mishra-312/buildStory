# Local package artifacts

`buildstory-scan-0.7.0.tgz` is the current packed archive built from
`packages/buildstory-scanner`. It is the same tarball `npm publish` uploads, so
installing it locally exercises the real published layout.

```powershell
npm install --global ./artifacts/buildstory-scan-0.7.0.tgz
buildstory-scan --version
```

SHA-256 for the committed archive:

```text
39a86a5632df4206112d1f376275f3d407aea732e074950626ddbacc367d5e7a
```

Rebuild it with `npm run package:scanner`; update this checksum whenever package
inputs change. That command only packs - `npm publish` is a separate, deliberate
step. `npm run check:artifact` derives the expected filename from the package
manifest, so a version bump without a repack fails the check rather than
silently validating an older archive.

The package publishes as `buildstory-scan` and installs a single binary of the
same name. The `buildstory-scanner-*.tgz` archives here predate two changes -
the scoped `@buildstory/scanner` name and, before that, the retired
`buildstory` / `story-scanner` binary aliases. Keep them for provenance only;
do not hand them to creators.
