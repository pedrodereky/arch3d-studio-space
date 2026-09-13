import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import type { PipelineType } from "@/lib/pipeline-labels";

/**
 * Custo por pipeline, medido — não tabelado.
 *
 * Não existe tabela de preço por pipeline no produto, e inventar uma seria
 * pior que não ter: o custo real varia com o modelo, o tamanho da entrada e o
 * que o provedor cobrou no dia. O que existe é `generations.cost_usd`, que é
 * o que foi cobrado de verdade. Então a estimativa é a mediana do que ESTE
 * usuário já pagou naquele pipeline.
 *
 * Mediana e não média: uma geração que estourou por retry envenena a média e
 * não mexe na mediana.
 */

export type PipelineCost = {
  /** Mediana em dólar das gerações consideradas. */
  median: number;
  /** Quantas gerações sustentam o número — sem isso ele não é interpretável. */
  samples: number;
};

export type PipelineCostMap = Partial<Record<PipelineType, PipelineCost>>;

/**
 * Amostra o suficiente para uma mediana estável sem puxar a conta inteira.
 * Duas colunas × 500 linhas é uma query pequena.
 */
const SAMPLE_SIZE = 500;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function usePipelineCosts(userId: string | undefined) {
  return useQuery({
    queryKey: qk.pipelineCosts(userId),
    enabled: !!userId,
    // O custo de um pipeline não muda a cada navegação; revalidar a cada
    // montagem só gastaria query.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PipelineCostMap> => {
      const { data, error } = await supabase
        .from("generations")
        .select("pipeline_type, cost_usd")
        .eq("user_id", userId!)
        .eq("status", "succeeded")
        .gt("cost_usd", 0)
        .order("created_at", { ascending: false })
        .limit(SAMPLE_SIZE);
      if (error) throw new Error(error.message);

      const buckets = new Map<string, number[]>();
      for (const row of data ?? []) {
        const cost = Number(row.cost_usd ?? 0);
        if (!Number.isFinite(cost) || cost <= 0) continue;
        const list = buckets.get(row.pipeline_type);
        if (list) list.push(cost);
        else buckets.set(row.pipeline_type, [cost]);
      }

      const out: PipelineCostMap = {};
      for (const [pipeline, costs] of buckets) {
        out[pipeline as PipelineType] = { median: median(costs), samples: costs.length };
      }
      return out;
    },
  });
}

/** `$ 0,05`. Devolve o traço quando não há número — nunca um zero inventado. */
export function formatUsd(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  // Abaixo de um centavo, duas casas viram "$ 0,00", que lê como grátis.
  const digits = usd > 0 && usd < 0.01 ? 4 : 2;
  return `$ ${usd.toFixed(digits).replace(".", ",")}`;
}

/**
 * Custo por nó processado no Studio, medido do mesmo jeito.
 *
 * O backend cobra por nó executado, não por execução — então um fluxo de seis
 * nós com quatro reaproveitados custa o de dois. Estimar pela mediana do
 * custo POR EXECUÇÃO daria o número errado justamente quando o reaproveitamento
 * importa, que é a hora em que alguém olha para o painel.
 */
export function useStudioNodeCost(userId: string | undefined) {
  return useQuery({
    queryKey: qk.studioNodeCost(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PipelineCost | null> => {
      const { data, error } = await supabase
        .from("studio_runs")
        .select("cost_usd, node_results")
        .eq("user_id", userId!)
        .eq("status", "succeeded")
        .gt("cost_usd", 0)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);

      const perNode: number[] = [];
      for (const row of data ?? []) {
        const cost = Number(row.cost_usd ?? 0);
        const results = (row.node_results ?? {}) as Record<string, unknown>;
        // Só conta nó que de fato produziu algo: entrada sem resultado não foi
        // processada e não entra no denominador.
        const processed = Object.values(results).filter(
          (entry) => !!entry && typeof entry === "object" && "url" in (entry as object),
        ).length;
        if (!Number.isFinite(cost) || cost <= 0 || processed === 0) continue;
        perNode.push(cost / processed);
      }
      if (perNode.length === 0) return null;
      return { median: median(perNode), samples: perNode.length };
    },
  });
}
