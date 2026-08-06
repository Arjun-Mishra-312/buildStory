import type { ValidateFunction } from "ajv";
import type { ScannerProjectSnapshot } from "../scanner-project-snapshot";

declare const validate: ValidateFunction<ScannerProjectSnapshot>;

export { validate };
export default validate;
