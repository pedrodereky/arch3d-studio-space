import { describe, it, expect } from "vitest";
import { computeNodeHashes, type HashableNode, type HashableEdge } from "@/lib/node-hash";

const n = (id: string, data: Partial<HashableNode["data"]> = {}): HashableNode => ({
  id,
  data: { op: "compose", ...data },
});

describe("computeNodeHashes", () => {
  it("é determinístico para o mesmo grafo", () => {
    const nodes = [n("a"), n("b", { prompt: "oi" })];
    const edges: HashableEdge[] = [{ source: "a", target: "b" }];
    expect(computeNodeHashes(nodes, edges)).toEqual(computeNodeHashes(nodes, edges));
  });

  it("ignora espaço em volta do prompt — reaproveita em vez de cobrar de novo", () => {
    const edges: HashableEdge[] = [];
    const a = computeNodeHashes([n("x", { prompt: "sala clara" })], edges);
    const b = computeNodeHashes([n("x", { prompt: "  sala clara  " })], edges);
    expect(a.x).toBe(b.x);
  });

  it("muda quando o prompt muda — não serve resultado velho", () => {
    const edges: HashableEdge[] = [];
    const a = computeNodeHashes([n("x", { prompt: "sala clara" })], edges);
    const b = computeNodeHashes([n("x", { prompt: "sala escura" })], edges);
    expect(a.x).not.toBe(b.x);
  });

  it.each([
    ["model", { model: "outro-modelo" }],
    ["storagePath", { storagePath: "u/2.png" }],
    ["quality", { quality: "high" }],
    ["op", { op: "upscale" }],
  ])("muda quando %s muda", (_rotulo, patch) => {
    const edges: HashableEdge[] = [];
    const base = computeNodeHashes([n("x", { model: "m", storagePath: "u/1.png" })], edges);
    const alt = computeNodeHashes(
      [n("x", { model: "m", storagePath: "u/1.png", ...patch })],
      edges,
    );
    expect(alt.x).not.toBe(base.x);
  });

  it("propaga para jusante: mudar a entrada invalida quem depende dela", () => {
    const edges: HashableEdge[] = [{ source: "a", target: "b" }];
    const antes = computeNodeHashes([n("a", { prompt: "p1" }), n("b")], edges);
    const depois = computeNodeHashes([n("a", { prompt: "p2" }), n("b")], edges);
    expect(depois.a).not.toBe(antes.a);
    expect(depois.b).not.toBe(antes.b);
  });

  it("não propaga para montante: mudar a saída não invalida a entrada", () => {
    const edges: HashableEdge[] = [{ source: "a", target: "b" }];
    const antes = computeNodeHashes([n("a"), n("b", { prompt: "p1" })], edges);
    const depois = computeNodeHashes([n("a"), n("b", { prompt: "p2" })], edges);
    expect(depois.a).toBe(antes.a);
    expect(depois.b).not.toBe(antes.b);
  });

  it("a ordem das arestas não altera o hash", () => {
    const nodes = [n("a"), n("b"), n("c")];
    const ida: HashableEdge[] = [
      { source: "a", target: "c" },
      { source: "b", target: "c" },
    ];
    const volta: HashableEdge[] = [
      { source: "b", target: "c" },
      { source: "a", target: "c" },
    ];
    expect(computeNodeHashes(nodes, ida).c).toBe(computeNodeHashes(nodes, volta).c);
  });

  it("entradas distintas dão hashes distintos no mesmo consumidor", () => {
    const nodes = [n("a", { prompt: "p1" }), n("b", { prompt: "p2" }), n("c")];
    const comA = computeNodeHashes(nodes, [{ source: "a", target: "c" }]);
    const comB = computeNodeHashes(nodes, [{ source: "b", target: "c" }]);
    expect(comA.c).not.toBe(comB.c);
  });

  it("não entra em laço infinito num ciclo", () => {
    const nodes = [n("a"), n("b")];
    const edges: HashableEdge[] = [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
    ];
    const out = computeNodeHashes(nodes, edges);
    expect(Object.keys(out).sort()).toEqual(["a", "b"]);
  });

  it("aresta apontando para nó inexistente não derruba o cálculo", () => {
    const out = computeNodeHashes([n("a")], [{ source: "fantasma", target: "a" }]);
    expect(out.a).toBeTypeOf("string");
  });
});
