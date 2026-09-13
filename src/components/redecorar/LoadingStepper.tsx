import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

type Step = { label: string; estMs: number };

const STEPS: Step[] = [
  { label: "Analisando ambiente", estMs: 7000 },
  { label: "Gerando variações", estMs: 14000 },
  { label: "Finalizando", estMs: 2000 },
];

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LoadingStepper() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 250), 250);
    return () => clearInterval(t);
  }, []);

  const seconds = Math.floor(elapsed / 1000);

  const adaptiveMessage = useMemo(() => {
    if (seconds < 25) return "Isso leva cerca de 20 segundos";
    if (seconds < 60) return "Renderizando variações em alta resolução";
    if (seconds < 180) return "Ainda processando — pode levar até 3 min em horário de pico";
    return "Quase lá. Se preferir, feche a aba — a gente te avisa quando terminar";
  }, [seconds]);

  // Acumulado por etapa
  const cumulatives = STEPS.map((_, i) => STEPS.slice(0, i + 1).reduce((a, s) => a + s.estMs, 0));
  const lastIdx = STEPS.length - 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* barra indeterminada sempre visível */}
      <div className="relative h-0.5 w-full overflow-hidden bg-accent/15">
        <div className="absolute inset-y-0 w-1/3 animate-[stepper-shimmer_1.6s_ease-in-out_infinite] bg-accent" />
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
              Redecorando
            </p>
            <p className="mt-1 text-lg font-black text-foreground">{adaptiveMessage}</p>
          </div>
          <p
            className="shrink-0 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
            aria-label="Tempo decorrido"
          >
            {formatElapsed(elapsed)}
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {STEPS.map((s, i) => {
            const cumulative = cumulatives[i];
            const prevCumulative = i === 0 ? 0 : cumulatives[i - 1];

            // Última etapa nunca conclui por tempo
            const isLast = i === lastIdx;
            const isDone = !isLast && elapsed >= cumulative;
            const isActive =
              !isDone && (isLast ? elapsed >= prevCumulative : elapsed >= prevCumulative);

            return (
              <div key={s.label} className="flex items-center gap-3">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isDone
                      ? "bg-accent text-accent-foreground"
                      : isActive
                        ? "bg-accent/15 text-accent"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  ) : (
                    <span className="text-[10px] font-black">{i + 1}</span>
                  )}
                </div>
                <p
                  className={`text-sm transition-colors ${
                    isDone
                      ? "font-light text-muted-foreground line-through decoration-muted-foreground/40"
                      : isActive
                        ? "font-bold text-foreground"
                        : "font-light text-muted-foreground"
                  }`}
                >
                  {s.label}
                </p>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] font-light text-muted-foreground">
          Você pode fechar essa aba — a gente avisa quando terminar.
        </p>
      </div>
    </div>
  );
}
