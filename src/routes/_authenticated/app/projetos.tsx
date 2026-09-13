import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Plus, Loader2, ChevronRight, Link2, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FreshImg } from "@/components/library/FreshMedia";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/projetos")({
  component: ProjetosPage,
});

type ProjectRow = {
  id: string;
  name: string;
  client_name: string | null;
  deadline: string | null;
  share_token: string | null;
  updated_at: string;
  thumbs: string[];
  asset_count: number;
};

function ProjetosPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // O painel acompanha a linha sob o cursor/foco; a primeira é o padrão. As
  // linhas continuam sendo links — o painel é prévia, não navegação.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: projects = [],
    isPending,
    error,
  } = useQuery({
    queryKey: qk.projectsList(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("projects")
        .select(
          "id, name, client_name, deadline, share_token, updated_at, project_assets(generation_id, generations(thumbnail_url, final_render_url))",
        )
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (queryError) throw new Error(queryError.message);
      return (data ?? []).map((p) => {
        const assets = Array.isArray(p.project_assets) ? p.project_assets : [];
        return {
          id: p.id,
          name: p.name,
          client_name: p.client_name,
          deadline: p.deadline,
          share_token: p.share_token,
          updated_at: p.updated_at,
          asset_count: assets.length,
          thumbs: assets
            .map((a) => {
              const g = a.generations as {
                thumbnail_url: string | null;
                final_render_url: string | null;
              } | null;
              return g?.thumbnail_url ?? g?.final_render_url ?? null;
            })
            .filter((u): u is string => !!u),
        };
      }) as ProjectRow[];
    },
  });

  const loading = isPending && !!user;

  useEffect(() => {
    if (error) toast.error("Erro ao carregar projetos: " + error.message);
  }, [error]);

  const preview = projects.find((p) => p.id === previewId) ?? projects[0] ?? null;

  return (
    <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
      <div className="min-w-0">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
              Projetos
            </h1>
            <p className="mt-2 font-light text-muted-foreground">
              Agrupe gerações por cliente e compartilhe sem exigir login.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Novo projeto
          </button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-7 rounded-[20px] border border-dashed border-border/60 p-16 text-center">
            <FolderOpen className="mx-auto h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="mt-4 text-base font-bold text-foreground">Nenhum projeto ainda</h3>
            <p className="mt-1 text-sm font-light text-muted-foreground">
              Crie seu primeiro projeto para agrupar gerações por cliente.
            </p>
            <button
              onClick={() => setOpen(true)}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Criar projeto
            </button>
          </div>
        ) : (
          <div className="mt-7 flex flex-col gap-2.5">
            {projects.map((p) => {
              const active = preview?.id === p.id;
              return (
                <Link
                  key={p.id}
                  to="/app/projetos/$projectId"
                  params={{ projectId: p.id }}
                  onMouseEnter={() => setPreviewId(p.id)}
                  onFocus={() => setPreviewId(p.id)}
                  className={
                    "flex items-center justify-between gap-5 rounded-xl border px-[22px] py-[18px] transition-colors " +
                    (active
                      ? "border-accent-foreground/25 bg-accent"
                      : "border-border/60 bg-card hover:border-accent-foreground/25")
                  }
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex shrink-0 gap-1">
                      {p.thumbs.slice(0, 2).map((t) => (
                        <FreshImg
                          key={t}
                          src={t}
                          alt=""
                          className="h-[34px] w-[34px] rounded-md object-cover"
                        />
                      ))}
                      {p.thumbs.length === 0 && (
                        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-muted">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="mt-1 truncate text-[11.5px] font-light text-muted-foreground">
                        {p.client_name ? `${p.client_name} · ` : ""}
                        {p.asset_count} {p.asset_count === 1 ? "peça" : "peças"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-[18px]">
                    <span className="hidden text-[11.5px] font-light text-muted-foreground sm:inline">
                      {relativeDate(p.updated_at)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}

            <button
              onClick={() => setOpen(true)}
              className="flex items-center justify-between gap-5 rounded-xl border border-dashed border-border px-[22px] py-[18px] text-left transition-colors hover:border-accent-foreground/40"
            >
              <div>
                <p className="text-sm font-semibold text-accent-foreground">Novo projeto</p>
                <p className="mt-1 text-[11.5px] font-light text-muted-foreground">
                  Nome, cliente e prazo
                </p>
              </div>
              <Plus className="h-4 w-4 text-accent-foreground" />
            </button>
          </div>
        )}
      </div>

      {preview && <PreviewPanel project={preview} />}

      <NewProjectDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: qk.projects() })}
      />
    </div>
  );
}

/** Prévia do projeto em foco: as peças, os dados e o link do cliente à mão. */
function PreviewPanel({ project }: { project: ProjectRow }) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    project.share_token && typeof window !== "undefined"
      ? `${window.location.origin}/p/${project.share_token}`
      : null;

  async function copy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copiado");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <aside className="hidden min-w-0 lg:block lg:pt-2">
      <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {project.name}
      </p>
      <div
        className="mt-3 rounded-[20px] bg-card p-5"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        {project.thumbs.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5">
            {project.thumbs.slice(0, 6).map((t) => (
              <FreshImg
                key={t}
                src={t}
                alt=""
                className="aspect-square w-full rounded-md object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="rounded-md bg-muted/50 px-3 py-6 text-center text-[11.5px] font-light text-muted-foreground">
            Nenhuma peça neste projeto ainda.
          </p>
        )}

        <dl className="mt-[18px] flex flex-col gap-3">
          <MetaRow label="Cliente" value={project.client_name ?? "—"} />
          <MetaRow
            label="Prazo"
            value={
              project.deadline
                ? new Date(project.deadline + "T00:00:00").toLocaleDateString("pt-BR")
                : "—"
            }
          />
          <MetaRow label="Peças" value={String(project.asset_count)} />
        </dl>

        <div className="my-[18px] h-px bg-border/60" />

        {shareUrl ? (
          <>
            <div className="flex h-10 items-center gap-2.5 rounded-lg bg-muted px-3.5">
              <Link2 className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-light text-muted-foreground">
                {shareUrl.replace(/^https?:\/\//, "")}
              </span>
              <button
                onClick={copy}
                className="shrink-0 text-[11px] font-semibold text-accent-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : "Copiar"}
              </button>
            </div>
            <p className="mt-2.5 text-[11px] font-light leading-relaxed text-muted-foreground">
              Quem abrir vê as peças do projeto, sem precisar de conta.
            </p>
          </>
        ) : (
          <p className="text-[11px] font-light leading-relaxed text-muted-foreground">
            Este projeto ainda não tem link público.
          </p>
        )}

        <Link
          to="/app/projetos/$projectId"
          params={{ projectId: project.id }}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full border border-border/60 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted"
        >
          Abrir projeto
        </Link>
      </div>
    </aside>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] font-light text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-[12px] font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function relativeDate(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return new Date(iso).toLocaleDateString("pt-BR");
  }
}

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("projects").insert({
      user_id: user.id,
      name: name.trim(),
      client_name: client.trim() || null,
      deadline: deadline || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao criar: " + error.message);
      return;
    }
    setName("");
    setClient("");
    setDeadline("");
    onOpenChange(false);
    onCreated();
    toast.success("Projeto criado");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Nome
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/60 bg-card px-3.5 text-sm font-light outline-none focus:border-accent-foreground/40"
            />
          </label>
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
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border px-5 text-xs font-bold uppercase tracking-[0.12em] text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Criar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
