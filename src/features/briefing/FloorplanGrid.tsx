import { Sparkles } from "lucide-react";
import type { FloorplanAsset } from "./types";

type Phase = "empty" | "loading" | "results";

type Props = {
  phase: Phase;
  assets: FloorplanAsset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const LABELS = ["Proposta A", "Proposta B", "Proposta C", "Proposta D"];

export function FloorplanGrid({ phase, assets, selectedId, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-foreground">
          Propostas geradas {phase === "results" ? `(${assets.length})` : ""}
        </h3>
        {phase === "loading" && (
          <span className="inline-flex items-center gap-2 rounded-[4px] border border-accent/30 bg-accent/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Lora ativo
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto bg-background p-6">
        {phase === "empty" && <EmptyState />}

        {phase === "loading" && (
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} label={LABELS[i]} />
            ))}
          </div>
        )}

        {phase === "results" && (
          <div className="grid grid-cols-2 gap-4">
            {assets.map((a, i) => {
              const selected = selectedId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className={`group relative aspect-square overflow-hidden rounded-xl border bg-card text-left transition-all ${
                    selected
                      ? "border-2 border-accent shadow-[0_8px_24px_-6px_hsl(var(--accent)/0.35)]"
                      : "border-border shadow-[0_4px_12px_-6px_hsl(var(--primary)/0.15)] hover:border-accent/60"
                  }`}
                >
                  <img
                    src={a.url}
                    alt={LABELS[i] ?? `Planta ${i + 1}`}
                    className="absolute inset-0 h-full w-full object-contain bg-muted/30"
                  />
                  {selected && (
                    <span className="absolute right-3 top-3 rounded-[4px] bg-accent px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-accent-foreground">
                      Selecionada
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border bg-card/95 px-3 py-2 backdrop-blur">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground">
                      {LABELS[i] ?? `Proposta ${i + 1}`}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">
                      {selected ? "Análise ativa" : "Analisar IA"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
      <Sparkles className="h-6 w-6 text-accent" strokeWidth={1.5} />
      <h4 className="mt-4 text-base font-black tracking-tight text-foreground">
        Preencha o briefing à esquerda
      </h4>
      <p className="mt-2 max-w-sm text-[12px] font-light leading-relaxed text-muted-foreground">
        Gere 4 propostas de planta baixa 2D em ~30 segundos. Cada proposta usa
        uma seed diferente do mesmo modelo treinado em plantas arquitetônicas.
      </p>
    </div>
  );
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-card">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/30 via-muted/60 to-muted/30" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border bg-card/95 px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] font-light text-muted-foreground">gerando…</span>
      </div>
    </div>
  );
}
