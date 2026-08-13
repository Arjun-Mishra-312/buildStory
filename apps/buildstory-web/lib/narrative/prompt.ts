/**
 * Hosted Cloud generation uses the open-source engine prompts so local CLI
 * and BuildStory.com cannot drift. Snapshot types are the scanner contract;
 * the web transport type is a structural match.
 */
import type { ScannerProjectSnapshot, Signal } from "../ingestion/scanner-project-snapshot";
import {
  NARRATIVE_COMBINED_RESPONSE_FORMAT,
  NARRATIVE_DEEP_ANALYSIS_RESPONSE_FORMAT,
  NARRATIVE_DEEP_SYNTHESIS_RESPONSE_FORMAT,
  NARRATIVE_PROFILE_RESPONSE_FORMAT,
  NARRATIVE_RESPONSE_FORMAT,
  NARRATIVE_SYSTEM_PROMPT,
  STORY_PACK_DEEP_ANALYSIS_SCHEMA,
  STORY_PACK_DEEP_NARRATIVE_SCHEMA,
  STORY_PACK_OUTPUT_SCHEMA,
  buildCombinedMessages as engineBuildCombinedMessages,
  buildDeepAnalysisMessages as engineBuildDeepAnalysisMessages,
  buildDeepSynthesisMessages as engineBuildDeepSynthesisMessages,
  buildNarrativeMessages as engineBuildNarrativeMessages,
  buildProfileMessages as engineBuildProfileMessages,
  type ProjectSnapshot,
} from "buildstory-scan/engine";

export {
  NARRATIVE_COMBINED_RESPONSE_FORMAT,
  NARRATIVE_DEEP_ANALYSIS_RESPONSE_FORMAT,
  NARRATIVE_DEEP_SYNTHESIS_RESPONSE_FORMAT,
  NARRATIVE_PROFILE_RESPONSE_FORMAT,
  NARRATIVE_RESPONSE_FORMAT,
  NARRATIVE_SYSTEM_PROMPT,
  STORY_PACK_DEEP_ANALYSIS_SCHEMA,
  STORY_PACK_DEEP_NARRATIVE_SCHEMA,
  STORY_PACK_OUTPUT_SCHEMA,
};

function asEngineSnapshot(snapshot: ScannerProjectSnapshot): ProjectSnapshot {
  return snapshot as unknown as ProjectSnapshot;
}

export function buildNarrativeMessages(snapshot: ScannerProjectSnapshot) {
  return engineBuildNarrativeMessages(asEngineSnapshot(snapshot));
}

export function buildProfileMessages(snapshot: ScannerProjectSnapshot) {
  return engineBuildProfileMessages(asEngineSnapshot(snapshot));
}

export function buildCombinedMessages(snapshot: ScannerProjectSnapshot, signals: Signal[] = []) {
  return engineBuildCombinedMessages(asEngineSnapshot(snapshot), signals);
}

export function buildDeepAnalysisMessages(snapshot: ScannerProjectSnapshot, signals: Signal[] = [], previousChapter: unknown = null) {
  return engineBuildDeepAnalysisMessages(asEngineSnapshot(snapshot), signals, previousChapter);
}

export function buildDeepSynthesisMessages(snapshot: ScannerProjectSnapshot, analysisMap: unknown) {
  return engineBuildDeepSynthesisMessages(asEngineSnapshot(snapshot), analysisMap);
}
