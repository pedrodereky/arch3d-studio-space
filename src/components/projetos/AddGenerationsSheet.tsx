// Sheet para adicionar gerações de uma biblioteca a um projeto.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FreshImg } from "@/components/library/FreshMedia";

type Gen = {
  id: string;
  pipeline_type: string;
  thumbnail_url: string | null;
  final_render_url: string | null;
  prompt: string | null;
  created_at: string;
};

export function AddGenerationsSheet({
  open,
  onOpenChange,
  projectId,
  existingIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  existingIds: Set<string>;
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const {
    data: gens = [],
    isPending,
    error,
  } = useQuery({
    queryKey: qk.generationsList({ view: "add-to-project", userId: user?.id }),
    // Só busca com o sheet aberto; fechado, o cache fica lá para a próxima vez.
    enabled: open && !!user,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("generations")
        .select("id, pipeline_type, thumbnail_url, final_render_url, prompt, created_at")
        .eq("user_id", user!.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(200);
      if (queryError) throw new Error(queryError.message);
      return (data ?? []) as Gen[];
    },
  });

  const loading = isPending && open && !!user;

  useEffect(() => {
    if (error) toast.error("Erro: " + error.message);
  }, [error]);

  // Limpa a seleção a cada abertura.
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  function toggle(id: string) {
    if (existingIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    if (selected.size === 0) return;
    setSaving(true);
    const rows = Array.from(selected).map((gid) => ({
      project_id: projectId,
      generation_id: gid,
    }));
    const { error } = await supabase.from("project_assets").insert(rows);
    setSaving(false);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success(
      `${selected.size} ${selected.size === 1 ? "geração adicionada" : "gerações adicionadas"}`,
    );
    onOpenChange(false);
    onAdded();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xl">
        <SheetHeader>
          <SheetTitle>Adicionar gerações</SheetTitle>
        </SheetHeader>

        <div className="mt-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : gens.length === 0 ? (
            <p className="py-10 text-center text-sm font-light text-muted-foreground">
              Você ainda não tem gerações concluídas.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {gens.map((g) => {
                const already = existingIds.has(g.id);
                const isSel = selected.has(g.id);
                const thumb = g.thumbnail_url ?? g.final_render_url;
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={already}
                    onClick={() => toggle(g.id)}
                    className={`relative aspect-square overflow-hidden rounded-md border-2 transition-all ${
                      already
                        ? "cursor-not-allowed border-emerald-500/60 opacity-60"
                        : isSel
                          ? "border-accent"
                          : "border-border hover:border-accent/50"
                    }`}
                  >
                    {thumb ? (
                      <FreshImg src={thumb} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                        sem preview
                      </div>
                    )}
                    {(isSel || already) && (
                      <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-3 border-t border-border bg-background p-4">
          <p className="text-xs font-light text-muted-foreground">
            {selected.size} selecionada{selected.size === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            disabled={selected.size === 0 || saving}
            onClick={add}
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Adicionar ao projeto
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
