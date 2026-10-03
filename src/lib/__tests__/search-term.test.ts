import { describe, it, expect } from "vitest";
import { sanitizeSearchTerm } from "@/lib/search-term";

describe("sanitizeSearchTerm", () => {
  it("preserva acento e cedilha — o produto é em português", () => {
    expect(sanitizeSearchTerm("Análise de planta térrea")).toBe("Análise de planta térrea");
    expect(sanitizeSearchTerm("construção")).toBe("construção");
  });

  it.each([
    ["vírgula", "sala, cozinha"],
    ["parêntese", "sala (ampla)"],
    ["asterisco do PostgREST", "sala*"],
    ["aspas", 'sala "clara"'],
    ["ponto e vírgula", "sala; cozinha"],
  ])("remove %s, que é sintaxe do filtro", (_rotulo, termo) => {
    const limpo = sanitizeSearchTerm(termo);
    for (const c of [",", "(", ")", "*", '"', ";"]) expect(limpo).not.toContain(c);
  });

  it("mantém o que compõe e-mail e identificador", () => {
    expect(sanitizeSearchTerm("joao@escritorio.com.br")).toBe("joao@escritorio.com.br");
    expect(sanitizeSearchTerm("planta_terreo-v2")).toBe("planta_terreo-v2");
  });

  it("apara as pontas, para o mínimo de caracteres contar o que é real", () => {
    expect(sanitizeSearchTerm("   sala   ")).toBe("sala");
    expect(sanitizeSearchTerm("((( ")).toBe("");
  });

  it("um termo só de pontuação vira vazio e não dispara busca", () => {
    expect(sanitizeSearchTerm(",,,").length).toBe(0);
  });
});
