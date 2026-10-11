import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { Queue } from "bullmq";
import { PROCESSING_JOB_OPTIONS } from "@family/shared";
import { Redis } from "ioredis";
import type { PrismaClient } from "@family/database";
import type { PrivateStorage } from "@family/storage";
import type { Config } from "./config.js";
import { installAuth } from "./auth.js";
import { accountRoutes } from "./accounts.js";
import { uploadRoutes } from "./uploads.js";
import { mediaRoutes } from "./media.js";
import { publicRoutes } from "./public.js";
export async function buildApp(
  db: PrismaClient,
  storage: PrivateStorage,
  config: Config,
  options: { rateLimitNamespace?: string } = {},
) {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });
  const app = Fastify({
    logger:
      config.NODE_ENV !== "test"
        ? {
            level: "info",
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
            ],
            serializers: {
              req: (req: { method: string; url: string }) => ({
                method: req.method,
                path: req.url.split("?")[0],
              }),
            },
          }
        : false,
    trustProxy:
      process.env.TRUSTED_PROXY_CIDRS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) || false,
    bodyLimit: 128 * 1024,
  });
  const queue = new Queue("media", { connection: redis });
  queue.on("error", (error) =>
    app.log.error({ name: error.name }, "Erro na fila"),
  );
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    redis,
    nameSpace: options.rateLimitNamespace || "family-stream:",
    skipOnError: false,
  });
  if (config.NODE_ENV === "development") {
    await app.register(swagger, {
      openapi: { info: { title: "Family Stream", version: "0.1.0" } },
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }
  app.setErrorHandler((error, req, reply) => {
    const failure = error instanceof Error ? error : new Error("Falha interna");
    const status =
      error instanceof ZodError
        ? 400
        : (error as { statusCode?: number }).statusCode || 500;
    if (status >= 500)
      req.log.error(
        { name: failure.name, code: (error as { code?: string }).code },
        "Falha interna",
      );
    if ((error as { code?: string }).code === "P2002")
      return reply.code(409).send({
        error: { code: "CONFLICT", message: "Registro já existente" },
      });
    return reply.code(status).send({
      error: {
        code: status === 400 ? "VALIDATION" : `HTTP_${status}`,
        message:
          status >= 500 ? "Erro interno. Tente novamente." : failure.message,
      },
    });
  });
  app.addHook("preSerialization", async (_req, _reply, payload) =>
    JSON.parse(
      JSON.stringify(payload, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ),
  );
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.url.startsWith("/api/"))
      reply.header("Cache-Control", "private, no-store");
    return payload;
  });
  await app.register(
    async (api) => {
      installAuth(api, db, config.APP_ORIGIN, {
        openUploads: config.MVP_OPEN_UPLOADS,
        publicGroupId: config.PUBLIC_LIBRARY_GROUP_ID,
      });
      api.get("/health", () => ({ ok: true }));
      api.get("/ready", async () => {
        await db.$queryRaw`SELECT 1`;
        await redis.ping();
        await storage.ready();
        return { ok: true };
      });
      await accountRoutes(api, db, config);
      uploadRoutes(api, db, storage, async (processingId, mediaId) => {
        await queue.add(
          "probe",
          { processingId, mediaId },
          { ...PROCESSING_JOB_OPTIONS, jobId: processingId },
        );
      });
      mediaRoutes(api, db, storage);
      publicRoutes(api, db, storage, config);
    },
    { prefix: "/api/v1" },
  );
  app.addHook("onClose", async () => {
    await queue.close();
    await redis.quit();
  });
  return app;
}
