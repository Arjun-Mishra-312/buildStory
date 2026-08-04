import { productionRuntimeIssues } from "../lib/config/runtime";

Reflect.set(process.env, "NODE_ENV", "production");
const issues = productionRuntimeIssues();
if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.variable}: ${issue.code}`);
  }
  process.exitCode = 1;
} else {
  console.log("Production environment names and safety switches are configured.");
}
