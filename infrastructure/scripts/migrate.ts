import { spawnSync } from "node:child_process";
const result = spawnSync("pnpm", ["db:migrate"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
