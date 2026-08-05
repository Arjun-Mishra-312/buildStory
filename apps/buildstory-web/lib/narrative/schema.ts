import Ajv2020 from "ajv/dist/2020.js";

export const NARRATIVE_PROMPT_VERSION = "narrative-v1" as const;

export type NarrativeSections = {
  headline: string;
  narrative: string;
  turningPoint: string;
  learnings: string[];
};

/**
 * JSON Schema sent to the model as a structured-output constraint (OpenAI
 * response_format: json_schema) AND used to validate the response after
 * parsing. The model's output is untrusted either way - constrained
 * generation reduces malformed responses, it does not make the content
 * itself safe, which is why every field is re-run through
 * sanitizePublicText before storage regardless of schema validity.
 */
export const NARRATIVE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "narrative", "turningPoint", "learnings"],
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 120 },
    narrative: { type: "string", minLength: 1, maxLength: 2_000 },
    turningPoint: { type: "string", minLength: 1, maxLength: 300 },
    learnings: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
} as const;

/** Re-exported so callers sanitizing/truncating LLM output for storage use the same bounds the schema enforces, not a second hardcoded set of numbers. */
export const NARRATIVE_FIELD_LIMITS = {
  headline: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.headline.maxLength,
  narrative: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.narrative.maxLength,
  turningPoint: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.turningPoint.maxLength,
  learningItem: NARRATIVE_OUTPUT_JSON_SCHEMA.properties.learnings.items.maxLength,
} as const;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(NARRATIVE_OUTPUT_JSON_SCHEMA);

export function validateNarrativeSections(value: unknown): { ok: true; sections: NarrativeSections } | { ok: false; errors: string[] } {
  if (!validate(value)) {
    const errors = (validate.errors ?? []).map((error) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`);
    return { ok: false, errors: errors.length ? errors : ["Model output does not match the narrative schema."] };
  }
  return { ok: true, sections: value as NarrativeSections };
}
