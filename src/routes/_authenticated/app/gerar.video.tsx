import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Video, Loader2, ImageOff, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { GerarVideoDialog } from "@/components/biblioteca/GerarVideoDialog";

export const Route = createFileRoute("/_authenticated/app/gerar/video")({
  component: GerarVideoPage,
});

type RenderRow = {
  id: string;
  thumbnail_url: string | null;
  final_render_url: string | null;
  prompt: string | null;
  created_at: string;
};

function GerarVideoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [renders, setRenders] = useState<RenderRow[]>([]);
  const [withVideo, setWithVideo] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<RenderRow | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase
        .from("generations")
        .select("id,thumbnail_url,final_render_url,prompt,created_at")
        .eq("user_id", user.id)
        .eq("pipeline_type", "floorplan_render")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false });

      const list = (r ?? []) as RenderRow[];

      // identifica renders que já têm vídeo derivado
      const ids = list.map((g) => g.id);
      let videoSet = new Set<string>();
      if (ids.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: vids } = await (supabase as any)
          .from("generations")
          .select("metadata")
          .eq("user_id", user.id)
          .eq("pipeline_type", "render_to_video");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const v of (vids ?? []) as any[]) {
          const src = v?.metadata?.source_generation_id;
          if (typeof src === "string") videoSet.add(src);
        }
      }
      if (!active) return;
      setRenders(list);
      setWithVideo(videoSet);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const empty = useMemo(() => !loading && renders.length === 0, [loading, renders]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-foreground">Vídeo POV</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione um render de planta para gerar um vídeo em primeira pessoa.
          15 segundos · 1080p · 16:9 · modelo Happyhorse 1.0.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Carregando seus renders…</span>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border bg-card p-12 text-center">
          <ImageOff className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-base font-medium text-foreground">Nenhum render disponível</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Gere um render de planta primeiro para depois transformá-lo em vídeo POV.
            </p>
          </div>
          <Button onClick={() => navigate({ to: "/app/gerar/planta" })}>
            Gerar render de planta
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {renders.map((r) => {
            const img = r.final_render_url ?? r.thumbnail_url;
            const has = withVideo.has(r.id);
            return (
              <article
                key={r.id}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition hover:shadow-md"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                  {img ? (
                    <img
                      src={img}
                      alt={r.prompt ?? "Render"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                  {has && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      Vídeo gerado
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <p className="line-clamp-2 text-sm text-foreground">
                    {r.prompt?.trim() || "Sem descrição"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </p>
                  <div className="mt-auto flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => setSelected(r)}
                      disabled={!img}
                    >
                      <Video className="h-4 w-4" />
                      Gerar vídeo POV
                    </Button>
                    {has && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/app/biblioteca">Ver</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <GerarVideoDialog
          open={!!selected}
          onOpenChange={(o) => !o && setSelected(null)}
          sourceGenerationId={selected.id}
          sourceRenderUrl={selected.final_render_url ?? selected.thumbnail_url}
          onCreated={() => {
            setSelected(null);
            navigate({ to: "/app/biblioteca" });
          }}
        />
      )}
    </div>
  );
}
