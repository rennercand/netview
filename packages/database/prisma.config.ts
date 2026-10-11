import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
// Pure-JS schema engine is an opt-in for restricted development environments.
// Production migrations retain Prisma's standard, verified engine.
export default defineConfig({
  schema: "prisma/schema.prisma",
  ...(process.env.PRISMA_JS_MIGRATIONS === "1"
    ? {
        experimental: { adapter: true },
        engine: "js" as const,
        adapter: async () =>
          new PrismaPg({
            connectionString:
              process.env.DIRECT_URL ||
              process.env.DATABASE_URL ||
              "postgresql://localhost/family_stream",
          }),
      }
    : {
        engine: "classic" as const,
        datasource: {
          url:
            process.env.DATABASE_URL || "postgresql://localhost/family_stream",
          directUrl: process.env.DIRECT_URL,
        },
      }),
});
