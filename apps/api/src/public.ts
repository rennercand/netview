import type { FastifyInstance } from "fastify";
import type { PrismaClient, Prisma } from "@family/database";
import type { PrivateStorage } from "@family/storage";
import type { Readable } from "node:stream";
import { z } from "zod";
import { ensure } from "./errors.js";
import type { Config } from "./config.js";

export function publicRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  storage: PrivateStorage,
  config: Config,
) {
  const scope = (): Prisma.MediaWhereInput => {
    ensure(
      config.PUBLIC_LIBRARY_GROUP_ID,
      503,
      "Biblioteca pública ainda não configurada",
    );
    return {
      groupId: config.PUBLIC_LIBRARY_GROUP_ID,
      status: "READY",
      group: {
        owner: { status: "ACTIVE" },
        memberships: { some: { active: true, role: "HOST" } },
      },
    };
  };
  const find = async (id: string) => {
    const media = await db.media.findFirst({
      where: { ...scope(), id: z.string().uuid().parse(id) },
      include: { assets: true },
    });
    ensure(media, 404, "Vídeo não encontrado");
    return media;
  };
  app.get("/public/media", async (req) => {
    const query = z
      .object({
        q: z.string().max(100).default(""),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    const where: Prisma.MediaWhereInput = {
      ...scope(),
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { series: { contains: query.q, mode: "insensitive" } },
      ],
    };
    const [items, total] = await db.$transaction([
      db.media.findMany({
        where,
        select: {
          id: true,
          title: true,
          series: true,
          season: true,
          episode: true,
          duration: true,
          status: true,
        },
        orderBy: [
          { series: "asc" },
          { season: "asc" },
          { episode: "asc" },
          { createdAt: "desc" },
        ],
        take: 100,
        skip: (query.page - 1) * 100,
      }),
      db.media.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: 100 };
  });
  app.get<{ Params: { id: string } }>(
    "/public/media/:id/playback",
    async (req) => {
      const media = await find(req.params.id);
      const asset = media.assets.find((a) => a.type === "ORIGINAL");
      ensure(asset, 404, "Arquivo indisponível");
      return {
        source: await storage.playbackUrl(asset.storageKey),
        mime: "video/mp4",
        expiresAt: new Date(Date.now() + 120000),
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/public/media/:id/thumbnail",
    async (req, reply) => {
      const media = await find(req.params.id);
      const asset = media.assets.find((a) => a.type === "THUMBNAIL");
      ensure(asset, 404, "Capa indisponível");
      const response = await storage.get(asset.storageKey);
      ensure(response.Body, 502, "Armazenamento indisponível");
      return reply
        .header("Content-Type", "image/jpeg")
        .send(response.Body as Readable);
    },
  );
}
