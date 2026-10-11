import { PROCESSING_JOB_OPTIONS } from "@family/shared";
import { PrismaClient } from "@family/database";
import { storageFromEnv } from "@family/storage";
import { Redis } from "ioredis";
import { Worker, Queue } from "bullmq";
import pino from "pino";
import { processMedia } from "./process.js";
const db = new PrismaClient(),
  storage = storageFromEnv(),
  logger = pino();
const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});
const queue = new Queue("media", { connection });
const worker = new Worker<{ mediaId: string; processingId: string }>(
  "media",
  async (job) => {
    await db.processingJob.update({
      where: { id: job.data.processingId },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
    try {
      await processMedia(db, storage, job.data.mediaId);
      await db.processingJob.update({
        where: { id: job.data.processingId },
        data: { status: "DONE" },
      });
    } catch (e) {
      await db.processingJob.update({
        where: { id: job.data.processingId },
        data: { status: job.attemptsMade >= 2 ? "FAILED" : "PENDING" },
      });
      await db.media.update({
        where: { id: job.data.mediaId },
        data: {
          status: "FAILED",
          processingError:
            "Processamento falhou. Verifique arquivo, codecs e logs do worker.",
        },
      });
      throw e;
    }
  },
  { connection, concurrency: 1 },
);
worker.on("error", (e) => logger.error({ name: e.name }, "Erro do worker"));
worker.on("failed", (job) => logger.warn({ id: job?.id }, "Job falhou"));
let stopping = false;
async function maintenance() {
  if (stopping) return;
  // Outbox: nenhuma dependência de uma publicação Redis acontecer junto da transação SQL.
  for (const job of await db.processingJob.findMany({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    take: 100,
  }))
    await queue.add(
      "probe",
      { mediaId: job.mediaId, processingId: job.id },
      {
        jobId: job.id,
        ...PROCESSING_JOB_OPTIONS,
      },
    );
  for (const u of await db.uploadSession.findMany({
    where: {
      status: { in: ["OPEN", "COMPLETING", "FAILED"] },
      expiresAt: { lt: new Date() },
    },
    include: { media: true },
    take: 20,
  })) {
    if (u.storageUploadId) await storage.abort(u.storageKey, u.storageUploadId);
    await storage.remove(u.storageKey);
    await db.$transaction(async (tx) => {
      const changed = await tx.uploadSession.updateMany({
        where: { id: u.id, status: { in: ["OPEN", "COMPLETING", "FAILED"] } },
        data: { status: "ABORTED" },
      });
      if (changed.count) {
        if (u.status !== "FAILED")
          await tx.household.update({
            where: { id: u.media.groupId },
            data: { reservedBytes: { decrement: u.expectedSize } },
          });
        await tx.media.update({
          where: { id: u.mediaId },
          data: { status: "DELETED" },
        });
      }
    });
  }
  const retention = new Date(Date.now() - 30 * 86400000);
  await db.auditLog.deleteMany({ where: { createdAt: { lt: retention } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: retention } } });
}
let running = false;
const tick = async () => {
  if (running) return;
  running = true;
  try {
    await maintenance();
  } catch (e) {
    logger.error({ name: (e as Error).name }, "Manutenção falhou");
  } finally {
    running = false;
  }
};
await tick();
const reconcileMs = Number(
  process.env.OUTBOX_RECONCILE_MS ||
    (process.env.NODE_ENV === "production" ? 3600000 : 5000),
);
if (
  !Number.isFinite(reconcileMs) ||
  reconcileMs < 5000 ||
  reconcileMs > 3600000
)
  throw new Error("OUTBOX_RECONCILE_MS deve estar entre 5000 e 3600000.");
const timer = setInterval(() => void tick(), reconcileMs);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    stopping = true;
    clearInterval(timer);
    await worker.close();
    await queue.close();
    await connection.quit();
    await db.$disconnect();
    storage.close();
    process.exit(0);
  });
