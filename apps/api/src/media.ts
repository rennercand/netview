import type { FastifyInstance } from "fastify";
import type { PrismaClient, Prisma } from "@family/database";
import type { PrivateStorage } from "@family/storage";
import type { Readable } from "node:stream";
import { z } from "zod";
import { ensure } from "./errors.js";
import { groupAccess, mediaAccess, user } from "./auth.js";
export function parseRange(range: string | undefined, size: number) {
  if (!range) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  ensure(m && (m[1] || m[2]), 416, "Range inválido");
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1]
    ? m[2]
      ? Math.min(Number(m[2]), size - 1)
      : size - 1
    : size - 1;
  ensure(
    Number.isSafeInteger(start) &&
      Number.isSafeInteger(end) &&
      start >= 0 &&
      start < size &&
      end >= start &&
      !(!m[1] && Number(m[2]) === 0),
    416,
    "Range inválido",
  );
  return `bytes=${start}-${end}`;
}
export function mediaRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  storage: PrivateStorage,
) {
  app.get("/media", async (req) => {
    const query = z
      .object({
        q: z.string().max(100).default(""),
        groupId: z.string().uuid().optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    if (query.groupId) await groupAccess(db, req, query.groupId);
    const where: Prisma.MediaWhereInput = {
      status: { not: "DELETED" },
      groupId: req.mvpGroupId || query.groupId,
      group: user(req).isAdmin
        ? undefined
        : { memberships: { some: { userId: user(req).id, active: true } } },
      NOT: { permissions: { some: { userId: user(req).id, canView: false } } },
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { series: { contains: query.q, mode: "insensitive" } },
        { filename: { contains: query.q, mode: "insensitive" } },
      ],
    };
    const [items, total] = await db.$transaction([
      db.media.findMany({
        where,
        orderBy: [
          { series: "asc" },
          { season: "asc" },
          { episode: "asc" },
          { createdAt: "desc" },
        ],
        skip: (query.page - 1) * 100,
        take: 100,
        select: {
          id: true,
          groupId: true,
          title: true,
          series: true,
          season: true,
          episode: true,
          status: true,
          duration: true,
          size: true,
          width: true,
          height: true,
          filename: true,
          processingError: true,
          progress: {
            where: { userId: user(req).id },
            select: { position: true },
          },
        },
      }),
      db.media.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: 100 };
  });
  app.get<{ Params: { id: string } }>("/media/:id", async (req) => {
    const media = await mediaAccess(
      db,
      req,
      z.string().uuid().parse(req.params.id),
    );
    return {
      id: media.id,
      title: media.title,
      series: media.series,
      season: media.season,
      episode: media.episode,
      status: media.status,
      duration: media.duration,
      processingError: media.processingError,
    };
  });
  app.patch<{ Params: { id: string } }>("/media/:id", async (req) => {
    const media = await mediaAccess(
      db,
      req,
      z.string().uuid().parse(req.params.id),
    );
    await groupAccess(db, req, media.groupId, "upload");
    ensure(
      user(req).isAdmin ||
        media.uploaderId === user(req).id ||
        req.mvpGroupId === media.groupId,
      403,
      "Somente dono ou administrador",
    );
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        series: z.string().trim().min(1).max(200).nullable(),
        season: z.number().int().min(0).max(999).nullable(),
        episode: z.number().int().min(0).max(9999).nullable(),
      })
      .partial()
      .parse(req.body);
    await db.media.update({ where: { id: media.id }, data: body });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/media/:id/playback-session",
    async (req) => {
      const media = await mediaAccess(
        db,
        req,
        z.string().uuid().parse(req.params.id),
      );
      ensure(
        media.status === "READY",
        409,
        "Vídeo ainda não está pronto para reprodução",
      );
      await db.auditLog.create({
        data: {
          actorId: user(req).id,
          action: "PLAYBACK",
          objectId: media.id,
          result: "OK",
        },
      });
      const asset = media.assets.find((a) => a.type === "ORIGINAL");
      ensure(asset, 404, "Arquivo indisponível");
      const direct = process.env.PLAYBACK_DELIVERY !== "gateway";
      return {
        source: direct
          ? await storage.playbackUrl(asset.storageKey)
          : `/api/v1/media/${media.id}/content`,
        mime: "video/mp4",
        delivery: direct ? "direct" : "gateway",
        expiresAt: direct
          ? new Date(Date.now() + 120000)
          : req.identity!.expiresAt,
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/media/:id/content",
    async (req, reply) => {
      const media = await mediaAccess(
        db,
        req,
        z.string().uuid().parse(req.params.id),
      );
      ensure(media.status === "READY", 409, "Vídeo não está pronto");
      const asset = media.assets.find((a) => a.type === "ORIGINAL");
      ensure(asset, 404, "Arquivo indisponível");
      let range: string | undefined;
      try {
        range = parseRange(req.headers.range, Number(asset.size));
      } catch (e) {
        reply.header("Content-Range", `bytes */${asset.size}`);
        throw e;
      }
      const response = await storage.get(asset.storageKey, range);
      ensure(response.Body, 502, "Armazenamento indisponível");
      reply
        .code(range ? 206 : 200)
        .header("Content-Type", "video/mp4")
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "private, no-store")
        .header("Content-Length", response.ContentLength!)
        .header("Content-Disposition", "inline");
      if (response.ContentRange)
        reply.header("Content-Range", response.ContentRange);
      return reply.send(response.Body as Readable);
    },
  );
  app.get<{ Params: { id: string } }>(
    "/media/:id/thumbnail",
    async (req, reply) => {
      const media = await mediaAccess(
        db,
        req,
        z.string().uuid().parse(req.params.id),
      );
      const asset = media.assets.find((a) => a.type === "THUMBNAIL");
      ensure(asset, 404, "Capa indisponível");
      const r = await storage.get(asset.storageKey);
      reply
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "private, no-store");
      return reply.send(r.Body as Readable);
    },
  );
  app.put<{ Params: { id: string } }>("/media/:id/progress", async (req) => {
    const media = await mediaAccess(
      db,
      req,
      z.string().uuid().parse(req.params.id),
    );
    const { position } = z
      .object({ position: z.number().finite().min(0) })
      .parse(req.body);
    ensure(
      !media.duration || position <= media.duration + 1,
      400,
      "Posição inválida",
    );
    await db.watchProgress.upsert({
      where: { userId_mediaId: { userId: user(req).id, mediaId: media.id } },
      create: { userId: user(req).id, mediaId: media.id, position },
      update: { position },
    });
    return { ok: true };
  });
}
