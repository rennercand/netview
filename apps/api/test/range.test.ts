import { describe, it, expect } from "vitest";
import { parseRange } from "../src/media.js";
describe("HTTP Range", () => {
  it("preserva download completo", () =>
    expect(parseRange(undefined, 100)).toBeUndefined());
  it("resolve intervalos e sufixos", () => {
    expect(parseRange("bytes=10-19", 100)).toBe("bytes=10-19");
    expect(parseRange("bytes=50-", 100)).toBe("bytes=50-99");
    expect(parseRange("bytes=-20", 100)).toBe("bytes=80-99");
    expect(parseRange("bytes=0-1000", 100)).toBe("bytes=0-99");
  });
  it.each([
    "bytes=100-",
    "bytes=10-1",
    "bytes=-0",
    "bytes=",
    "bytes=0-1,4-5",
    "items=0-2",
  ])("rejeita %s", (range) => expect(() => parseRange(range, 100)).toThrow());
});
