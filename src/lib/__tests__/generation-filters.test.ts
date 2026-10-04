import { describe, it, expect } from "vitest";
import { FILTER_STATUSES, GENERATION_FILTERS, type GenStatus } from "@/lib/generation-filters";

/** Todo valor do enum do banco, como está em types.ts. */
const TODOS: GenStatus[] = ["queued", "pending", "processing", "succeeded", "failed", "cancelled"];

describe("FILTER_STATUSES", () => {
  it('"all" não filtra nada', () => {
    expect(FILTER_STATUSES.all).toBeNull();
  });

  it("todo status do banco cai em exatamente uma aba", () => {
    for (const status of TODOS) {
      const abas = GENERATION_FILTERS.filter(
        (f) => FILTER_STATUSES[f] !== null && FILTER_STATUSES[f]!.includes(status),
      );
      expect(abas, `status "${status}"`).toHaveLength(1);
    }
  });

  it("'pending' conta como em processamento — antes ficava fora de todas as abas", () => {
    expect(FILTER_STATUSES.processing).toContain("pending");
  });

  it("'cancelled' conta como falha: para quem usa, também não produziu nada", () => {
    expect(FILTER_STATUSES.failed).toContain("cancelled");
  });

  it("as abas, somadas, cobrem o enum inteiro — nada fica invisível", () => {
    const cobertos = new Set(GENERATION_FILTERS.flatMap((f) => FILTER_STATUSES[f] ?? []));
    expect([...cobertos].sort()).toEqual([...TODOS].sort());
  });

  it("nenhum status aparece em duas abas", () => {
    const todos = GENERATION_FILTERS.flatMap((f) => FILTER_STATUSES[f] ?? []);
    expect(new Set(todos).size).toBe(todos.length);
  });
});
