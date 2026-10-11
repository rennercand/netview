import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient, Prisma } from "@family/database";
import { hashToken, canManage, canUpload, equalToken } from "@family/auth";
import { ensure } from "./errors.js";
type Identity = Prisma.SessionGetPayload<{
  include: { user: true; device: true };
}>;
declare module "fastify" {
  interface FastifyRequest {
    identity: Identity | null;
    mvpActor: NonNullable<Identity["user"]> | null;
    mvpGroupId: string | null;
  }
}
export function installAuth(
  app: FastifyInstance,
  db: PrismaClient,
  origin: string,
  mvp: { openUploads?: boolean; publicGroupId?: string } = {},
) {
  app.decorateRequest("identity", null);
  app.decorateRequest("mvpActor", null);
  app.decorateRequest("mvpGroupId", null);
  app.addHook("preHandler", async (req) => {
    const path = req.url.split("?")[0];
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (mutating) {
      ensure(req.headers.origin === origin, 403, "Origem não permitida");
      ensure(
        !req.headers["sec-fetch-site"] ||
          req.headers["sec-fetch-site"] !== "cross-site",
        403,
        "Origem não permitida",
      );
    }
    if (
      [
        "/api/v1/health",
        "/api/v1/ready",
        "/api/v1/auth/login",
        "/api/v1/access-requests",
      ].includes(path)
    )
      return;
    if (!path.startsWith("/api/v1")) return;
    if (
      ["GET", "HEAD"].includes(req.method) &&
      path.startsWith("/api/v1/public/")
    )
      return;
    const openRoute =
      (req.method === "GET" &&
        ["/api/v1/households", "/api/v1/uploads", "/api/v1/media"].includes(
          path,
        )) ||
      (req.method === "POST" && path === "/api/v1/uploads/init") ||
      (req.method === "GET" &&
        /^\/api\/v1\/uploads\/[0-9a-f-]+$/i.test(path)) ||
      (req.method === "POST" &&
        /^\/api\/v1\/uploads\/[0-9a-f-]+\/(part-url|complete|abort)$/i.test(
          path,
        )) ||
      (["GET", "PATCH"].includes(req.method) &&
        /^\/api\/v1\/media\/[0-9a-f-]+$/i.test(path));
    if (mvp.openUploads && openRoute) {
      ensure(mvp.publicGroupId, 503, "Grupo de envio não configurado");
      const group = await db.household.findFirst({
        where: {
          id: mvp.publicGroupId,
          owner: { status: "ACTIVE" },
          memberships: { some: { active: true, role: "HOST" } },
        },
        include: { owner: true },
      });
      ensure(group, 503, "Grupo de envio indisponível");
      req.mvpActor = { ...group.owner, isAdmin: false };
      req.mvpGroupId = group.id;
      return;
    }
    const raw = req.cookies.fs_session;
    ensure(raw, 401, "Login necessário");
    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true, device: true },
    });
    ensure(
      session &&
        !session.revokedAt &&
        session.expiresAt > new Date() &&
        session.user?.status === "ACTIVE" &&
        !session.device?.revokedAt,
      401,
      "Sessão inválida",
    );
    req.identity = session;
    if (Date.now() - session.lastUsedAt.getTime() > 300000)
      await db.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    if (mutating) {
      const csrf = req.headers["x-csrf-token"];
      ensure(
        typeof csrf === "string" &&
          equalToken(hashToken(csrf), session.csrfHash),
        403,
        "CSRF inválido",
      );
    }
  });
}
export function user(req: FastifyRequest) {
  if (req.mvpActor) return req.mvpActor;
  ensure(req.identity?.user, 401, "Login necessário");
  return req.identity.user;
}
export async function groupAccess(
  db: PrismaClient,
  req: FastifyRequest,
  groupId: string,
  mode: "view" | "manage" | "upload" = "view",
) {
  if (req.mvpGroupId)
    ensure(groupId === req.mvpGroupId, 404, "Grupo não encontrado");
  const actor = user(req);
  const membership = await db.membership.findUnique({
    where: { userId_groupId: { userId: actor.id, groupId } },
  });
  ensure(actor.isAdmin || membership?.active, 404, "Grupo não encontrado");
  if (mode === "manage")
    ensure(
      canManage(membership?.role || "", actor.isAdmin),
      403,
      "Permissão insuficiente",
    );
  if (mode === "upload")
    ensure(
      canUpload(
        membership?.role || "",
        membership?.allowUpload || false,
        actor.isAdmin,
      ),
      403,
      "Upload não permitido",
    );
  return membership;
}
export async function mediaAccess(
  db: PrismaClient,
  req: FastifyRequest,
  id: string,
) {
  const media = await db.media.findUnique({
    where: { id },
    include: { assets: true },
  });
  ensure(media && media.status !== "DELETED", 404, "Vídeo não encontrado");
  await groupAccess(db, req, media.groupId);
  const permission = await db.mediaPermission.findUnique({
    where: { mediaId_userId: { mediaId: id, userId: user(req).id } },
  });
  ensure(permission?.canView !== false, 404, "Vídeo não encontrado");
  return media;
}
