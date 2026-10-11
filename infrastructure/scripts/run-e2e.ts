import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("E2E exige banco separado com sufixo _test.");
const result = spawnSync("pnpm", ["exec", "playwright", "test"], {
  stdio: "inherit",
  env: {
    ...process.env,
    RUN_E2E: "1",
    NODE_ENV: "test",
    APP_ORIGIN: "http://localhost:5173",
    PORT: "3000",
    PUBLIC_LIBRARY_GROUP_ID: randomUUID(),
  },
});
process.exit(result.status ?? 1);
