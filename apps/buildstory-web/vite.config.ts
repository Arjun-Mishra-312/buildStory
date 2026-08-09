import vinext from "vinext";
import { defineConfig } from "vite";

const LOCAL_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
const LOCAL_D1_BINDING = "DB";
const LOCAL_R2_BINDING = "MEDIA";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  assets: { binding: "ASSETS" },
  d1_databases: [
    {
      binding: LOCAL_D1_BINDING,
      database_name: "buildstory-local-d1",
      database_id: LOCAL_PLACEHOLDER_DATABASE_ID,
    },
  ],
  r2_buckets: [
    {
      binding: LOCAL_R2_BINDING,
      bucket_name: "buildstory-local-r2",
    },
  ],
  queues: {
    producers: [{ binding: "NARRATIVE_QUEUE", queue: "buildstory-local-narratives" }],
    consumers: [{ queue: "buildstory-local-narratives", max_batch_size: 1, max_retries: 3, retry_delay: 60 }],
  },
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
