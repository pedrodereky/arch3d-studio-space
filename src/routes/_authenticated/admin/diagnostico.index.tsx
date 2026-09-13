import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import { Loader2, ChevronRight, AlertCircle } from "lucide-react";
import { PIPELINE_TYPES, pipelineLabel, type PipelineType } from "@/lib/pipeline-labels";

export const Route = createFileRoute("/_authenticated/admin/diagnostico/")({
  component: DiagnosticoListPage,
});

type Row = {
  id: string;
  user_id: string;
  pipeline_type: string;
  status: string;
  progress_percent: number;
  progress_stage: string | null;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const STATUS_FILTERS = ["all", "failed", "processing", "succeeded"] as const;
type Status = (typeof STATUS_FILTERS)[number];

const ROW_LIMIT = 50;

function DiagnosticoListPage() {
  const [filter, setFilter] = useState<Status>("all");
  const [pipeline, setPipeline] = useState<PipelineType | "all">("all");

  const {
    data: rows = [],
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: qk.generationsList({ view: "diagnostico", filter, pipeline }),
    queryFn: async () => {
      let q = supabase
        .from("generations")
        .select(
          "id,user_id,pipeline_type,status,progress_percent,progress_stage,error_message,created_at,metadata",
        )
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT);
      if (filter !== "all") q = q.eq("status", filter);
      if (pipeline !== "all") q = q.eq("pipeline_type", pipeline);
      const { data, error } = await q;
      // Erro vira rejeição: antes ia só para o console e a tela dizia "nenhuma
      // geração encontrada", que é uma resposta diferente de "a query falhou".
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  });

  const error = queryError?.message ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Diagnóstico de gerações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimas {ROW_LIMIT} gerações, de todos os pipelines. Logs detalhados aparecem quando a
          geração foi disparada com modo diagnóstico ativo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {s === "all" ? "Todas" : s}
          </button>
        ))}

        <select
          value={pipeline}
          onChange={(e) => setPipeline(e.target.value as PipelineType | "all")}
          aria-label="Filtrar por pipeline"
          className="ml-auto rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
        >
          <option value="all">Todos os pipelines</option>
          {PIPELINE_TYPES.map((t) => (
            <option key={t} value={t}>
              {pipelineLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-bold text-foreground">Não foi possível carregar</p>
            <p className="mt-1 text-sm font-light text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma geração encontrada para esse filtro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Criado</th>
                <th className="px-3 py-2 text-left">Pipeline</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Etapa</th>
                <th className="px-3 py-2 text-left">%</th>
                <th className="px-3 py-2 text-left">Diag</th>
                <th className="px-3 py-2 text-left">Erro</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diag =
                  (r.metadata as Record<string, unknown> | null)?.diagnostics_mode === true;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 text-xs">{pipelineLabel(r.pipeline_type)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          r.status === "succeeded"
                            ? "bg-green-100 text-green-700"
                            : r.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.progress_stage ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{r.progress_percent}%</td>
                    <td className="px-3 py-2 text-xs">{diag ? "sim" : "—"}</td>
                    <td className="px-3 py-2 text-xs text-red-600 truncate max-w-[200px]">
                      {r.error_message ?? ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/admin/diagnostico/$generationId"
                        params={{ generationId: r.id }}
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        Abrir <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
