import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  token,
  equalToken,
  canUpload,
  canManage,
} from "./index.js";
describe("autenticação", () => {
  it("usa Argon2id e rejeita senha errada", async () => {
    const hash = await hashPassword("test-password-never-admin");
    expect(hash).toContain("$argon2id$");
    expect(await verifyPassword(hash, "test-password-never-admin")).toBe(true);
    expect(await verifyPassword(hash, "incorrect")).toBe(false);
  });
  it("tokens aleatórios são armazenados como hashes", () => {
    const raw = token();
    expect(token()).not.toBe(raw);
    expect(hashToken(raw)).toHaveLength(64);
    expect(hashToken(raw)).not.toBe(raw);
    expect(equalToken(raw, raw)).toBe(true);
    expect(equalToken(raw, token())).toBe(false);
  });
  it("membro exige permissão granular de upload", () => {
    expect(canUpload("MEMBER", false, false)).toBe(false);
    expect(canUpload("MEMBER", true, false)).toBe(true);
    expect(canManage("HOST", false)).toBe(true);
    expect(canManage("MEMBER", false)).toBe(false);
  });
});
