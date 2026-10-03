import { describe, it, expect } from "vitest";
import { navSections, adminItems, ALL_SCREENS, isActive, currentLabel } from "@/lib/nav-items";

const sidebar = navSections.flatMap((s) => s.items);

/** Toda rota autenticada que existe hoje. */
const ROTAS = [
  "/app",
  "/app/gerar",
  "/app/gerar/redecorar",
  "/app/gerar/briefing",
  "/app/gerar/analise",
  "/app/gerar/planta",
  "/app/gerar/video",
  "/app/studio",
  "/app/biblioteca",
  "/app/projetos",
  "/app/conta",
  "/app/transparencia",
];

describe("ativação da barra lateral", () => {
  it.each(ROTAS.filter((r) => !["/app/conta", "/app/transparencia"].includes(r)))(
    "%s acende exatamente um item",
    (rota) => {
      expect(sidebar.filter((i) => isActive(i, rota))).toHaveLength(1);
    },
  );

  it('as três telas de planta acendem "Plantas", a entrada agrupada', () => {
    for (const r of ["/app/gerar/briefing", "/app/gerar/analise", "/app/gerar/planta"]) {
      const [ativo] = sidebar.filter((i) => isActive(i, r));
      expect(ativo.label).toBe("Plantas");
    }
  });

  it('"/app" é exato: não acende em toda rota que começa com /app', () => {
    const dashboard = sidebar.find((i) => i.to === "/app")!;
    expect(isActive(dashboard, "/app")).toBe(true);
    expect(isActive(dashboard, "/app/biblioteca")).toBe(false);
  });

  it('"Objetos 3D" é exato: /app/gerar/redecorar não o acende', () => {
    const objetos = sidebar.find((i) => i.to === "/app/gerar")!;
    expect(isActive(objetos, "/app/gerar")).toBe(true);
    expect(isActive(objetos, "/app/gerar/redecorar")).toBe(false);
  });

  it("uma rota de detalhe acende o item da lista", () => {
    const projetos = sidebar.find((i) => i.to === "/app/projetos")!;
    expect(isActive(projetos, "/app/projetos/abc-123")).toBe(true);
  });
});

describe("currentLabel", () => {
  it.each([
    ["/app", "Dashboard"],
    ["/app/gerar", "Objetos 3D"],
    ["/app/gerar/briefing", "Briefing → Planta 2D"],
    ["/app/gerar/analise", "Análise de planta"],
    ["/app/gerar/planta", "Render de planta"],
    ["/app/projetos/abc-123", "Projetos"],
    ["/app/transparencia", "Transparência IA"],
  ])("%s → %s", (rota, rotulo) => expect(currentLabel(rota)).toBe(rotulo));

  it("mantém o nome próprio das telas que a barra lateral agrupa", () => {
    expect(currentLabel("/app/gerar/analise")).not.toBe("Plantas");
  });

  it("rota desconhecida cai no nome do produto, não em vazio", () => {
    expect(currentLabel("/app/inexistente")).toBe("Arq3D Studio");
  });
});

describe("ALL_SCREENS", () => {
  it("cobre toda rota autenticada — se não cobrir, a busca não acha a tela", () => {
    for (const rota of ROTAS) {
      expect(ALL_SCREENS.some((i) => i.to === rota)).toBe(true);
    }
  });

  it("não contém a entrada agrupada, só as telas reais", () => {
    expect(ALL_SCREENS.some((i) => i.label === "Plantas")).toBe(false);
  });

  it("não tem rota repetida", () => {
    const tos = ALL_SCREENS.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it("inclui as telas de admin", () => {
    for (const a of adminItems) expect(ALL_SCREENS).toContainEqual(a);
  });
});
