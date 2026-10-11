import { PrismaClient } from "@family/database";
import { storageFromEnv } from "@family/storage";
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
const config = loadConfig();
const db = new PrismaClient();
const storage = storageFromEnv();
const app = await buildApp(db, storage, config);
await app.listen({ host: "0.0.0.0", port: config.PORT });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    storage.close();
    process.exit(0);
  });
