/**
 * Hash determinístico dos parâmetros que invalidam o resultado de um nó do
 * Studio.
 *
 * É a função que decide o que uma nova execução reaproveita. Se ela errar para
 * MAIS, o usuário recebe um resultado velho achando que é novo. Se errar para
 * MENOS, ele paga de novo por um nó que não mudou. Por isso vive aqui, fora da
 * tela de 1600 linhas, com testes.
 *
 * Os tipos são estruturais de propósito: assim o módulo não arrasta o
 * @xyflow/react, e os nós da tela passam direto.
 */

export type HashableNode = {
  id: string;
  data: {
    op: string;
    model?: string | null;
    prompt?: string | null;
    storagePath?: string | null;
    quality?: unknown;
  };
};

export type HashableEdge = { source: string; target: string };

export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function computeNodeHashes(
  nodes: HashableNode[],
  edges: HashableEdge[],
): Record<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const inputsOf = (id: string) => edges.filter((e) => e.target === id).map((e) => e.source);
  const memo = new Map<string, string>();

  const visit = (id: string, stack: Set<string>): string => {
    if (memo.has(id)) return memo.get(id)!;
    // Um ciclo não pode travar o cálculo: devolve um marcador e segue.
    if (stack.has(id)) return "cycle";
    stack.add(id);
    const n = byId.get(id);
    if (!n) return "missing";
    const d = n.data;
    // Ordenado: a ordem em que as arestas foram criadas não muda o resultado.
    const inputHashes = inputsOf(id)
      .sort()
      .map((sid) => visit(sid, stack));
    const sig = JSON.stringify({
      op: d.op,
      model: d.model ?? null,
      prompt: (d.prompt ?? "").trim(),
      storagePath: d.storagePath ?? null,
      quality: d.quality ?? null,
      inputs: inputHashes,
    });
    const h = djb2(sig);
    memo.set(id, h);
    return h;
  };

  const out: Record<string, string> = {};
  for (const n of nodes) out[n.id] = visit(n.id, new Set());
  return out;
}
