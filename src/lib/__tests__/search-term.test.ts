import { describe, it, expect } from "vitest";
import { sanitizeSearchTerm, pipelinesMatchingLabel } from "@/lib/search-term";

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

describe("pipelinesMatchingLabel", () => {
  it('"redecorar" acha o pipeline `redecorate` — busca-se o rótulo, não o enum', () => {
    expect(pipelinesMatchingLabel("redecorar")).toContain("redecorate");
  });

  it("casa por pedaço do rótulo e ignora caixa", () => {
    expect(pipelinesMatchingLabel("VÍDEO")).toContain("render_to_video");
    expect(pipelinesMatchingLabel("planta").length).toBeGreaterThan(1);
  });

  it("termo vazio não casa com nada — senão a busca traria o catálogo inteiro", () => {
    expect(pipelinesMatchingLabel("")).toEqual([]);
    expect(pipelinesMatchingLabel("   ")).toEqual([]);
  });

  it('acha sem acento: ninguém digita "análise" com acento na pressa', () => {
    expect(pipelinesMatchingLabel("analise")).toEqual(pipelinesMatchingLabel("análise"));
    expect(pipelinesMatchingLabel("analise").length).toBeGreaterThan(0);
    expect(pipelinesMatchingLabel("video")).toContain("render_to_video");
  });

  it('casa flexão: "redecorar" (barra lateral) × "Redecoração" (rótulo)', () => {
    // Nenhum contém o outro — os dois começam com "redecora".
    expect(pipelinesMatchingLabel("redecorar")).toContain("redecorate");
    expect(pipelinesMatchingLabel("redecoração")).toContain("redecorate");
    expect(pipelinesMatchingLabel("redecoracao")).toContain("redecorate");
  });

  it('não casa por prefixo curto: "plano" não é "planta"', () => {
    const plano = pipelinesMatchingLabel("plano");
    const planta = pipelinesMatchingLabel("planta");
    expect(planta.length).toBeGreaterThan(0);
    expect(plano).not.toEqual(planta);
  });

  it("termo sem correspondência devolve vazio", () => {
    expect(pipelinesMatchingLabel("zzzz")).toEqual([]);
  });

  it("devolve valores do enum, não rótulos — é o que vai para a query", () => {
    for (const id of pipelinesMatchingLabel("planta")) {
      expect(id).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
