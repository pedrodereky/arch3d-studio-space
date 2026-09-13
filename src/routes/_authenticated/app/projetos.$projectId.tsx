import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Share2,
  Copy,
  Check,
  Calendar,
  User as UserIcon,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth-context";
import { FreshImg } from "@/components/library/FreshMedia";
import { AddGenerationsSheet } from "@/components/projetos/AddGenerationsSheet";

export const Route = createFileRoute("/_authenticated/app/projetos/$projectId")({
  component: ProjectDetailPage,
});

type Project = {
  id: string;
  name: string;
  client_name: string | null;
  briefing: string | null;
  deadline: string | null;
  share_token: string | null;
};

type Asset = {
  generation_id: string;
  generations: {
    id: string;
    pipeline_type: string;
    thumbnail_url: string | null;
    final_render_url: string | null;
    prompt: string | null;
    status: string;
    created_at: string;
  } | null;
};

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [openAdd, setOpenAdd] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [deadline, setDeadline] = useState("");
  const [briefing, setBriefing] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: qk.project(projectId),
    enabled: !!user,
    queryFn: async () => {
      const [{ data: p, error: pErr }, { data: a, error: aErr }] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, client_name, briefing, deadline, share_token")
          .eq("id", projectId)
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("project_assets")
          .select(
            "generation_id, generations(id, pipeline_type, thumbnail_url, final_render_url, prompt, status, created_at)",
          )
          .eq("project_id", projectId)
          .order("added_at", { ascending: false }),
      ]);
      const failure = pErr ?? aErr;
      if (failure) throw new Error(failure.message);
      return { project: (p as Project | null) ?? null, assets: (a ?? []) as Asset[] };
    },
  });

  const project = data?.project ?? null;
  const assets = useMemo(() => data?.assets ?? [], [data]);
  const loading = isPending && !!user;

  useEffect(() => {
    if (error) toast.error("Erro ao carregar projeto: " + error.message);
  }, [error]);

  // Projeto inexistente (ou de outro usuário) devolve null sem erro.
  useEffect(() => {
    if (!isPending && !error && data && !data.project) {
      toast.error("Projeto não encontrado");
      navigate({ to: "/app/projetos" });
    }
  }, [isPending, error, data, navigate]);

  // Semeia os campos do formulário quando o projeto chega ou é revalidado.
  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setClient(project.client_name ?? "");
    setDeadline(project.deadline ?? "");
    setBriefing(project.briefing ?? "");
  }, [project]);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.project(projectId) });

  const existingIds = useMemo(() => new Set(assets.map((a) => a.generation_id)), [assets]);

  async function saveMeta() {
    if (!project) return;
    setSavingMeta(true);
    const { error } = await supabase
      .from("projects")
      .update({
        name: name.trim(),
        client_name: client.trim() || null,
        deadline: deadline || null,
        briefing: briefing.trim() || null,
      })
      .eq("id", project.id);
    setSavingMeta(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    setEditingMeta(false);
    toast.success("Projeto atualizado");
    void reload();
  }

  async function removeAsset(generationId: string) {
    if (!project) return;
    const { error } = await supabase
      .from("project_assets")
      .delete()
      .eq("project_id", project.id)
      .eq("generation_id", generationId);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    // Remove do cache em vez de refetch: a remoção já é conhecida e local.
    queryClient.setQueryData(
      qk.project(projectId),
      (prev: { project: Project | null; assets: Asset[] } | undefined) =>
        prev
          ? { ...prev, assets: prev.assets.filter((a) => a.generation_id !== generationId) }
          : prev,
    );
  }

  async function deleteProject() {
    if (!project) return;
    if (!confirm(`Excluir o projeto "${project.name}"? As gerações continuam na biblioteca.`))
      return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success("Projeto excluído");
    navigate({ to: "/app/projetos" });
  }

  const shareUrl =
    project?.share_token && typeof window !== "undefined"
      ? `${window.location.origin}/p/${project.share_token}`
      : null;

  async function copyShare() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copiado");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div>
        <Link
          to="/app/projetos"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Projetos
        </Link>
      </div>

      <header
        className="rounded-[20px] bg-card p-6"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        {editingMeta ? (
          <div className="space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-b border-border bg-transparent pb-2 text-2xl font-black tracking-tight text-foreground outline-none focus:border-accent"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Cliente
                </span>
                <input
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border/60 bg-card px-3.5 text-sm font-light outline-none focus:border-accent-foreground/40"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Prazo
                </span>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border/60 bg-card px-3.5 text-sm font-light outline-none focus:border-accent-foreground/40"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Briefing
              </span>
              <textarea
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                rows={4}
                placeholder="Notas, escopo, referências do projeto."
                className="w-full rounded-lg border border-border/60 bg-card p-3.5 text-sm font-light outline-none focus:border-accent-foreground/40"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={saveMeta}
                disabled={savingMeta}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {savingMeta ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Salvar
              </button>
              <button
                onClick={() => {
                  setEditingMeta(false);
                  setName(project.name);
                  setClient(project.client_name ?? "");
                  setDeadline(project.deadline ?? "");
                  setBriefing(project.briefing ?? "");
                }}
                className="inline-flex h-9 items-center rounded-full border border-border px-5 text-xs font-bold uppercase tracking-[0.12em]"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
                {project.name}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm font-light text-muted-foreground">
                {project.client_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5" /> {project.client_name}
                  </span>
                )}
                {project.deadline && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />{" "}
                    {new Date(project.deadline + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
              {project.briefing && (
                <p className="mt-4 whitespace-pre-wrap text-sm font-light text-foreground/80">
                  {project.briefing}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={() => setEditingMeta(true)}
                className="inline-flex h-9 items-center rounded-full border border-border/60 px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-colors hover:bg-muted"
              >
                Editar
              </button>
              <button
                onClick={deleteProject}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/30 px-4 text-xs font-bold uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" /> Excluir
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Compartilhar */}
      {shareUrl && (
        <div
          className="flex items-center gap-3 rounded-[20px] bg-card p-4"
          style={{ boxShadow: "var(--via-shadow-card)" }}
        >
          <Share2 className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Link público para o cliente
            </p>
            <p className="truncate text-xs font-light text-foreground">{shareUrl}</p>
          </div>
          <button
            onClick={copyShare}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground hover:bg-primary/90"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}

      {/* Gerações */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Gerações ({assets.length})
          </h2>
          <button
            onClick={() => setOpenAdd(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>

        {assets.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-border/60 p-12 text-center">
            <p className="text-sm font-light text-muted-foreground">
              Nenhuma geração neste projeto ainda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
            {assets.map((a) => {
              const g = a.generations;
              if (!g) return null;
              const thumb = g.thumbnail_url ?? g.final_render_url;
              return (
                <div
                  key={g.id}
                  className="group relative overflow-hidden rounded-xl bg-card"
                  style={{ boxShadow: "var(--via-shadow-card)" }}
                >
                  <Link
                    to="/app/biblioteca"
                    search={{ destacar: g.id }}
                    className="block aspect-square"
                  >
                    {thumb ? (
                      <FreshImg src={thumb} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        sem preview
                      </div>
                    )}
                  </Link>
                  <button
                    onClick={() => removeAsset(g.id)}
                    title="Remover do projeto"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AddGenerationsSheet
        open={openAdd}
        onOpenChange={setOpenAdd}
        projectId={project.id}
        existingIds={existingIds}
        onAdded={() => void reload()}
      />
    </div>
  );
}
