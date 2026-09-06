import type { LucideIcon } from "lucide-react";

export function Placeholder({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 font-light text-muted-foreground">{description}</p>
      </header>
      <div className="mt-10 rounded-xl border border-dashed border-border/60 bg-card/50 p-16 text-center">
        <Icon className="mx-auto h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="mt-4 text-base font-bold text-foreground">Em breve</h3>
        <p className="mt-1 text-sm font-light text-muted-foreground">
          Esta área será liberada nas próximas etapas da fundação.
        </p>
      </div>
    </div>
  );
}
