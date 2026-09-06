import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/diagnostico/")({
  component: DiagnosticoListPage,
});

type Row = {
  id: string;
  user_id: string;
  status: string;
  progress_percent: number;
  progress_stage: string | null;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const STATUS_FILTERS = ["all", "failed", "processing", "succeeded"] as const;
type Status = (typeof STATUS_FILTERS)[number];

function DiagnosticoListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status>("all");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      let q = supabase
        .from("generations")
        .select("id,user_id,status,progress_percent,progress_stage,error_message,created_at,metadata")
        .eq("pipeline_type", "floorplan_render")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (!alive) return;
      if (error) console.error(error);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Diagnóstico de gerações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimas 50 gerações do pipeline floorplan_render. Logs detalhados aparecem
          quando a geração foi disparada com modo diagnóstico ativo.
        </p>
      </div>

      <div className="flex gap-2">
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
      </div>

      {loading ? (
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
                const diag = (r.metadata as Record<string, unknown> | null)?.diagnostics_mode === true;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
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
