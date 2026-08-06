import validateNarrativeOutput from "./generated/narrative-output-validator.mjs";
import validateNarrativeProfileOutput from "./generated/narrative-profile-output-validator.mjs";
import narrativeOutputSchemaJson from "./narrative-output.schema.json";
import type { ReportStoryPackV2 } from "../ingestion/scanner-project-snapshot";

export const NARRATIVE_PROMPT_VERSION = "narrative-v2" as const;

export type { ReportStoryPackV2 };

export type NarrativeSections = {
  headline: string;
  narrative: string;
  turningPoint: string;
  learnings: string[];
};

export type NarrativeProfileSections = {
  decisionPatterns: string[];
  standoutTraits: string[];
  growthEdge: string;
};

/**
 * JSON Schema sent to the model as a structured-output constraint (OpenAI
 * response_format: json_schema) AND used to validate the response after
 * parsing (via the precompiled validator below - Cloudflare Workers
 * disallows the runtime code generation Ajv's ajv.compile() normally uses,
 * see scripts/generate-narrative-validator.mjs). The model's output is
 * untrusted either way - constrained generation reduces malformed
 * responses, it does not make the content itself safe, which is why every
 * field is re-run through sanitizePublicText before storage regardless of
 * schema validity.
 */
export const NARRATIVE_OUTPUT_JSON_SCHEMA = narrativeOutputSchemaJson;

/** Re-exported so callers sanitizing/truncating LLM output for storage use the same bounds the schema enforces, not a second hardcoded set of numbers. */
export const NARRATIVE_FIELD_LIMITS = {
  headline: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.headline.maxLength,
  narrative: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.narrative.maxLength,
  turningPoint: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.turningPoint.maxLength,
  learningItem: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.learnings.items.maxLength,
  decisionPatternItem: 300,
  standoutTraitItem: 300,
  growthEdge: 500,
} as const;

export function validateNarrativeSections(value: unknown): { ok: true; sections: NarrativeSections } | { ok: false; errors: string[] } {
  if (!validateNarrativeOutput(value)) {
    const errors = (validateNarrativeOutput.errors ?? []).map(
      (error) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`,
    );
    return { ok: false, errors: errors.length ? errors : ["Model output does not match the narrative schema."] };
  }
  return { ok: true, sections: value as NarrativeSections };
}

export function validateNarrativeProfileSections(value: unknown): { ok: true; sections: NarrativeProfileSections } | { ok: false; errors: string[] } {
  if (!validateNarrativeProfileOutput(value)) {
    const errors = (validateNarrativeProfileOutput.errors ?? []).map(
      (error) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`,
    );
    return { ok: false, errors: errors.length ? errors : ["Model output does not match the profile narrative schema."] };
  }
  return { ok: true, sections: value as NarrativeProfileSections };
}
