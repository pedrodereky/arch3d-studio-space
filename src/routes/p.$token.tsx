import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Calendar, User as UserIcon, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand/Wordmark";
import { useFreshUrl } from "@/lib/use-fresh-url";

export const Route = createFileRoute("/p/$token")({
  head: () => ({
    meta: [
      { title: "Projeto compartilhado — Arq3D Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedProjectPage,
});

type SharedGen = {
  id: string;
  pipeline_type: string;
  prompt: string | null;
  thumbnail_url: string | null;
  final_render_url: string | null;
  video_url: string | null;
  glb_url: string | null;
  created_at: string;
};

type SharedProject = {
  id: string;
  name: string;
  client_name: string | null;
  briefing: string | null;
  deadline: string | null;
  created_at: string;
  generations: SharedGen[];
};

function SharedProjectPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<SharedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void supabase
      .rpc("get_shared_project", { _token: token })
      .then(({ data: result, error }) => {
        setLoading(false);
        if (error || !result) {
          setNotFound(true);
          return;
        }
        setData(result as unknown as SharedProject);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-3xl font-black text-foreground">Link inválido</h1>
        <p className="mt-2 max-w-md font-light text-muted-foreground">
          Este link de projeto não existe mais ou foi removido.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
          <Wordmark className="text-primary-foreground" />
          <a
            href="/"
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground/70 hover:text-primary-foreground"
          >
            Arq3D Studio
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-10 p-6 py-12">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Apresentação de projeto
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground">{data.name}</h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm font-light text-muted-foreground">
            {data.client_name && (
              <span className="inline-flex items-center gap-1.5">
                <UserIcon className="h-3.5 w-3.5" /> {data.client_name}
              </span>
            )}
            {data.deadline && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />{" "}
                {new Date(data.deadline + "T00:00:00").toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
          {data.briefing && (
            <p className="mt-6 max-w-2xl whitespace-pre-wrap text-base font-light text-foreground/80">
              {data.briefing}
            </p>
          )}
        </div>

        {data.generations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-12 text-center">
            <p className="text-sm font-light text-muted-foreground">
              Ainda não há gerações neste projeto.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.generations.map((g) => (
              <SharedGenCard key={g.id} g={g} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-8 text-center text-xs font-light text-muted-foreground">
        Apresentação gerada com{" "}
        <a href="/" className="font-bold text-foreground hover:text-accent">
          Arq3D Studio
        </a>
      </footer>
    </div>
  );
}

function SharedGenCard({ g }: { g: SharedGen }) {
  const thumb = useFreshUrl(g.thumbnail_url ?? g.final_render_url);
  const video = useFreshUrl(g.video_url);
  const glb = useFreshUrl(g.glb_url);
  const isVideo = !!g.video_url;

  return (
    <div
      className="overflow-hidden rounded-xl border border-border/60 bg-card"
      style={{ boxShadow: "var(--via-shadow-card)" }}
    >
      <div className="relative aspect-video bg-muted">
        {isVideo && video ? (
          <video src={video} controls className="h-full w-full object-cover" />
        ) : thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            sem preview
          </div>
        )}
      </div>
      <div className="p-4">
        {g.prompt && (
          <p className="line-clamp-2 text-sm font-light text-foreground/80">{g.prompt}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {glb && (
            <a
              href={glb}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground hover:bg-primary/90"
            >
              <ExternalLink className="h-3 w-3" /> Baixar 3D
            </a>
          )}
          {video && (
            <a
              href={video}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-muted"
            >
              <ExternalLink className="h-3 w-3" /> Vídeo
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
