import { describe, it, expect } from "vitest";
import { parseFilename, sanitizeFilename, uploadSchema } from "./index.js";
describe("organização por nomes", () => {
  it("extrai série, temporada, episódio e título", () =>
    expect(parseFilename("Minha Série - S02E03 - Aniversário.mp4")).toEqual({
      series: "Minha Série",
      season: 2,
      episode: 3,
      title: "Aniversário",
    }));
  it("aceita pontos e underscore", () =>
    expect(parseFilename("Minha.Serie.S01E02.mp4")).toEqual({
      series: "Minha Serie",
      season: 1,
      episode: 2,
      title: "Episódio 2",
    }));
  it("não inventa série para vídeo avulso", () =>
    expect(parseFilename("Viagem_2024.mp4")).toEqual({
      title: "Viagem 2024",
      series: null,
      season: null,
      episode: null,
    }));
  it("remove caminho e caracteres de controle", () =>
    expect(sanitizeFilename("../../festa\x00.mp4")).toBe("festa.mp4"));
  it("rejeita tamanho e extensão indevidos", () =>
    expect(
      uploadSchema.safeParse({
        groupId: "invalid",
        size: -1,
        filename: "video.exe",
      }).success,
    ).toBe(false));
});
