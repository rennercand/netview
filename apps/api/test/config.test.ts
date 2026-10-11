import { describe, it, expect } from "vitest";
import { envSchema } from "../src/config.js";
describe("configuração", () => {
  it("rejeita origem e Redis sem URL", () => {
    expect(
      envSchema.safeParse({
        APP_ORIGIN: "invalid",
        DATABASE_URL: "db",
        REDIS_URL: "invalid",
      }).success,
    ).toBe(false);
  });
});
