/**
 * R2 object keys are `<reportId>/<uuid>.<ext>` (no leading "media/" segment
 * - the /media/ route below already provides that namespace). Always
 * server-generated, never derived from user input, so no validation is
 * needed at the read boundary the way artifact links require.
 */
export function mediaObjectKey(reportId: string, filename: string): string {
  return `${reportId}/${filename}`;
}

/** Relative on purpose: resolves against whatever origin serves the page, so it survives a domain change without a data migration. */
export function mediaPublicUrl(r2Key: string): string {
  return `/media/${r2Key}`;
}
