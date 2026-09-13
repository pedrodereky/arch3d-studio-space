import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";
import { Loader2, CheckCircle2, AlertCircle, ImageIcon } from "lucide-react";
import { OP_META, MODELS, type StudioOp } from "@/lib/studio-models";
import { cn } from "@/lib/utils";

export type StudioNodeData = {
  op: StudioOp;
  model?: string;
  prompt?: string;
  signedUrl?: string;
  storagePath?: string;
  status?: "idle" | "running" | "done" | "error";
  resultUrl?: string;
  errorMessage?: string;
  onOpenInspector?: () => void;
};

export function StudioNode({ id, data, selected }: NodeProps) {
  const d = data as StudioNodeData;
  const meta = OP_META[d.op];
  const model = d.model ? MODELS[d.model] : null;
  const preview = d.resultUrl ?? d.signedUrl;

  // Conta arestas que chegam neste nó (entradas conectadas)
  const incomingCount = useStore((s) => s.edges.filter((e) => e.target === id).length);

  const needsConnection = meta.minInputs > 0 && incomingCount < meta.minInputs;
  const inputMissing = meta.isInput && !d.signedUrl;
  const incomplete = needsConnection || inputMissing;

  const statusIcon =
    d.status === "running" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
    ) : d.status === "done" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
    ) : d.status === "error" ? (
      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
    ) : incomplete ? (
      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
    ) : null;

  return (
    <div
      className={cn(
        "relative w-56 rounded-lg border-2 bg-card text-card-foreground shadow-sm transition-shadow",
        selected
          ? "border-accent shadow-lg ring-2 ring-accent/30"
          : incomplete
            ? "border-dashed border-amber-400/70"
            : "border-border",
      )}
    >
      {!meta.isInput && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            className="!h-4 !w-4 !border-2 !border-background !bg-accent"
            style={{ left: -8 }}
          />
          <span className="pointer-events-none absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2 pr-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            entrada
          </span>
        </>
      )}
      {!meta.isOutput && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            className="!h-4 !w-4 !border-2 !border-background !bg-accent"
            style={{ right: -8 }}
          />
          <span className="pointer-events-none absolute -right-1 top-1/2 translate-x-full -translate-y-1/2 pl-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            saída
          </span>
        </>
      )}

      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-bold uppercase tracking-wide">{meta.label}</span>
        </div>
        {statusIcon}
      </div>

      <div className="space-y-2 p-3">
        {/* Contador de entradas (apenas quando precisa de mais de uma) */}
        {meta.minInputs > 1 && (
          <div
            className={cn(
              "flex items-center justify-between rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              incomingCount >= meta.minInputs
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-amber-500/10 text-amber-600",
            )}
          >
            <span>Imagens conectadas</span>
            <span>
              {incomingCount}/{meta.minInputs}
            </span>
          </div>
        )}

        {model && (
          <div className="rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {model.label}
          </div>
        )}

        {preview ? (
          <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
            <img src={preview} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 px-2 text-center",
              incomplete ? "border-amber-400/70" : "border-border",
            )}
          >
            <ImageIcon className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
            {meta.isInput && !d.signedUrl && (
              <span className="text-[10px] text-muted-foreground">clique para selecionar</span>
            )}
            {needsConnection && (
              <span className="text-[10px] font-medium text-amber-600">
                conecte {meta.minInputs - incomingCount} imagem
                {meta.minInputs - incomingCount > 1 ? "ns" : ""} aqui ←
              </span>
            )}
          </div>
        )}

        {d.prompt && <p className="line-clamp-2 text-[11px] text-muted-foreground">{d.prompt}</p>}

        {d.errorMessage && (
          <p className="rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
            {d.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
