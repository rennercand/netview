import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@family/database";
import { SESSION_SECONDS } from "@family/database";
import { hashToken, hashPassword, verifyPassword, token } from "@family/auth";
import { loginSchema, requestSchema } from "@family/shared";
import { z } from "zod";
import { ensure } from "./errors.js";
import { user, groupAccess } from "./auth.js";
import type { Config } from "./config.js";
export async function accountRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  config: Config,
) {
  const dummyHash = await hashPassword(token());
  const audit = (
    actorId: string | null,
    action: string,
    objectId: string | null,
    result = "OK",
  ) => db.auditLog.create({ data: { actorId, action, objectId, result } });
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      const found = await db.user.findUnique({ where: { email: body.email } });
      const valid = await verifyPassword(
        found?.passwordHash || dummyHash,
        body.password,
      );
      if (!found || !valid || found.status !== "ACTIVE") {
        await audit(found?.id || null, "LOGIN", null, "DENIED");
        ensure(false, 401, "Credenciais inválidas ou conta não aprovada");
      }
      const raw = token(),
        csrf = token();
      const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
      await db.session.create({
        data: {
          userId: found.id,
          tokenHash: hashToken(raw),
          csrfHash: hashToken(csrf),
          expiresAt,
        },
      });
      reply.setCookie("fs_session", raw, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_SECONDS,
      });
      reply.setCookie("fs_csrf", csrf, {
        httpOnly: false,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_SECONDS,
      });
      await audit(found.id, "LOGIN", null);
      return { id: found.id, name: found.name, isAdmin: found.isAdmin };
    },
  );
  app.get("/auth/me", async (req) => {
    const actor = user(req);
    return {
      id: actor.id,
      name: actor.name,
      email: actor.email,
      isAdmin: actor.isAdmin,
    };
  });
  app.post("/auth/logout", async (req, reply) => {
    await db.session.update({
      where: { id: req.identity!.id },
      data: { revokedAt: new Date() },
    });
    reply
      .clearCookie("fs_session", { path: "/" })
      .clearCookie("fs_csrf", { path: "/" });
    return { ok: true };
  });
  app.post("/auth/logout-all", async (req) => {
    await db.session.updateMany({
      where: { userId: user(req).id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  });
  app.get("/sessions", async (req) =>
    db.session.findMany({
      where: {
        userId: user(req).id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        deviceId: true,
      },
    }),
  );
  app.post<{ Params: { id: string } }>("/sessions/:id/revoke", async (req) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await db.session.updateMany({
      where: { id, userId: user(req).id },
      data: { revokedAt: new Date() },
    });
    ensure(result.count, 404, "Sessão não encontrada");
    await audit(user(req).id, "SESSION_REVOKED", id);
    return { ok: true };
  });
  app.post(
    "/access-requests",
    { config: { rateLimit: { max: 4, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const body = requestSchema.parse(req.body);
      const existing = await db.user.findUnique({
        where: { email: body.email },
      });
      if (!existing) {
        const passwordHash = await hashPassword(body.password);
        await db.user.create({
          data: {
            email: body.email,
            name: body.name,
            passwordHash,
            requests: { create: {} },
          },
        });
      }
      return reply.code(202).send({
        message: "Solicitação recebida. Aguarde aprovação do administrador.",
      });
    },
  );
  app.get("/households", async (req) =>
    db.household.findMany({
      where: user(req).isAdmin
        ? {}
        : { memberships: { some: { userId: user(req).id, active: true } } },
      select: {
        id: true,
        name: true,
        quotaBytes: true,
        usedBytes: true,
        reservedBytes: true,
        memberships: {
          where: { userId: user(req).id },
          select: { role: true, allowUpload: true },
        },
      },
    }),
  );
  app.get("/admin/access-requests", async (req) => {
    ensure(user(req).isAdmin, 403, "Apenas administrador");
    return db.accessRequest.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  });
  app.post<{ Params: { id: string } }>(
    "/admin/access-requests/:id/approve",
    async (req) => {
      ensure(user(req).isAdmin, 403, "Apenas administrador");
      const id = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          groupId: z.string().uuid(),
          role: z.enum(["HOST", "MEMBER"]).default("MEMBER"),
          allowUpload: z.boolean().default(false),
        })
        .parse(req.body);
      await groupAccess(db, req, body.groupId, "manage");
      await db.$transaction(async (tx) => {
        const request = await tx.accessRequest.findUnique({ where: { id } });
        ensure(request?.status === "PENDING", 409, "Pedido já resolvido");
        const changed = await tx.accessRequest.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: "ACTIVE",
            groupId: body.groupId,
            approvedBy: user(req).id,
          },
        });
        ensure(changed.count === 1, 409, "Pedido já resolvido");
        await tx.user.update({
          where: { id: request.userId },
          data: { status: "ACTIVE" },
        });
        await tx.membership.upsert({
          where: {
            userId_groupId: { userId: request.userId, groupId: body.groupId },
          },
          create: { userId: request.userId, ...body },
          update: {
            role: body.role,
            allowUpload: body.allowUpload,
            active: true,
          },
        });
      });
      await audit(user(req).id, "USER_APPROVED", id);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/admin/access-requests/:id/reject",
    async (req) => {
      ensure(user(req).isAdmin, 403, "Apenas administrador");
      const id = z.string().uuid().parse(req.params.id);
      await db.$transaction(async (tx) => {
        const r = await tx.accessRequest.findUnique({ where: { id } });
        ensure(r?.status === "PENDING", 409, "Pedido já resolvido");
        const changed = await tx.accessRequest.updateMany({
          where: { id, status: "PENDING" },
          data: { status: "REJECTED", approvedBy: user(req).id },
        });
        ensure(changed.count === 1, 409, "Pedido já resolvido");
        await tx.user.update({
          where: { id: r.userId },
          data: { status: "REJECTED" },
        });
      });
      await audit(user(req).id, "USER_REJECTED", id);
      return { ok: true };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/households/:id/members",
    async (req) => {
      const groupId = z.string().uuid().parse(req.params.id);
      await groupAccess(db, req, groupId, "manage");
      return db.membership.findMany({
        where: { groupId },
        select: {
          role: true,
          allowUpload: true,
          active: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              status: true,
              isAdmin: true,
            },
          },
        },
      });
    },
  );
  app.patch<{ Params: { id: string; userId: string } }>(
    "/households/:id/members/:userId",
    async (req) => {
      const groupId = z.string().uuid().parse(req.params.id),
        targetId = z.string().uuid().parse(req.params.userId);
      await groupAccess(db, req, groupId, "manage");
      const body = z
        .object({
          active: z.boolean().optional(),
          allowUpload: z.boolean().optional(),
          role: z.enum(["HOST", "MEMBER"]).optional(),
        })
        .parse(req.body);
      const target = await db.membership.findUnique({
        where: { userId_groupId: { userId: targetId, groupId } },
        include: { user: true },
      });
      ensure(target, 404, "Membro não encontrado");
      ensure(
        !target.user.isAdmin && targetId !== user(req).id,
        403,
        "Não é permitido alterar este membro",
      );
      if (!user(req).isAdmin)
        ensure(
          target.role === "MEMBER" && body.role !== "HOST",
          403,
          "Somente ADMIN gerencia anfitriões",
        );
      await db.membership.update({
        where: { userId_groupId: { userId: targetId, groupId } },
        data: body,
      });
      await audit(user(req).id, "MEMBERSHIP_CHANGED", targetId);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/admin/users/:id/suspend",
    async (req) => {
      ensure(user(req).isAdmin, 403, "Apenas administrador");
      const id = z.string().uuid().parse(req.params.id);
      const target = await db.user.findUnique({ where: { id } });
      ensure(target && !target.isAdmin, 403, "Conta não pode ser suspensa");
      await db.$transaction([
        db.user.update({ where: { id }, data: { status: "SUSPENDED" } }),
        db.session.updateMany({
          where: { userId: id },
          data: { revokedAt: new Date() },
        }),
      ]);
      await audit(user(req).id, "USER_SUSPENDED", id);
      return { ok: true };
    },
  );
  app.get("/devices", async (req) =>
    db.device.findMany({
      where: user(req).isAdmin
        ? {}
        : {
            group: {
              memberships: { some: { userId: user(req).id, active: true } },
            },
          },
      select: {
        id: true,
        name: true,
        type: true,
        groupId: true,
        revokedAt: true,
        lastSeenAt: true,
      },
    }),
  );
  app.post<{ Params: { id: string } }>("/devices/:id/revoke", async (req) => {
    const id = z.string().uuid().parse(req.params.id);
    const device = await db.device.findUnique({ where: { id } });
    ensure(device, 404, "Dispositivo não encontrado");
    await groupAccess(db, req, device.groupId, "manage");
    await db.$transaction([
      db.device.update({ where: { id }, data: { revokedAt: new Date() } }),
      db.session.updateMany({
        where: { deviceId: id },
        data: { revokedAt: new Date() },
      }),
    ]);
    await audit(user(req).id, "DEVICE_REVOKED", id);
    return { ok: true };
  });
  app.get("/admin/audit-logs", async (req) => {
    ensure(user(req).isAdmin, 403, "Apenas administrador");
    return db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  });
}
