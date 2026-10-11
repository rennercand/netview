import { spawnSync } from "node:child_process";
// Tests require explicit opt-in and delete only records under randomized integration namespaces.
const result = spawnSync("pnpm", ["test:integration"], {
  stdio: "inherit",
  env: { ...process.env, RUN_INTEGRATION: "1", NODE_ENV: "test" },
});
process.exit(result.status ?? 1);
