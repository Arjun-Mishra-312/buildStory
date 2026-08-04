# Local package artifacts

`buildstory-scanner-0.3.0.tgz` is the unpublished installable archive built from `packages/buildstory-scanner`.

```powershell
npm install --global ./artifacts/buildstory-scanner-0.3.0.tgz
buildstory --version
story-scanner --version
```

SHA-256 for the committed archive:

```text
28ef847900d3ea3bbcecd131407f92fd8f8aaa73db8967bc04fbb8db0c086032
```

Rebuild it with `npm run package:scanner`; update this checksum whenever package inputs change. The package is intentionally private and is not published by that command.
