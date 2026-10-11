import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@family/database";
import { hashPassword, hashToken } from "@family/auth";
import { storageFromEnv } from "@family/storage";
import { buildApp } from "../src/app.js";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { Redis } from "ioredis";
import { Queue } from "bullmq";
if (process.env.RUN_INTEGRATION !== "1")
  throw new Error(
    "Execute pelo script run-integration.ts com um banco de TESTE.",
  );
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw new Error("DATABASE_URL deve apontar para banco com sufixo _test.");
const db = new PrismaClient(),
  storage = storageFromEnv(),
  namespace = randomUUID();
const password = "integration-only-password";
const origin = process.env.APP_ORIGIN!;
let app: FastifyInstance, dir: string, fixture: Buffer, worker: ChildProcess;
const users: string[] = [],
  groups: string[] = [],
  keys: string[] = [],
  jobIds: string[] = [];
let admin: string,
  host: string,
  member: string,
  outsider: string,
  pending: string,
  groupA: string,
  groupB: string,
  mediaId: string,
  sessionId: string,
  uploadId: string;
type Login = { cookie: string; csrf: string };
let adminAuth: Login, hostAuth: Login, memberAuth: Login, outsideAuth: Login;
function credentials(response: LightMyRequestResponse): Login {
  const cookies = response.cookies;
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    csrf: cookies.find((c) => c.name === "fs_csrf")!.value,
  };
}
const call = (
  auth: Login,
  method: "GET" | "POST" | "PUT" | "PATCH",
  url: string,
  body?: Record<string, unknown>,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { cookie: auth.cookie, origin, "x-csrf-token": auth.csrf },
    payload: body,
  });
async function login(id: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id } });
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin },
    payload: { email: u.email, password },
  });
  expect(r.statusCode).toBe(200);
  return credentials(r);
}
async function createUser(
  name: string,
  isAdmin = false,
  status: "ACTIVE" | "PENDING" = "ACTIVE",
) {
  const u = await db.user.create({
    data: {
      email: `${namespace}-${name}@example.test`,
      name,
      passwordHash: await hashPassword(password),
      isAdmin,
      status,
    },
  });
  users.push(u.id);
  return u.id;
}
beforeAll(async () => {
  await storage.ready();
  dir = await mkdtemp(join(tmpdir(), "family-integration-"));
  const input = join(dir, "fixture.mp4");
  await promisify(execFile)("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x240:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input,
  ]);
  fixture = await readFile(input);
  admin = await createUser("admin", true);
  host = await createUser("host");
  member = await createUser("member");
  outsider = await createUser("outside");
  pending = await createUser("pending", false, "PENDING");
  groupA = (
    await db.household.create({
      data: {
        name: `${namespace}-A`,
        ownerId: host,
        memberships: {
          create: [
            { userId: host, role: "HOST" },
            { userId: member, role: "MEMBER" },
          ],
        },
      },
    })
  ).id;
  groupB = (
    await db.household.create({
      data: {
        name: `${namespace}-B`,
        ownerId: outsider,
        memberships: { create: { userId: outsider, role: "HOST" } },
      },
    })
  ).id;
  groups.push(groupA, groupB);
  app = await buildApp(
    db,
    storage,
    {
      NODE_ENV: "test",
      APP_ORIGIN: origin,
      DATABASE_URL: process.env.DATABASE_URL!,
      REDIS_URL: process.env.REDIS_URL!,
      PORT: 3000,
    },
    { rateLimitNamespace: `integration:${namespace}:` },
  );
  await app.ready();
  adminAuth = await login(admin);
  hostAuth = await login(host);
  memberAuth = await login(member);
  outsideAuth = await login(outsider);
  worker = spawn("pnpm", ["--filter", "@family/worker", "start"], {
    stdio: "ignore",
    env: process.env,
    detached: true,
  });
});
afterAll(async () => {
  if (worker) {
    if (worker.pid) process.kill(-worker.pid, "SIGTERM");
    await new Promise<void>((resolve) => {
      if (worker.exitCode !== null) resolve();
      else {
        worker.once("exit", () => resolve());
        const timer = setTimeout(() => {
          if (worker.pid)
            try {
              process.kill(-worker.pid, "SIGKILL");
            } catch {
              /* process already exited */
            }
          resolve();
        }, 5000);
        timer.unref();
      }
    });
  }
  if (app) await app.close();
  const connection = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue("media", { connection });
  for (const id of jobIds) {
    const job = await queue.getJob(id);
    if (job) await job.remove();
  }
  await queue.close();
  await connection.quit();
  const medias = await db.media.findMany({
    where: { groupId: { in: groups } },
    include: { assets: true, uploads: true },
  });
  for (const m of medias) {
    for (const a of m.assets) keys.push(a.storageKey);
    for (const u of m.uploads) {
      if (u.storageUploadId)
        await storage.abort(u.storageKey, u.storageUploadId);
      keys.push(u.storageKey);
    }
  }
  for (const key of new Set(keys)) await storage.remove(key);
  await db.processingJob.deleteMany({
    where: { mediaId: { in: medias.map((m) => m.id) } },
  });
  await db.uploadSession.deleteMany({
    where: { mediaId: { in: medias.map((m) => m.id) } },
  });
  await db.media.deleteMany({ where: { groupId: { in: groups } } });
  await db.accessRequest.deleteMany({ where: { userId: { in: users } } });
  await db.household.deleteMany({ where: { id: { in: groups } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
  storage.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
describe.sequential("MVP real: PostgreSQL, Redis, MinIO e FFmpeg", () => {
  it("health e readiness verificam serviços reais", async () => {
    expect((await app.inject("/api/v1/health")).statusCode).toBe(200);
    expect((await app.inject("/api/v1/ready")).statusCode).toBe(200);
  });
  it("anônimo e usuário pendente não acessam biblioteca", async () => {
    expect((await app.inject("/api/v1/media")).statusCode).toBe(401);
    const u = await db.user.findUniqueOrThrow({ where: { id: pending } });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          headers: { origin },
          payload: { email: u.email, password },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("cookies HttpOnly e tokens persistidos apenas como hashes", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin },
      payload: { email: `${namespace}-member@example.test`, password },
    });
    expect(r.cookies.find((c) => c.name === "fs_session")?.httpOnly).toBe(true);
    const c = credentials(r);
    const raw = c.cookie.match(/fs_session=([^;]+)/)![1];
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(raw) },
    });
    sessionId = session.id;
    expect(session.tokenHash).not.toBe(raw);
  });
  it("bloqueia CSRF e Origin ausente", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: { cookie: memberAuth.cookie, origin },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it("ADMIN aprova conta; HOST e MEMBER não aprovam pedido global", async () => {
    const email = `${namespace}-request@example.test`;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/access-requests",
          headers: { origin },
          payload: { email, name: "Familiar", password },
        })
      ).statusCode,
    ).toBe(202);
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    users.push(u.id);
    const request = await db.accessRequest.findFirstOrThrow({
      where: { userId: u.id },
    });
    expect(
      (
        await call(
          memberAuth,
          "POST",
          `/admin/access-requests/${request.id}/approve`,
          { groupId: groupA },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          hostAuth,
          "POST",
          `/admin/access-requests/${request.id}/approve`,
          { groupId: groupA },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          adminAuth,
          "POST",
          `/admin/access-requests/${request.id}/approve`,
          { groupId: groupA },
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).status,
    ).toBe("ACTIVE");
    expect(
      (
        await call(
          adminAuth,
          "POST",
          `/admin/access-requests/${request.id}/approve`,
          { groupId: groupA },
        )
      ).statusCode,
    ).toBe(409);
  });
  it("HOST não gerencia outro grupo; membro não envia sem permissão", async () => {
    expect(
      (await call(hostAuth, "GET", `/households/${groupB}/members`)).statusCode,
    ).toBe(404);
    expect(
      (
        await call(memberAuth, "POST", "/uploads/init", {
          groupId: groupA,
          filename: "video.mp4",
          size: fixture.length,
        })
      ).statusCode,
    ).toBe(403);
  });
  it("upload direto real pode ser retomado e gera job persistido", async () => {
    const init = await call(hostAuth, "POST", "/uploads/init", {
      groupId: groupA,
      filename: "Minha Série - S01E02 - Festa.mp4",
      size: fixture.length,
    });
    expect(init.statusCode).toBe(201);
    uploadId = init.json().id;
    mediaId = init.json().mediaId;
    const u = await db.uploadSession.findUniqueOrThrow({
      where: { id: uploadId },
    });
    keys.push(u.storageKey);
    expect(u.storageKey).not.toContain("Festa");
    expect(
      (await call(outsideAuth, "GET", `/uploads/${uploadId}`)).statusCode,
    ).toBe(404);
    const { url } = (
      await call(hostAuth, "POST", `/uploads/${uploadId}/part-url`, {
        partNumber: 1,
      })
    ).json();
    const put = await fetch(url, {
      method: "PUT",
      body: new Uint8Array(fixture),
      headers: { Origin: origin },
    });
    expect(
      put.headers.get("access-control-expose-headers")?.toLowerCase(),
    ).toContain("etag");
    expect(put.ok).toBe(true);
    const etag = put.headers.get("etag")!;
    const resumed = await call(hostAuth, "GET", `/uploads/${uploadId}`);
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(resumed.json().parts).toHaveLength(1);
    expect(
      (
        await call(hostAuth, "POST", `/uploads/${uploadId}/complete`, {
          parts: [{ partNumber: 1, etag: "wrong" }],
        })
      ).statusCode,
    ).toBe(400);
    const complete = await call(
      hostAuth,
      "POST",
      `/uploads/${uploadId}/complete`,
      { parts: [{ partNumber: 1, etag }] },
    );
    expect(complete.statusCode).toBe(200);
    const job = await db.processingJob.findFirstOrThrow({ where: { mediaId } });
    jobIds.push(job.id);
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (
        (await db.media.findUniqueOrThrow({ where: { id: mediaId } }))
          .status === "READY"
      )
        break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const media = await db.media.findUniqueOrThrow({ where: { id: mediaId } });
    expect(media.status).toBe("READY");
    expect(media.series).toBe("Minha Série");
    expect(media.season).toBe(1);
    expect(media.episode).toBe(2);
    expect(media.videoCodec).toBe("h264");
    expect(media.duration).toBeGreaterThan(1);
    expect(
      (await db.processingJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe("DONE");
  });
  it("bucket é privado e CORS de upload expõe ETag", async () => {
    const u = await db.uploadSession.findUniqueOrThrow({
      where: { id: uploadId },
    });
    const response = await fetch(
      `${process.env.S3_PUBLIC_ENDPOINT}/${process.env.S3_BUCKET}/${u.storageKey}`,
    );
    expect(response.status).toBe(403);
    const { url } = await storage
      .partUrl(u.storageKey, u.storageUploadId!, 1)
      .then((url) => ({ url }));
    const cors = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(cors.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("codec incompatível é identificado sem simular transcodificação", async () => {
    const path = join(dir, "incompatible.mp4");
    await promisify(execFile)("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=160x120:d=1",
      "-c:v",
      "mpeg4",
      path,
    ]);
    const bytes = await readFile(path);
    const init = (
      await call(hostAuth, "POST", "/uploads/init", {
        groupId: groupA,
        filename: "Antigo.mp4",
        size: bytes.length,
      })
    ).json();
    const { url } = (
      await call(hostAuth, "POST", `/uploads/${init.id}/part-url`, {
        partNumber: 1,
      })
    ).json();
    const r = await fetch(url, { method: "PUT", body: new Uint8Array(bytes) });
    expect(r.ok).toBe(true);
    expect(
      (
        await call(hostAuth, "POST", `/uploads/${init.id}/complete`, {
          parts: [{ partNumber: 1, etag: r.headers.get("etag") }],
        })
      ).statusCode,
    ).toBe(200);
    const job = await db.processingJob.findFirstOrThrow({
      where: { mediaId: init.mediaId },
    });
    jobIds.push(job.id);
    for (let i = 0; i < 120; i++) {
      if (
        (await db.media.findUniqueOrThrow({ where: { id: init.mediaId } }))
          .status === "INCOMPATIBLE"
      )
        break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const media = await db.media.findUniqueOrThrow({
      where: { id: init.mediaId },
    });
    expect(media.status).toBe("INCOMPATIBLE");
    expect(media.processingError).toContain("Codec incompatível");
    expect(
      (
        await call(
          memberAuth,
          "POST",
          `/media/${init.mediaId}/playback-session`,
          {},
        )
      ).statusCode,
    ).toBe(409);
  });
  it("upload expirado é limpo pelo worker e devolve reserva", async () => {
    const before = await db.household.findUniqueOrThrow({
      where: { id: groupA },
    });
    const init = (
      await call(hostAuth, "POST", "/uploads/init", {
        groupId: groupA,
        filename: "Expirado.mp4",
        size: fixture.length,
      })
    ).json();
    await db.uploadSession.update({
      where: { id: init.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await call(hostAuth, "POST", `/uploads/${init.id}/part-url`, {
          partNumber: 1,
        })
      ).statusCode,
    ).toBe(409);
    for (let i = 0; i < 40; i++) {
      if (
        (await db.uploadSession.findUniqueOrThrow({ where: { id: init.id } }))
          .status === "ABORTED"
      )
        break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(
      (await db.uploadSession.findUniqueOrThrow({ where: { id: init.id } }))
        .status,
    ).toBe("ABORTED");
    expect(
      (await db.household.findUniqueOrThrow({ where: { id: groupA } }))
        .reservedBytes,
    ).toBe(before.reservedBytes);
  });
  it("isolamento de grupo impede IDOR em catálogo, playback, bytes, capas e progresso", async () => {
    const list = await call(outsideAuth, "GET", "/media");
    expect(
      list.json().items.some((m: { id: string }) => m.id === mediaId),
    ).toBe(false);
    for (const suffix of ["", "/content", "/thumbnail"])
      expect(
        (await call(outsideAuth, "GET", `/media/${mediaId}${suffix}`))
          .statusCode,
      ).toBe(404);
    expect(
      (
        await call(
          outsideAuth,
          "POST",
          `/media/${mediaId}/playback-session`,
          {},
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(outsideAuth, "PUT", `/media/${mediaId}/progress`, {
          position: 1,
        })
      ).statusCode,
    ).toBe(404);
  });
  it("MP4 privado suporta seek, 206, Content-Range e intervalo inválido", async () => {
    const playback = await call(
      memberAuth,
      "POST",
      `/media/${mediaId}/playback-session`,
      {},
    );
    expect(playback.statusCode).toBe(200);
    const signed = playback.json();
    expect(signed.delivery).toBe("direct");
    const direct = await fetch(signed.source, {
      headers: { Range: "bytes=10-99" },
    });
    expect(direct.status).toBe(206);
    expect(Buffer.from(await direct.arrayBuffer())).toEqual(
      fixture.subarray(10, 100),
    );
    expect(new URL(signed.source).searchParams.get("X-Amz-Expires")).toBe(
      "120",
    );
    const r = await app.inject({
      url: `/api/v1/media/${mediaId}/content`,
      headers: { cookie: memberAuth.cookie, range: "bytes=10-99" },
    });
    expect(r.statusCode).toBe(206);
    expect(r.headers["content-range"]).toBe(`bytes 10-99/${fixture.length}`);
    expect(r.headers["accept-ranges"]).toBe("bytes");
    expect(r.rawPayload).toEqual(fixture.subarray(10, 100));
    const invalid = await app.inject({
      url: `/api/v1/media/${mediaId}/content`,
      headers: { cookie: memberAuth.cookie, range: `bytes=${fixture.length}-` },
    });
    expect(invalid.statusCode).toBe(416);
    expect(
      (await call(memberAuth, "GET", `/media/${mediaId}/thumbnail`)).statusCode,
    ).toBe(200);
  });
  it("progresso é persistido e permissão granular de mídia bloqueia acesso", async () => {
    expect(
      (
        await call(memberAuth, "PUT", `/media/${mediaId}/progress`, {
          position: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await db.watchProgress.findUniqueOrThrow({
          where: { userId_mediaId: { userId: member, mediaId } },
        })
      ).position,
    ).toBe(1);
    await db.mediaPermission.create({
      data: { mediaId, userId: member, canView: false },
    });
    expect(
      (await call(memberAuth, "GET", `/media/${mediaId}/content`)).statusCode,
    ).toBe(404);
    await db.mediaPermission.delete({
      where: { mediaId_userId: { mediaId, userId: member } },
    });
  });
  it("revogar sessão impede emissão e acesso a bytes", async () => {
    const c = await login(member);
    const raw = c.cookie.match(/fs_session=([^;]+)/)![1];
    const s = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(raw) },
    });
    expect(
      (await call(memberAuth, "POST", `/sessions/${s.id}/revoke`, {}))
        .statusCode,
    ).toBe(200);
    expect(
      (await call(c, "POST", `/media/${mediaId}/playback-session`, {}))
        .statusCode,
    ).toBe(401);
    expect((await call(c, "GET", `/media/${mediaId}/content`)).statusCode).toBe(
      401,
    );
    expect(sessionId).toBeTruthy();
  });
  it("cancelamento é idempotente e libera quota reservada", async () => {
    const init = await call(hostAuth, "POST", "/uploads/init", {
      groupId: groupA,
      filename: "Cancelado.mp4",
      size: fixture.length,
    });
    const id = init.json().id;
    expect(
      (await call(hostAuth, "POST", `/uploads/${id}/abort`, {})).statusCode,
    ).toBe(200);
    expect(
      (await call(hostAuth, "POST", `/uploads/${id}/abort`, {})).statusCode,
    ).toBe(200);
    expect(
      (await db.household.findUniqueOrThrow({ where: { id: groupA } }))
        .reservedBytes,
    ).toBe(0n);
  });
  it("quota é atômica e dispositivo não pareado não possui acesso", async () => {
    await db.household.update({
      where: { id: groupB },
      data: { quotaBytes: 1n },
    });
    expect(
      (
        await call(outsideAuth, "POST", "/uploads/init", {
          groupId: groupB,
          filename: "Quota.mp4",
          size: fixture.length,
        })
      ).statusCode,
    ).toBe(413);
    expect(
      (
        await app.inject({
          url: "/api/v1/media",
          headers: { cookie: "fs_session=unpaired-device" },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("revogar associação remove acesso mesmo com sessão válida", async () => {
    expect(
      (
        await call(
          hostAuth,
          "PATCH",
          `/households/${groupA}/members/${member}`,
          { active: false },
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call(memberAuth, "GET", `/media/${mediaId}/content`)).statusCode,
    ).toBe(404);
  });
});
