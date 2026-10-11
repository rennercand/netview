import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
const url = process.env.DIRECT_URL;
if (!url)
  throw new Error(
    "DIRECT_URL obrigatória para migrations (endpoint Neon sem pooler).",
  );
if (
  process.env.NODE_ENV === "production" &&
  new URL(url).searchParams.get("sslmode") !== "verify-full"
)
  throw new Error(
    "DIRECT_URL de produção deve usar sslmode=verify-full para validar TLS.",
  );
const db = new Client({ connectionString: url });
const directory = fileURLToPath(
  new URL("../prisma/migrations/", import.meta.url),
);
await db.connect();
try {
  // Same advisory lock used by Prisma Migrate. All DDL and history writes are transactional.
  await db.query("SELECT pg_advisory_lock(72707369)");
  await db.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id VARCHAR(36) PRIMARY KEY, checksum VARCHAR(64) NOT NULL,
  finished_at TIMESTAMPTZ, migration_name VARCHAR(255) NOT NULL,
  logs TEXT, rolled_back_at TIMESTAMPTZ, started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0)`);
  const folders = (await readdir(directory, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const history = await db.query<{
    migration_name: string;
    checksum: string;
    finished_at: Date | null;
    rolled_back_at: Date | null;
  }>(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
  );
  for (const entry of history.rows) {
    if (
      !entry.rolled_back_at &&
      (!entry.finished_at || !folders.includes(entry.migration_name))
    )
      throw new Error(
        "Histórico de migrations inconsistente; revisão manual necessária.",
      );
  }
  for (const name of folders) {
    const sql = await readFile(join(directory, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = history.rows.find(
      (r) => r.migration_name === name && r.finished_at && !r.rolled_back_at,
    );
    if (previous) {
      if (previous.checksum !== checksum)
        throw new Error(`Checksum divergente: ${name}`);
      continue;
    }
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        'INSERT INTO "_prisma_migrations" (id,checksum,migration_name,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),1)',
        [randomUUID(), checksum, name],
      );
      await db.query("COMMIT");
      console.log(`Migration aplicada: ${name}`);
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
  console.log("Migrations verificadas.");
} finally {
  await db.query("SELECT pg_advisory_unlock(72707369)").catch(() => {});
  await db.end();
}
