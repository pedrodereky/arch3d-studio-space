import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Plus, Loader2, Calendar, User as UserIcon } from "lucide-react";
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
  created_at: string;
  asset_count?: number;
};

function ProjetosPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
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
        .select("id, name, client_name, deadline, created_at, project_assets(generation_id)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (queryError) throw new Error(queryError.message);
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        client_name: p.client_name,
        deadline: p.deadline,
        created_at: p.created_at,
        asset_count: Array.isArray(p.project_assets) ? p.project_assets.length : 0,
      })) as ProjectRow[];
    },
  });

  const loading = isPending && !!user;

  useEffect(() => {
    if (error) toast.error("Erro ao carregar projetos: " + error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Projetos</h1>
          <p className="mt-2 font-light text-muted-foreground">
            Organize gerações por cliente, obra ou prazo. Compartilhe com seu cliente sem login.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Novo projeto
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-16 text-center">
          <FolderOpen className="mx-auto h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="mt-4 text-base font-bold text-foreground">Nenhum projeto ainda</h3>
          <p className="mt-1 text-sm font-light text-muted-foreground">
            Crie seu primeiro projeto para agrupar gerações por cliente.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Criar projeto
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/app/projetos/$projectId"
              params={{ projectId: p.id }}
              className="group rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/30"
              style={{ boxShadow: "var(--via-shadow-card)" }}
            >
              <h3 className="font-bold text-foreground">{p.name}</h3>
              <div className="mt-3 space-y-1.5 text-xs font-light text-muted-foreground">
                {p.client_name && (
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3 w-3" /> {p.client_name}
                  </div>
                )}
                {p.deadline && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />{" "}
                    {new Date(p.deadline + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                )}
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {p.asset_count} {p.asset_count === 1 ? "geração" : "gerações"}
              </p>
            </Link>
          ))}
        </div>
      )}

      <NewProjectDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: qk.projects() })}
      />
    </div>
  );
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
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Cliente
            </span>
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
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
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
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
