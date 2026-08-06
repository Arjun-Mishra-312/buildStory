import type { NarrativeRecord } from "./contracts";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";

/**
 * The full narrative lifecycle a report can be in, including the two states
 * that used to be indistinguishable from "nothing to show": a scan that
 * never opted into narrative evidence at all, versus one that opted in but
 * found zero eligible excerpts across every provider. Both are honest,
 * expected outcomes - never errors - and the UI should say which one
 * happened instead of rendering nothing.
 */
export type NarrativeDisplayStatus =
  | "narrative_not_requested"
  | "narrative_no_evidence"
  | "narrative_queued"
  | "narrative_generating"
  | "narrative_ready"
  | "narrative_failed";

export function deriveNarrativeDisplayStatus(
  sourceSnapshot: Pick<ScannerProjectSnapshot, "narrativeEvidence" | "generatedNarrative"> | null,
  narrative: NarrativeRecord | null,
): NarrativeDisplayStatus {
  if (narrative) {
    if (narrative.status === "ready") return "narrative_ready";
    if (narrative.status === "failed") return "narrative_failed";
    if (narrative.status === "generating") return "narrative_generating";
    return "narrative_queued";
  }
  if (sourceSnapshot?.generatedNarrative) return "narrative_ready";
  const bundle = sourceSnapshot?.narrativeEvidence;
  if (!bundle) return "narrative_not_requested";
  if (bundle.excerpts.length === 0) return "narrative_no_evidence";
  // Evidence existed at upload time (which is what queues the narrative job
  // server-side), but no NarrativeRecord exists yet - treat this the same
  // as "queued" rather than silently showing nothing.
  return "narrative_queued";
}
