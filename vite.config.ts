import vinext from "vinext";
import { defineConfig } from "vite";

const shouldPollForFileChanges = process.platform === "darwin";

export default defineConfig(async ({ command }) => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry-local";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: shouldPollForFileChanges
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        inspectorPort: false,
        persistState: {
          path: process.env.MINIFLARE_STATE_PATH ?? ".wrangler/state-local",
        },
        remoteBindings: false,
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        configPath:
          command === "serve"
            ? "./wrangler.local.jsonc"
            : "./wrangler.jsonc",
      }),
    ],
  };
});
