import { z } from "zod";
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  PUBLIC_LIBRARY_GROUP_ID: z.string().uuid().optional(),
  MVP_OPEN_UPLOADS: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export function loadConfig() {
  const c = envSchema.parse(process.env);
  if (c.NODE_ENV === "production" && !c.APP_ORIGIN.startsWith("https://"))
    throw new Error("HTTPS obrigatório em produção");
  return c;
}
export type Config = ReturnType<typeof loadConfig>;
