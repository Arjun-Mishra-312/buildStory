/**
 * Builder profile scoring lives in the open-source engine. This module keeps
 * the web snapshot types at the boundary.
 */
import {
  ARCHETYPES,
  PROFILE_DIMENSIONS,
  archetypeFacetKey,
  canonicalArchetypeName,
  computeBuilderProfile as engineComputeBuilderProfile,
  defaultProfileNarrative,
  type Archetype,
  type BuilderProfile,
  type ComputedArchetype,
  type ProfileDimension,
  type ProfileInputs as EngineProfileInputs,
  type ProfileNarrativeSections,
  type ProfileScore,
} from "buildstory-scan/engine";
import type { GitAggregateMetrics, SessionSummary, TimeWindow, UsageSummary } from "./scanner-project-snapshot";

export {
  ARCHETYPES,
  PROFILE_DIMENSIONS,
  archetypeFacetKey,
  canonicalArchetypeName,
  defaultProfileNarrative,
  type Archetype,
  type BuilderProfile,
  type ComputedArchetype,
  type ProfileDimension,
  type ProfileNarrativeSections,
  type ProfileScore,
};

export type ProfileInputs = {
  sessions: SessionSummary[];
  usage: UsageSummary;
  git: GitAggregateMetrics;
  timeWindow?: Pick<TimeWindow, "utcOffsetMinutes">;
};

export function computeBuilderProfile(inputs: ProfileInputs): BuilderProfile {
  return engineComputeBuilderProfile(inputs as EngineProfileInputs);
}
