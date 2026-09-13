import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/diagnostico/$generationId")({
  component: DiagnosticoDetailPage,
});

type LogRow = {
  id: string;
  step: string;
  event: "start" | "end" | "error" | "info";
  duration_ms: number | null;
  payload_kb: number | null;
  memory_mb: number | null;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type Gen = {
  id: string;
  status: string;
  progress_percent: number;
  progress_stage: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const eventColor: Record<string, string> = {
  start: "bg-muted text-muted-foreground",
  end: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
};

function DiagnosticoDetailPage() {
  const { generationId } = Route.useParams();
  const [gen, setGen] = useState<Gen | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [g, l] = await Promise.all([
        supabase
          .from("generations")
          .select("id,status,progress_percent,progress_stage,error_message,metadata,created_at")
          .eq("id", generationId)
          .maybeSingle(),
        supabase
          .from("generation_logs")
          .select("*")
          .eq("generation_id", generationId)
          .order("created_at", { ascending: true }),
      ]);
      if (!alive) return;
      setGen((g.data as Gen) ?? null);
      setLogs((l.data as LogRow[]) ?? []);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`diag-${generationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "generation_logs",
          filter: `generation_id=eq.${generationId}`,
        },
        (payload) => {
          setLogs((prev) => [...prev, payload.new as LogRow]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generations",
          filter: `id=eq.${generationId}`,
        },
        (payload) => {
          setGen((prev) => ({ ...(prev ?? {}), ...(payload.new as Gen) }));
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [generationId]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const reprocess = async () => {
    if (reprocessing) return;
    setReprocessing(true);
    try {
      const meta = { ...(gen?.metadata ?? {}), diagnostics_mode: true };

      const { error } = await supabase
        .from("generations")
        .update({
          status: "queued",
          error_message: null,
          progress_percent: 0,
          progress_stage: null,
          metadata: meta,
        } as TablesUpdate<"generations">)
        .eq("id", generationId);
      if (error) throw error;
      // limpa logs anteriores na UI
      setLogs([]);
      const { error: fnErr } = await supabase.functions.invoke("orchestrate-generation", {
        body: { generationId },
      });
      if (fnErr) throw fnErr;
      toast.success("Reprocessando com diagnóstico ativo");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReprocessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!gen) {
    return <p className="text-sm text-muted-foreground">Geração não encontrada.</p>;
  }

  const memSeries = logs.filter((l) => l.memory_mb != null).map((l) => l.memory_mb!);
  const memMax = memSeries.length ? Math.max(...memSeries) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/admin/diagnostico"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Voltar
        </Link>
        <button
          onClick={reprocess}
          disabled={reprocessing}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          {reprocessing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Reprocessar com diagnóstico
        </button>
      </div>

      <div className="rounded-md border border-border bg-card p-5">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
            <p className="font-medium">{gen.status}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Progresso</p>
            <p className="font-medium">
              {gen.progress_percent}% — {gen.progress_stage ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Memória pico
            </p>
            <p className="font-medium">{memMax || "—"} MB</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Eventos</p>
            <p className="font-medium">{logs.length}</p>
          </div>
        </div>
        {gen.error_message && (
          <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
            {gen.error_message}
          </p>
        )}
      </div>

      {memSeries.length > 1 && (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Heap ao longo do tempo (MB)
          </p>
          <div className="flex h-16 items-end gap-px">
            {memSeries.map((m, i) => (
              <div
                key={i}
                className="flex-1 bg-accent/60"
                style={{ height: `${memMax ? (m / memMax) * 100 : 0}%` }}
                title={`${m} MB`}
              />
            ))}
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Sem logs persistidos. Reprocesse com modo diagnóstico para ver os eventos detalhados.
        </p>
      ) : (
        <ol className="space-y-2">
          {logs.map((l) => {
            const open = expanded.has(l.id);
            const meta = [
              l.duration_ms != null ? `${l.duration_ms}ms` : null,
              l.payload_kb != null ? `${l.payload_kb}KB` : null,
              l.memory_mb != null ? `mem=${l.memory_mb}MB` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={l.id} className="rounded-md border border-border bg-card">
                <button
                  onClick={() => toggle(l.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${eventColor[l.event]}`}
                    >
                      {l.event}
                    </span>
                    <span className="font-mono text-xs">{l.step}</span>
                    {l.message && (
                      <span className="text-xs text-muted-foreground">— {l.message}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{meta}</span>
                </button>
                {open && (
                  <pre className="overflow-x-auto border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                    {JSON.stringify(l.details, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
