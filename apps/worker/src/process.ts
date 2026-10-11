import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrismaClient } from "@family/database";
import type { PrivateStorage } from "@family/storage";
const execute = promisify(execFile);
type Probe = {
  format: { duration?: string; format_name?: string };
  streams: {
    codec_type: string;
    codec_name?: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
  }[];
};
export async function processMedia(
  db: PrismaClient,
  storage: PrivateStorage,
  id: string,
) {
  const media = await db.media.findUniqueOrThrow({
    where: { id },
    include: { assets: true },
  });
  if (media.status !== "PROCESSING" && media.status !== "FAILED") return;
  const original = media.assets.find((a) => a.type === "ORIGINAL");
  if (!original) throw new Error("Original ausente");
  const head = await storage.head(original.storageKey);
  if (head.ContentLength !== Number(media.size))
    throw new Error("Tamanho do original divergente");
  const header = await storage.get(original.storageKey, "bytes=0-11");
  const magic = Buffer.from(await header.Body!.transformToByteArray());
  if (magic.subarray(4, 8).toString() !== "ftyp")
    throw new Error("Arquivo não é um contêiner MP4 válido");
  // URLs known to the storage adapter only; filenames never become commands or URLs.
  // Neither original video files nor signed URLs are persisted to local disk or logs.
  const common = [
    "-protocol_whitelist",
    "http,https,tcp,tls,pipe",
    "-rw_timeout",
    "30000000",
    "-f",
    "mov",
    "-enable_drefs",
    "0",
  ];
  const result = await execute(
    "ffprobe",
    [
      "-v",
      "error",
      ...common,
      "-analyzeduration",
      "5000000",
      "-probesize",
      "5000000",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      await storage.processingUrl(original.storageKey),
    ],
    { timeout: 60000, maxBuffer: 1024 * 1024 },
  ).catch(() => {
    throw new Error("FFprobe remoto falhou; verifique container e arquivo.");
  });
  const probe = JSON.parse(result.stdout) as Probe;
  const video = probe.streams.find((s) => s.codec_type === "video"),
    audio = probe.streams.filter((s) => s.codec_type === "audio");
  if (!video || !probe.format.format_name?.includes("mp4"))
    throw new Error("Vídeo MP4 ausente");
  const duration = Number(probe.format.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Duração inválida");
  const compatible =
    video.codec_name === "h264" &&
    video.pix_fmt === "yuv420p" &&
    audio.every((a) => a.codec_name === "aac");
  const image = await execute(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      ...common,
      "-ss",
      String(Math.min(1, duration / 2)),
      "-i",
      await storage.processingUrl(original.storageKey),
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      "-threads",
      "2",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ],
    { timeout: 60000, maxBuffer: 1024 * 1024, encoding: "buffer" },
  ).catch(() => {
    throw new Error("FFmpeg remoto falhou; verifique container e arquivo.");
  });
  const bytes = image.stdout,
    key = `thumbnails/${media.id}.jpg`;
  await storage.put(key, bytes, "image/jpeg");
  await db.media.update({
    where: { id },
    data: {
      duration,
      width: video.width,
      height: video.height,
      videoCodec: video.codec_name,
      audioCodec: audio.map((a) => a.codec_name).join(","),
      status: compatible ? "READY" : "INCOMPATIBLE",
      processingError: compatible
        ? null
        : "Codec incompatível. O MVP requer MP4 H.264 8-bit e AAC; transcodificação ficará para a Fase 3.",
      assets: {
        upsert: {
          where: { mediaId_type: { mediaId: id, type: "THUMBNAIL" } },
          create: {
            type: "THUMBNAIL",
            storageKey: key,
            mime: "image/jpeg",
            size: BigInt(bytes.length),
          },
          update: { size: BigInt(bytes.length) },
        },
      },
    },
  });
}
