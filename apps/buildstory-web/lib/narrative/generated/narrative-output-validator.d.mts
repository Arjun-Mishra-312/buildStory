import type { ValidateFunction } from "ajv";
import type { NarrativeSections } from "../schema";

declare const validate: ValidateFunction<NarrativeSections>;

export { validate };
export default validate;
