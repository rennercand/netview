import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
export const token = () => randomBytes(32).toString("base64url");
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const hashPassword = (value: string) =>
  argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
export const verifyPassword = (hash: string, value: string) =>
  argon2.verify(hash, value);
export function equalToken(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function canManage(role: string, globalAdmin: boolean) {
  return globalAdmin || role === "HOST";
}
export function canUpload(
  role: string,
  allowUpload: boolean,
  globalAdmin: boolean,
) {
  return canManage(role, globalAdmin) || allowUpload;
}
