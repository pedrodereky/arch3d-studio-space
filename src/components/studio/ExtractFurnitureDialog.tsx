import { useEffect, useState } from "react";
import { Loader2, Sofa } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

type SceneObject = {
  type: string;
  prompt: string;
  isolation_prompt: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string | null;
  nodeId: string | null;
  onLaunched?: (count: number) => void;
};

const TYPE_LABELS: Record<string, string> = {
  sofa: "Sofá",
  armchair: "Poltrona",
  chair: "Cadeira",
  bed_double: "Cama de casal",
  bed_single: "Cama de solteiro",
  table_dining: "Mesa de jantar",
  table_coffee: "Mesa de centro",
  desk: "Escrivaninha",
  wardrobe: "Guarda-roupa",
  tv: "TV",
  toilet: "Vaso sanitário",
  sink: "Pia",
  bathtub: "Banheira",
  shower: "Box",
  stove: "Fogão",
  fridge: "Geladeira",
  kitchen_counter: "Bancada de cozinha",
  lamp: "Luminária",
  plant: "Planta",
};

export function ExtractFurnitureDialog({ open, onOpenChange, runId, nodeId, onLaunched }: Props) {
  const [phase, setPhase] = useState<"loading" | "listing" | "submitting">("loading");
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !runId || !nodeId) return;
    let cancelled = false;
    setPhase("loading");
    setError(null);
    setObjects([]);
    setSelected(new Set());

    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("studio-detect-furniture", {
          body: { runId, nodeId },
        });
        if (cancelled) return;
        if (fnErr) throw fnErr;
        if (!data?.ok) throw new Error(data?.error ?? "falha na detecção");
        const objs = (data.objects ?? []) as SceneObject[];
        setObjects(objs);
        setSelected(new Set(objs.map((_, i) => i)));
        setPhase("listing");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "erro";
        setError(msg);
        setPhase("listing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, runId, nodeId]);

  const toggle = (i: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleLaunch = async () => {
    if (!runId || !nodeId || selected.size === 0) return;
    setPhase("submitting");
    try {
      const items = Array.from(selected).map((i) => objects[i]);
      const { data, error: fnErr } = await supabase.functions.invoke("studio-publish", {
        body: { runId, nodeId, action: "furniture_individual", furniture: items },
      });
      if (fnErr) throw fnErr;
      if (!data?.ok) throw new Error(data?.error ?? "falha");
      toast.success(`${items.length} móvel(is) em geração 3D`, {
        description: "Você verá cada um aparecer na biblioteca.",
      });
      onLaunched?.(items.length);
      onOpenChange(false);
    } catch (e) {
      toast.error("Falha ao iniciar", {
        description: e instanceof Error ? e.message : "?",
      });
      setPhase("listing");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sofa className="h-5 w-5" />
            Móveis detectados
          </DialogTitle>
          <DialogDescription>
            Cada móvel selecionado vira um modelo 3D individual na sua biblioteca.
          </DialogDescription>
        </DialogHeader>

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Analisando a cena…</p>
          </div>
        )}

        {phase !== "loading" && error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}

        {phase !== "loading" && !error && objects.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum móvel detectado nesta imagem.
          </p>
        )}

        {phase !== "loading" && objects.length > 0 && (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-1">
            {objects.map((o, i) => {
              const checked = selected.has(i);
              const label = TYPE_LABELS[o.type] ?? o.type;
              return (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm transition ${
                    checked ? "bg-accent/10" : "hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(i)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{o.prompt}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={phase === "submitting"}
          >
            Cancelar
          </Button>
          <Button onClick={handleLaunch} disabled={phase !== "listing" || selected.size === 0}>
            {phase === "submitting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Gerar 3D ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
