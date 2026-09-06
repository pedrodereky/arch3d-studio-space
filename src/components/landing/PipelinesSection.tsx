import { Bolt, Sparkles, Wand2, Type, type LucideIcon } from "lucide-react";

type Pipeline = {
  icon: LucideIcon;
  title: string;
  description: string;
  recommended?: boolean;
};

const pipelines: Pipeline[] = [
  {
    icon: Bolt,
    title: "Direto",
    description: "Foto pronta vira 3D na hora.",
  },
  {
    icon: Sparkles,
    title: "Enriquecido",
    description: "IA limpa fundo e gera vistas multi-view antes do 3D.",
    recommended: true,
  },
  {
    icon: Wand2,
    title: "Edita antes",
    description: "Modifica cor, material ou tamanho antes de virar 3D.",
  },
  {
    icon: Type,
    title: "Texto para 3D",
    description: "Descreva o objeto e a IA cria o 3D do zero, sem imagem.",
  },
];

export function PipelinesSection() {
  return (
    <section id="recursos" className="border-t border-border/60 bg-background py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Recursos
        </span>
        <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-foreground md:text-4xl">
          Quatro fluxos para gerar objetos em 3D
        </h2>
        <p className="mt-4 max-w-xl font-light text-muted-foreground">
          Você escolhe o pipeline conforme o tempo, a referência e o nível de controle que precisa.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {pipelines.map((p) => (
            <article
              key={p.title}
              className="relative flex flex-col rounded-xl border border-border/60 bg-card p-6 transition-shadow hover:shadow-[var(--via-shadow-card)]"
            >
              {p.recommended && (
                <span className="absolute right-4 top-4 rounded-sm bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-accent-foreground">
                  Recomendado
                </span>
              )}
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <p.icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-foreground">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm font-light text-muted-foreground">{p.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
