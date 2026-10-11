import { z } from "zod";
export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});
export const requestSchema = loginSchema.extend({
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(100),
});
export const uploadSchema = z.object({
  groupId: z.string().uuid(),
  filename: z
    .string()
    .min(1)
    .max(240)
    .regex(/\.mp4$/i),
  size: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 ** 3),
});
export const partSchema = z.object({
  partNumber: z.number().int().min(1).max(10000),
});
export const completionSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        etag: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[\w"-]+$/),
      }),
    )
    .min(1)
    .max(10000),
});
export const PART_SIZE = 10 * 1024 * 1024;
export function parseFilename(filename: string) {
  const base = filename
    .replace(/.*[\\/]/, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\.[^.]+$/, "");
  const match = /^(.+?)[ ._-]+S(\d{1,3})E(\d{1,4})(?:[ ._-]+(.+))?$/i.exec(
    base,
  );
  if (!match)
    return {
      title: base.replace(/[._]/g, " ").trim(),
      series: null,
      season: null,
      episode: null,
    };
  return {
    series: match[1].replace(/[._]/g, " ").trim(),
    season: Number(match[2]),
    episode: Number(match[3]),
    title:
      match[4]?.replace(/[._]/g, " ").trim() || `Episódio ${Number(match[3])}`,
  };
}
export function sanitizeFilename(filename: string) {
  return filename
    .replace(/.*[\\/]/, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 240);
}

export const PROCESSING_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
} as const;
