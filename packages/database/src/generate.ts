import { spawnSync } from "node:child_process";
// Generation uses Prisma's packaged WASM and never connects to a database.
const env = {
  ...process.env,
  PRISMA_JS_MIGRATIONS: "1",
  DATABASE_URL:
    process.env.DATABASE_URL || "postgresql://localhost/family_stream",
  DIRECT_URL: process.env.DIRECT_URL || "postgresql://localhost/family_stream",
};
const result = spawnSync("pnpm", ["exec", "prisma", "generate"], {
  stdio: "inherit",
  env,
});
process.exit(result.status ?? 1);
