import { Loader2, X } from "lucide-react";
import type { FloorplanAnalysis } from "./types";

type Props = {
  open: boolean;
  loading: boolean;
  analysis: FloorplanAnalysis | null;
  onClose: () => void;
  onExport: () => void;
};

export function VisionAnalysisSheet({ open, loading, analysis, onClose, onExport }: Props) {
  if (!open) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-10 flex w-[360px] flex-col border-l border-border bg-card shadow-[-12px_0_32px_-12px_hsl(var(--primary)/0.25)]">
      <header className="flex items-start justify-between border-b border-border px-6 py-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">
            Análise IA
          </p>
          <h4 className="mt-1 text-sm font-black tracking-tight text-foreground">
            FloorPlan Vision
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Fechar análise"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <p className="text-[12px] font-light text-muted-foreground">
            Detectando cômodos, áreas e validando NBR…
          </p>
        </div>
      )}

      {!loading && !analysis && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[12px] font-light text-muted-foreground">Nenhuma análise carregada.</p>
        </div>
      )}

      {!loading && analysis && (
        <>
          <div className="space-y-6 overflow-y-auto px-6 py-5">
            {(analysis.bedrooms != null ||
              analysis.suites != null ||
              analysis.bathrooms != null ||
              analysis.garages != null ||
              analysis.totalAreaApprox != null) && (
              <Section title="Resumo">
                <div className="grid grid-cols-2 gap-2">
                  {analysis.totalAreaApprox != null && (
                    <Stat label="Área aprox." value={`${analysis.totalAreaApprox} m²`} />
                  )}
                  {analysis.bedrooms != null && (
                    <Stat label="Quartos" value={String(analysis.bedrooms)} />
                  )}
                  {analysis.suites != null && (
                    <Stat label="Suítes" value={String(analysis.suites)} />
                  )}
                  {analysis.bathrooms != null && (
                    <Stat label="Banhos" value={String(analysis.bathrooms)} />
                  )}
                  {analysis.garages != null && (
                    <Stat label="Vagas" value={String(analysis.garages)} />
                  )}
                </div>
              </Section>
            )}

            {analysis.rooms.length > 0 && (
              <Section title={`Cômodos detectados (${analysis.rooms.length})`}>
                <div className="space-y-1.5">
                  {analysis.rooms.map((r, i) => (
                    <div
                      key={`${r.name}-${i}`}
                      className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                    >
                      <span className="text-[12px] font-bold text-foreground">{r.name}</span>
                      {r.areaM2 != null && (
                        <span className="text-[12px] font-black text-foreground">
                          {r.areaM2.toFixed(1)} m²
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {analysis.accessibility && (
              <Section title="Validação NBR 9050">
                {analysis.accessibility.nbr9050 != null && (
                  <span
                    className={`inline-flex items-center rounded-[4px] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                      analysis.accessibility.nbr9050
                        ? "border border-accent/30 bg-accent/10 text-accent"
                        : "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {analysis.accessibility.nbr9050 ? "Conforme" : "Atenção"}
                  </span>
                )}
                {!!analysis.accessibility.notes?.length && (
                  <ul className="mt-3 space-y-2">
                    {analysis.accessibility.notes.map((n, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="text-[11px] font-light leading-relaxed text-muted-foreground">
                          {n}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}
          </div>

          <div className="border-t border-border px-6 py-5">
            <button
              type="button"
              onClick={onExport}
              className="inline-flex h-10 w-full items-center justify-center rounded-full border-2 border-accent px-5 text-[11px] font-black uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Exportar análise (JSON)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-accent">
        {title}
      </h5>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-black text-foreground">{value}</p>
    </div>
  );
}
