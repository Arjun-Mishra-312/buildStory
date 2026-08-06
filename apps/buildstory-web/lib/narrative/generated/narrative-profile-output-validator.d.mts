import type { ValidateFunction } from "ajv";
import type { NarrativeProfileSections } from "../schema";

declare const validate: ValidateFunction<NarrativeProfileSections>;

export { validate };
export default validate;
