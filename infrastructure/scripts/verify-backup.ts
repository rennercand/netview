import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "../../packages/database/src/index.js";
import { hashPassword, token } from "../../packages/auth/src/index.js";
import { storageFromEnv } from "../../packages/storage/src/index.js";
if (
  process.env.RUN_BACKUP_TEST !== "1" ||
  !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")
)
  throw new Error(
    "Teste local exige RUN_BACKUP_TEST=1 e DATABASE_URL com sufixo _test.",
  );
const execute = promisify(execFile),
  db = new PrismaClient(),
  storage = storageFromEnv(),
  id = randomUUID();
const container =
  process.env.TEST_POSTGRES_CONTAINER || "family-stream-dev-postgres-1";
const database = new URL(process.env.DATABASE_URL!).pathname.slice(1),
  restoreName = `restore_${id.replaceAll("-", "")}_test`;
const dir = await mkdtemp(join(tmpdir(), "family-backup-"));
let userId: string | undefined,
  groupId: string | undefined,
  restore: PrismaClient | undefined,
  created = false;
const key = `originals/backup-test-${id}.mp4`,
  copyKey = `backup-tests/${id}.mp4`;
try {
  const file = join(dir, "sample.mp4");
  await execute("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=160x120:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    file,
  ]);
  const bytes = await readFile(file);
  const digest = (data: Uint8Array) =>
    createHash("sha256").update(data).digest("hex");
  await storage.put(key, bytes, "video/mp4");
  const actor = await db.user.create({
    data: {
      email: `backup-${id}@example.test`,
      name: "Restore test",
      passwordHash: await hashPassword(token()),
    },
  });
  userId = actor.id;
  const group = await db.household.create({
    data: { name: "Restore test", ownerId: actor.id },
  });
  groupId = group.id;
  const media = await db.media.create({
    data: {
      groupId: group.id,
      uploaderId: actor.id,
      title: "Restore test",
      filename: "sample.mp4",
      status: "READY",
      size: BigInt(bytes.length),
      assets: {
        create: {
          type: "ORIGINAL",
          storageKey: key,
          mime: "video/mp4",
          size: BigInt(bytes.length),
        },
      },
    },
  });
  const dump = await execute(
    "docker",
    [
      "exec",
      container,
      "pg_dump",
      "--format=custom",
      "--no-owner",
      "-U",
      "family",
      "-d",
      database,
    ],
    { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  await writeFile(join(dir, "database.dump"), dump.stdout, { mode: 0o600 });
  const original = await storage.get(key);
  const backup = await original.Body!.transformToByteArray();
  await storage.put(copyKey, Buffer.from(backup), "video/mp4");
  await storage.remove(key);
  const copied = await storage.get(copyKey);
  const restoredBytes = await copied.Body!.transformToByteArray();
  await storage.put(key, Buffer.from(restoredBytes), "video/mp4");
  if (digest(bytes) !== digest(restoredBytes))
    throw new Error("Checksum da mídia divergiu.");
  await execute("docker", [
    "exec",
    container,
    "createdb",
    "-U",
    "family",
    restoreName,
  ]);
  created = true;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "--no-owner",
        "-U",
        "family",
        "-d",
        restoreName,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("pg_restore falhou.")),
    );
    child.stdin.end(dump.stdout);
  });
  const restoredUrl = new URL(process.env.DATABASE_URL!);
  restoredUrl.pathname = `/${restoreName}`;
  process.env.DATABASE_URL = restoredUrl.toString();
  restore = new PrismaClient();
  const restoredMedia = await restore.media.findUniqueOrThrow({
    where: { id: media.id },
    include: { assets: true },
  });
  if (
    restoredMedia.assets[0].storageKey !== key ||
    restoredMedia.uploaderId !== actor.id
  )
    throw new Error("Mapeamento restaurado divergente.");
  const ranged = await storage.get(key, "bytes=0-11");
  const magic = await ranged.Body!.transformToByteArray();
  if (Buffer.from(magic).subarray(4, 8).toString() !== "ftyp")
    throw new Error("Mídia restaurada inválida.");
  console.log(
    "PASS: pg_dump/pg_restore, IDs e mapeamentos preservados, original recuperado com SHA-256 e Range.",
  );
  console.log(
    "Teste usa destino temporário no mesmo MinIO; redundância/criptografia de backups de produção não foram verificadas.",
  );
} finally {
  if (restore) await restore.$disconnect();
  if (created)
    await execute("docker", [
      "exec",
      container,
      "dropdb",
      "--force",
      "-U",
      "family",
      restoreName,
    ]);
  await storage.remove(key);
  await storage.remove(copyKey);
  if (groupId) {
    await db.media.deleteMany({ where: { groupId } });
    await db.household.delete({ where: { id: groupId } });
  }
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
  storage.close();
  await rm(dir, { recursive: true, force: true });
}
