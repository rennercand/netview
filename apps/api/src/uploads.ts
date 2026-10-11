import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "@family/database";
import type { PrivateStorage } from "@family/storage";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  uploadSchema,
  partSchema,
  completionSchema,
  PART_SIZE,
  parseFilename,
  sanitizeFilename,
} from "@family/shared";
import { ensure } from "./errors.js";
import { groupAccess, user } from "./auth.js";
export function uploadRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  storage: PrivateStorage,
  enqueue: (processingId: string, mediaId: string) => Promise<void>,
) {
  async function owned(req: FastifyRequest, id: string) {
    z.string().uuid().parse(id);
    const upload = await db.uploadSession.findUnique({
      where: { id },
      include: { media: true },
    });
    ensure(
      upload && upload.uploaderId === user(req).id,
      404,
      "Upload não encontrado",
    );
    await groupAccess(db, req, upload.media.groupId, "upload");
    return upload;
  }
  async function failed(id: string) {
    await db.$transaction(async (tx) => {
      const u = await tx.uploadSession.findUniqueOrThrow({
        where: { id },
        include: { media: true },
      });
      const result = await tx.uploadSession.updateMany({
        where: { id, status: { in: ["OPEN", "COMPLETING"] } },
        data: { status: "FAILED" },
      });
      if (result.count) {
        await tx.household.update({
          where: { id: u.media.groupId },
          data: { reservedBytes: { decrement: u.expectedSize } },
        });
        await tx.media.update({
          where: { id: u.mediaId },
          data: {
            status: "FAILED",
            processingError: "Falha na integridade do upload",
          },
        });
      }
    });
  }
  app.post(
    "/uploads/init",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = uploadSchema.parse(req.body);
      await groupAccess(db, req, body.groupId, "upload");
      const max = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 ** 3);
      ensure(body.size <= max, 413, "Arquivo excede o limite de upload");
      const storageKey = `originals/${randomUUID()}.mp4`;
      const upload = await db.$transaction(async (tx) => {
        const updated =
          await tx.$executeRaw`UPDATE "Household" SET "reservedBytes"="reservedBytes"+${BigInt(body.size)} WHERE id=${body.groupId}::uuid AND "usedBytes"+"reservedBytes"+${BigInt(body.size)}<="quotaBytes"`;
        ensure(updated === 1, 413, "Quota de armazenamento excedida");
        const media = await tx.media.create({
          data: {
            groupId: body.groupId,
            uploaderId: user(req).id,
            filename: sanitizeFilename(body.filename),
            ...parseFilename(body.filename),
            size: BigInt(body.size),
          },
        });
        return tx.uploadSession.create({
          data: {
            mediaId: media.id,
            uploaderId: user(req).id,
            storageKey,
            expectedSize: BigInt(body.size),
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          },
        });
      });
      try {
        const storageUploadId = await storage.init(storageKey);
        await db.uploadSession.update({
          where: { id: upload.id },
          data: { storageUploadId },
        });
      } catch (e) {
        await failed(upload.id);
        throw e;
      }
      await db.auditLog.create({
        data: {
          actorId: user(req).id,
          action: "UPLOAD_INIT",
          objectId: upload.mediaId,
          result: "OK",
        },
      });
      return reply.code(201).send({
        id: upload.id,
        mediaId: upload.mediaId,
        partSize: PART_SIZE,
        expiresAt: upload.expiresAt,
      });
    },
  );
  app.get("/uploads", async (req) =>
    db.uploadSession.findMany({
      where: {
        uploaderId: user(req).id,
        status: "OPEN",
        expiresAt: { gt: new Date() },
        media: {
          groupId: req.mvpGroupId || undefined,
          group: {
            memberships: user(req).isAdmin
              ? undefined
              : { some: { userId: user(req).id, active: true } },
          },
        },
      },
      select: {
        id: true,
        mediaId: true,
        expectedSize: true,
        expiresAt: true,
        media: { select: { filename: true, groupId: true } },
      },
    }),
  );
  app.get<{ Params: { id: string } }>("/uploads/:id", async (req) => {
    const u = await owned(req, req.params.id);
    ensure(
      u.status === "OPEN" && u.expiresAt > new Date() && u.storageUploadId,
      409,
      "Upload indisponível",
    );
    return {
      id: u.id,
      filename: u.media.filename,
      size: u.expectedSize,
      partSize: PART_SIZE,
      parts: await storage.parts(u.storageKey, u.storageUploadId),
    };
  });
  app.post<{ Params: { id: string } }>("/uploads/:id/part-url", async (req) => {
    const u = await owned(req, req.params.id);
    ensure(
      u.status === "OPEN" && u.expiresAt > new Date() && u.storageUploadId,
      409,
      "Upload indisponível",
    );
    const { partNumber } = partSchema.parse(req.body);
    ensure(
      partNumber <= Math.ceil(Number(u.expectedSize) / PART_SIZE),
      400,
      "Parte fora do tamanho declarado",
    );
    return {
      url: await storage.partUrl(
        u.storageKey,
        u.storageUploadId,
        partNumber,
        Math.min(
          PART_SIZE,
          Number(u.expectedSize) - (partNumber - 1) * PART_SIZE,
        ),
      ),
      expiresIn: 300,
    };
  });
  app.post<{ Params: { id: string } }>("/uploads/:id/complete", async (req) => {
    const u = await owned(req, req.params.id);
    if (u.status === "COMPLETED")
      return { mediaId: u.mediaId, status: u.media.status };
    ensure(
      u.status === "OPEN" && u.expiresAt > new Date() && u.storageUploadId,
      409,
      "Upload indisponível",
    );
    const submitted = completionSchema
      .parse(req.body)
      .parts.sort((a, b) => a.partNumber - b.partNumber);
    const parts = await storage.parts(u.storageKey, u.storageUploadId);
    const count = Math.ceil(Number(u.expectedSize) / PART_SIZE);
    ensure(
      parts.length === count &&
        submitted.length === count &&
        parts.every(
          (p, i) =>
            p.partNumber === i + 1 &&
            p.etag === submitted[i].etag &&
            p.size ===
              (i === count - 1
                ? Number(u.expectedSize) - PART_SIZE * i
                : PART_SIZE),
        ),
      400,
      "Partes, tamanhos ou ETags inválidos",
    );
    const claim = await db.uploadSession.updateMany({
      where: { id: u.id, status: "OPEN" },
      data: { status: "COMPLETING" },
    });
    ensure(claim.count === 1, 409, "Finalização em andamento");
    {
      await storage.complete(u.storageKey, u.storageUploadId, submitted);
      const head = await storage.head(u.storageKey);
      ensure(
        head.ContentLength === Number(u.expectedSize),
        400,
        "Tamanho final divergente",
      );
      const processingJob = await db.$transaction(async (tx) => {
        const changed = await tx.uploadSession.updateMany({
          where: { id: u.id, status: "COMPLETING" },
          data: { status: "COMPLETED" },
        });
        ensure(changed.count === 1, 409, "Estado de upload inválido");
        await tx.media.update({
          where: { id: u.mediaId },
          data: {
            status: "PROCESSING",
            assets: {
              create: {
                type: "ORIGINAL",
                storageKey: u.storageKey,
                mime: "video/mp4",
                size: u.expectedSize,
              },
            },
          },
        });
        await tx.household.update({
          where: { id: u.media.groupId },
          data: {
            reservedBytes: { decrement: u.expectedSize },
            usedBytes: { increment: u.expectedSize },
          },
        });
        return tx.processingJob.create({ data: { mediaId: u.mediaId } });
      });
      await enqueue(processingJob.id, u.mediaId).catch(() =>
        req.log.warn(
          { jobId: processingJob.id },
          "Fila indisponível; job preservado na outbox",
        ),
      );
    }
    await db.auditLog.create({
      data: {
        actorId: user(req).id,
        action: "UPLOAD_COMPLETE",
        objectId: u.mediaId,
        result: "OK",
      },
    });
    return { mediaId: u.mediaId, status: "PROCESSING" };
  });
  app.post<{ Params: { id: string } }>("/uploads/:id/abort", async (req) => {
    const u = await owned(req, req.params.id);
    if (u.status === "ABORTED") return { ok: true };
    ensure(
      u.status === "OPEN" && u.storageUploadId,
      409,
      "Upload não pode ser cancelado",
    );
    // Reivindica o estado antes de falar com storage: completa e cancela não podem concorrer.
    const claim = await db.uploadSession.updateMany({
      where: { id: u.id, status: "OPEN" },
      data: { status: "COMPLETING" },
    });
    ensure(claim.count === 1, 409, "Upload ocupado");
    await storage.abort(u.storageKey, u.storageUploadId);
    await storage.remove(u.storageKey);
    await db.$transaction([
      db.uploadSession.update({
        where: { id: u.id },
        data: { status: "ABORTED" },
      }),
      db.media.update({
        where: { id: u.mediaId },
        data: { status: "DELETED" },
      }),
      db.household.update({
        where: { id: u.media.groupId },
        data: { reservedBytes: { decrement: u.expectedSize } },
      }),
    ]);
    return { ok: true };
  });
}
