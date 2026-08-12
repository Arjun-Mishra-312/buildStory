import { spawnSync } from "node:child_process";
import path from "node:path";

const executable = process.platform === "win32" ? "promptfoo.cmd" : "promptfoo";
const result = spawnSync(executable, ["eval", "-c", "evals/report-v4/promptfooconfig.yaml", "--no-cache", "--no-progress-bar"], {
  cwd: path.resolve(import.meta.dirname, ".."),
  env: { ...process.env, CI: "1", PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1" },
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
