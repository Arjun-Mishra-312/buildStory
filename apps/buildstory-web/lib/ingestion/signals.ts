/**
 * Deterministic report signals live in the open-source engine. This module
 * keeps the web snapshot types at the boundary.
 */
import {
  computeSignals as engineComputeSignals,
  type Signal,
  type SignalFamily,
  type SignalInputs as EngineSignalInputs,
} from "buildstory-scan/engine";
import type { GitAggregateMetrics, NarrativeEvidenceBundle, SessionSummary, StoryPackSource, UsageSummary } from "./scanner-project-snapshot";

export type { Signal, SignalFamily };

export type SignalInputs = {
  sessions: SessionSummary[];
  usage: UsageSummary;
  git: GitAggregateMetrics;
  timeWindow?: { utcOffsetMinutes?: number } | undefined;
  narrativeEvidence?: NarrativeEvidenceBundle | undefined;
  sources: StoryPackSource[];
};

export function computeSignals(inputs: SignalInputs): Signal[] {
  return engineComputeSignals(inputs as EngineSignalInputs);
}
