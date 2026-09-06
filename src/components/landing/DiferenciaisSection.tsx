import { Globe, Layers, Box } from "lucide-react";

const items = [
  {
    icon: Globe,
    title: "Português do Brasil",
    body: "Suporte, documentação e copy pensados para o arquiteto BR. Sem tradução automática.",
  },
  {
    icon: Layers,
    title: "Múltiplos modelos",
    body: "Roteamos automaticamente para o melhor modelo de IA por categoria. Você não escolhe — a gente acerta.",
  },
  {
    icon: Box,
    title: "Pronto para Lumion, SketchUp, Revit",
    body: "Exporta em GLB, FBX, OBJ e DAE. Importa direto no software do seu fluxo.",
  },
];

export function DiferenciaisSection() {
  return (
    <section className="bg-secondary/40 py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Por que Arq3D
        </span>
        <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-foreground md:text-4xl">
          Construído para arquitetos brasileiros
        </h2>

        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {items.map((it) => (
            <div key={it.title}>
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <it.icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-foreground">{it.title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-muted-foreground">
                {it.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
