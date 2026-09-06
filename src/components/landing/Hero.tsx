import { Link } from "@tanstack/react-router";
import { Play, CheckCircle2, Loader2, Clock } from "lucide-react";

const ctaPill =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 h-12 text-[12px] font-black uppercase tracking-[0.12em] transition-colors";

const mockRows = [
  { name: "Cadeira Eames lounge", status: "ready" as const },
  { name: "Pendente Vertigo Petite", status: "loading" as const },
  { name: "Sofá Bo Concept Carlton", status: "queued" as const },
];

function MockStatus({ status }: { status: "ready" | "loading" | "queued" }) {
  if (status === "ready")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Pronto
      </span>
    );
  if (status === "loading")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm bg-sky-400/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-300">
        <Loader2 className="h-3 w-3 animate-spin" /> Gerando
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
      <Clock className="h-3 w-3" /> Em fila
    </span>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 80% 0%, color-mix(in oklab, var(--via-blue) 12%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto grid max-w-[1200px] gap-14 px-6 py-20 md:grid-cols-[1.05fr_0.95fr] md:py-28 md:gap-10 md:items-center">
        <div>
          <span className="inline-flex rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-accent-foreground">
            Plataforma brasileira de IA 3D
          </span>
          <h1 className="mt-6 text-4xl font-black leading-[1.04] tracking-tight text-foreground md:text-6xl">
            Da referência ao 3D pronto em 60 segundos.
          </h1>
          <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-muted-foreground">
            Você sobe uma foto, planta ou referência do Pinterest. A gente entrega o modelo 3D pronto
            para Lumion, SketchUp ou Revit. Sem garimpar 3D Warehouse.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/cadastrar"
              className={`${ctaPill} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              Começar agora
            </Link>
            <a
              href="#recursos"
              className={`${ctaPill} border border-border bg-background text-foreground hover:bg-secondary`}
            >
              <Play className="h-4 w-4" /> Ver demonstração
            </a>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Mais de 60 modelos · Sem cartão · Cancela quando quiser.
          </p>
        </div>

        <div className="relative">
          <div
            className="rounded-2xl bg-primary p-6 text-primary-foreground"
            style={{ boxShadow: "var(--via-shadow-raised)" }}
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
                Geração em andamento
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                3 itens
              </span>
            </div>
            <ul className="space-y-3">
              {mockRows.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center gap-3 rounded-md bg-white/[0.04] p-3"
                >
                  <div className="h-12 w-12 shrink-0 rounded bg-white/10" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white">{row.name}</p>
                    {row.status === "loading" && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-2/3 rounded-full bg-sky-400" />
                      </div>
                    )}
                    {row.status === "ready" && (
                      <p className="mt-1 text-[11px] text-white/50">GLB · 1.2 MB · 8.2k polígonos</p>
                    )}
                    {row.status === "queued" && (
                      <p className="mt-1 text-[11px] text-white/40">Posição 2 na fila</p>
                    )}
                  </div>
                  <MockStatus status={row.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
