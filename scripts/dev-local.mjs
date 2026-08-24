import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

await rm(".wrangler/deploy/config.json", { force: true });
await rm(".vinext", { force: true, recursive: true });

const child = spawn(
  process.execPath,
  ["node_modules/vinext/dist/cli.js", "dev", ...process.argv.slice(2)],
  {
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    WRANGLER_REGISTRY_PATH: `${process.cwd()}/.wrangler/registry`,
  },
  stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
