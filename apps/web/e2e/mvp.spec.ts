import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../../../packages/database/src/index.js";
import { hashPassword } from "../../../packages/auth/src/index.js";
import { storageFromEnv } from "../../../packages/storage/src/index.js";
// Never uses a production account or dumps credentials to artifacts.
if (
  process.env.RUN_E2E !== "1" ||
  !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")
)
  throw new Error("Execute run-e2e.ts usando banco de teste.");
const db = new PrismaClient(),
  storage = storageFromEnv();
let worker: ChildProcess;
let groupId: string, adminId: string, dir: string;
const email = `e2e-${randomUUID()}@example.test`,
  password = randomUUID() + randomUUID();
test.beforeAll(async () => {
  const admin = await db.user.create({
    data: {
      name: "Administrador E2E",
      email,
      passwordHash: await hashPassword(password),
      status: "ACTIVE",
      isAdmin: true,
    },
  });
  adminId = admin.id;
  groupId = (
    await db.household.create({
      data: {
        id: process.env.PUBLIC_LIBRARY_GROUP_ID,
        name: "Família E2E",
        ownerId: admin.id,
        memberships: { create: { userId: admin.id, role: "HOST" } },
      },
    })
  ).id;
  dir = await mkdtemp(join(tmpdir(), "family-e2e-"));
  await promisify(execFile)("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x240:d=4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=4",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    join(dir, "Família - S01E02 - Festa.mp4"),
  ]);
  worker = spawn("pnpm", ["--filter", "@family/worker", "start"], {
    stdio: "ignore",
    env: process.env,
    detached: true,
  });
});
test.afterAll(async () => {
  if (worker?.pid) {
    try {
      process.kill(-worker.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
    await new Promise<void>((resolve) => {
      if (worker.exitCode !== null) resolve();
      else worker.once("exit", () => resolve());
    });
  }
  const media = await db.media.findMany({
    where: { groupId },
    include: { assets: true, uploads: true },
  });
  for (const item of media) {
    for (const asset of item.assets) await storage.remove(asset.storageKey);
    for (const upload of item.uploads) {
      if (upload.storageUploadId)
        await storage.abort(upload.storageKey, upload.storageUploadId);
      await storage.remove(upload.storageKey);
    }
  }
  await db.uploadSession.deleteMany({ where: { media: { groupId } } });
  await db.media.deleteMany({ where: { groupId } });
  await db.household.delete({ where: { id: groupId } });
  await db.user.delete({ where: { id: adminId } });
  await db.$disconnect();
  storage.close();
  await rm(dir, { recursive: true, force: true });
});
test("áreas sem login: envio direto, edição, série e reprodução", async ({
  page,
}) => {
  await page.goto("/upload");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page
    .getByLabel("Arquivo MP4")
    .setInputFiles(join(dir, "Família - S01E02 - Festa.mp4"));
  await page.getByRole("button", { name: "Enviar / retomar" }).click();
  await expect(
    page.getByText("Upload concluído. Extraindo metadados e capa…"),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText("Família - S01E02 - Festa.mp4 · READY"),
  ).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Título", { exact: true }).fill("Festa editada");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();
  await page.goto("/");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Biblioteca", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Família · Temporada 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar arquivo", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reproduzir", exact: true }).click();
  await expect(page.locator("video")).toBeVisible();
  await page
    .locator("video")
    .evaluate((video: HTMLVideoElement) => video.play());
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.goto("/manage");
  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
