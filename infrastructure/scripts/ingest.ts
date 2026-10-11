import { createReadStream } from "node:fs";
import { stat, readdir } from "node:fs/promises";
import { basename, resolve, join } from "node:path";
import { Readable } from "node:stream";
const args = process.argv.slice(2);
const value = (flag: string) => args[args.indexOf(flag) + 1];
if (!args.includes("--path") || !args.includes("--group"))
  throw new Error(
    "Uso: pnpm ingest --path /pasta/ou/video.mp4 --group UUID [--resume UPLOAD_UUID]",
  );
const origin = process.env.INGEST_API_ORIGIN || process.env.APP_ORIGIN;
if (!origin || !process.env.INGEST_EMAIL || !process.env.INGEST_PASSWORD)
  throw new Error(
    "Defina INGEST_API_ORIGIN, INGEST_EMAIL e INGEST_PASSWORD no ambiente do computador de envio. Não inclua senha em argumentos.",
  );
const url = new URL(origin);
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw new Error("Ingestão remota exige HTTPS.");
let cookie = "",
  csrf = "";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: process.env.APP_ORIGIN || origin!,
      ...(cookie ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  if (path === "/auth/login") {
    const cookies = response.headers.getSetCookie().map((s) => s.split(";")[0]);
    cookie = cookies.join("; ");
    csrf = cookies.find((s) => s.startsWith("fs_csrf="))?.slice(8) || "";
  }
  return data as T;
}
async function* files(path: string): AsyncGenerator<string> {
  const info = await stat(path);
  if (info.isFile()) {
    if (/\.mp4$/i.test(path)) yield path;
    return;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) yield* files(p);
    else if (entry.isFile() && /\.mp4$/i.test(p)) yield p;
  }
}
await api("/auth/login", {
  email: process.env.INGEST_EMAIL,
  password: process.env.INGEST_PASSWORD,
});
try {
  const path = resolve(value("--path"));
  const resume = args.includes("--resume") ? value("--resume") : undefined;
  if (resume && !(await stat(path)).isFile())
    throw new Error("--resume aceita somente um arquivo.");
  let count = 0;
  for await (const file of files(path)) {
    const info = await stat(file);
    type Upload = {
      id: string;
      partSize: number;
      filename?: string;
      size?: string;
      parts?: { partNumber: number; etag: string }[];
    };
    const upload = resume
      ? await api<Upload>(`/uploads/${resume}`)
      : await api<Upload>("/uploads/init", {
          groupId: value("--group"),
          filename: basename(file),
          size: info.size,
        });
    console.log(`Upload ${upload.id}: ${basename(file)}`);
    if (
      upload.filename &&
      (upload.filename !== basename(file) || Number(upload.size) !== info.size)
    )
      throw new Error("Arquivo de retomada divergente.");
    const parts: { partNumber: number; etag: string }[] = [];
    for (
      let start = 0, partNumber = 1;
      start < info.size;
      start += upload.partSize, partNumber++
    ) {
      const existing = upload.parts?.find((p) => p.partNumber === partNumber);
      if (existing) {
        parts.push(existing);
        continue;
      }
      const end = Math.min(info.size - 1, start + upload.partSize - 1);
      const { url } = await api<{ url: string }>(
        `/uploads/${upload.id}/part-url`,
        { partNumber },
      );
      const stream = createReadStream(file, {
        start,
        end,
        highWaterMark: 256 * 1024,
      });
      const request: RequestInit & { duplex: "half" } = {
        method: "PUT",
        duplex: "half",
        body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        headers: { "Content-Length": String(end - start + 1) },
      };
      const response = await fetch(url, request);
      if (!response.ok)
        throw new Error(
          `Parte ${partNumber} falhou. Retome com --resume ${upload.id}`,
        );
      const etag = response.headers.get("etag");
      if (!etag) throw new Error("Storage não retornou ETag.");
      parts.push({ partNumber, etag });
    }
    await api(`/uploads/${upload.id}/complete`, { parts });
    console.log(
      "Enviado diretamente para storage privado; processamento agendado.",
    );
    count++;
  }
  if (!count) throw new Error("Nenhum arquivo MP4 encontrado.");
} finally {
  await api("/auth/logout", {}).catch(() => {});
}
