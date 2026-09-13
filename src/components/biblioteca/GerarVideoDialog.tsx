import { useState } from "react";
import { Loader2, Video, Footprints, Plane, Building2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceGenerationId: string;
  sourceRenderUrl: string | null;
  onCreated?: (newGenId: string) => void;
};

type CameraMode = "pov_walk" | "aerial_flyover" | "facade_tour";

const CAMERA_OPTIONS: { v: CameraMode; icon: typeof Footprints; title: string; desc: string }[] = [
  {
    v: "pov_walk",
    icon: Footprints,
    title: "Caminhada POV",
    desc: "Primeira pessoa, altura humana, andando devagar pelo interior.",
  },
  {
    v: "aerial_flyover",
    icon: Plane,
    title: "Sobrevoo aéreo",
    desc: "Drone subindo e orbitando lentamente sobre o layout.",
  },
  {
    v: "facade_tour",
    icon: Building2,
    title: "Tour da fachada",
    desc: "Câmera externa em nível da rua deslizando pela fachada.",
  },
];

export function GerarVideoDialog({
  open,
  onOpenChange,
  sourceGenerationId,
  sourceRenderUrl,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [cameraMode, setCameraMode] = useState<CameraMode>("pov_walk");
  const [submitting, setSubmitting] = useState(false);

  const handleGenerate = async () => {
    if (!user || !sourceRenderUrl || submitting) return;
    setSubmitting(true);
    try {
      const { data: gen, error: insErr } = await supabase
        .from("generations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          user_id: user.id,
          pipeline_type: "render_to_video",
          engine: "happyhorse_1_0",
          status: "queued",
          source_images: [sourceRenderUrl],
          prompt: prompt.trim() || null,
          metadata: {
            duration: 15,
            resolution: "1080p",
            aspect_ratio: "16:9",
            mode: "pov",
            camera_mode: cameraMode,
            source_generation_id: sourceGenerationId,
          },
        } as any)
        .select("id")
        .single();
      if (insErr || !gen) throw insErr ?? new Error("Falha ao criar geração");

      const { error: fnErr } = await supabase.functions.invoke("orchestrate-generation", {
        body: { generationId: gen.id },
      });
      if (fnErr) throw fnErr;

      toast.success("Vídeo em geração", {
        description: "Levará alguns minutos. Você verá o resultado na biblioteca.",
      });
      onCreated?.(gen.id);
      onOpenChange(false);
      setPrompt("");
      setCameraMode("pov_walk");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao iniciar";
      toast.error("Erro ao gerar vídeo", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Gerar vídeo
          </DialogTitle>
          <DialogDescription>
            15 segundos · 1080p · 16:9 · modelo Happyhorse 1.0. Escolha o tipo de movimento de
            câmera abaixo.
          </DialogDescription>
        </DialogHeader>

        {sourceRenderUrl ? (
          <div className="overflow-hidden rounded-md border bg-muted">
            <img
              src={sourceRenderUrl}
              alt="Render base"
              className="aspect-video w-full object-cover"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Movimento de câmera</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {CAMERA_OPTIONS.map(({ v, icon: Icon, title, desc }) => {
              const active = cameraMode === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCameraMode(v)}
                  disabled={submitting}
                  className={`flex flex-col items-start gap-1.5 rounded-md border p-3 text-left transition ${
                    active
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "border-border bg-background hover:border-accent/60"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${active ? "text-accent" : "text-muted-foreground"}`}
                    strokeWidth={1.75}
                  />
                  <span className="text-xs font-medium text-foreground">{title}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-prompt">Descrição extra (opcional)</Label>
          <Textarea
            id="video-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex.: começar pela porta principal e terminar olhando para a janela do fundo."
            rows={3}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            Texto opcional somado ao movimento de câmera selecionado acima.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={submitting || !sourceRenderUrl}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Gerar vídeo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
