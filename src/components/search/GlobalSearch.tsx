import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Workflow, Image as ImageIcon, CornerDownLeft } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { qk } from "@/lib/query-keys";
import { sanitizeSearchTerm } from "@/lib/search-term";
import { ALL_SCREENS, adminItems, type NavLeaf } from "@/lib/nav-items";
import { PIPELINE_LABEL, pipelineLabel, type PipelineType } from "@/lib/pipeline-labels";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; isAdmin: boolean };

const MIN_CHARS = 2;
const PER_GROUP = 6;

type Hit = {
  kind: "generation" | "project" | "workflow";
  id: string;
  title: string;
  subtitle: string;
};

export function GlobalSearch({ open, onOpenChange, isAdmin }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [term, setTerm] = useState("");

  // Debounce: sem isso cada tecla vira três queries no Supabase.
  useEffect(() => {
    const t = setTimeout(() => setTerm(raw), 250);
    return () => clearTimeout(t);
  }, [raw]);

  // Fecha limpando: reabrir com a busca anterior mostra resultados velhos
  // antes de o usuário perceber que a caixa está preenchida.
  useEffect(() => {
    if (!open) {
      setRaw("");
      setTerm("");
    }
  }, [open]);

  const clean = sanitizeSearchTerm(term);
  const enabled = !!user && clean.length >= MIN_CHARS;

  const { data, isFetching } = useQuery({
    queryKey: qk.globalSearch(user?.id, clean),
    enabled,
    queryFn: async (): Promise<Hit[]> => {
      const like = `%${clean}%`;
      // "redecorar" precisa achar gerações do pipeline `redecorate`: o usuário
      // busca pelo rótulo que a interface mostra, não pelo valor do enum.
      const pipelineMatches = (Object.entries(PIPELINE_LABEL) as [PipelineType, string][])
        .filter(([, label]) => label.toLowerCase().includes(clean.toLowerCase()))
        .map(([id]) => id);

      const genFilter = pipelineMatches.length
        ? `prompt.ilike.${like},pipeline_type.in.(${pipelineMatches.join(",")})`
        : `prompt.ilike.${like}`;

      const [gens, projects, workflows] = await Promise.all([
        supabase
          .from("generations")
          .select("id, prompt, pipeline_type, created_at")
          .eq("user_id", user!.id)
          .or(genFilter)
          .order("created_at", { ascending: false })
          .limit(PER_GROUP),
        supabase
          .from("projects")
          .select("id, name, client_name")
          .eq("user_id", user!.id)
          .or(`name.ilike.${like},client_name.ilike.${like},briefing.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(PER_GROUP),
        supabase
          .from("studio_workflows")
          .select("id, name, updated_at")
          .eq("user_id", user!.id)
          .ilike("name", like)
          .order("updated_at", { ascending: false })
          .limit(PER_GROUP),
      ]);

      // Uma tabela que falha não pode zerar o resultado das outras: a busca
      // mostra o que conseguiu achar.
      const hits: Hit[] = [];
      for (const g of gens.data ?? []) {
        hits.push({
          kind: "generation",
          id: g.id,
          title: g.prompt?.trim() || "Sem descrição",
          subtitle: pipelineLabel(g.pipeline_type),
        });
      }
      for (const p of projects.data ?? []) {
        hits.push({
          kind: "project",
          id: p.id,
          title: p.name,
          subtitle: p.client_name ?? "Sem cliente",
        });
      }
      for (const w of workflows.data ?? []) {
        hits.push({ kind: "workflow", id: w.id, title: w.name, subtitle: "Fluxo do Studio" });
      }
      return hits;
    },
  });

  const destinations = useMemo(() => {
    // ALL_SCREENS e não navSections: a barra lateral agrupa três telas sob
    // "Plantas", mas a busca tem de achar cada uma pelo nome próprio.
    const adminPaths = new Set(adminItems.map((i) => i.to));
    const all = ALL_SCREENS.filter((i) => isAdmin || !adminPaths.has(i.to));
    if (!clean) return all;
    const q = clean.toLowerCase();
    return all.filter((d) => d.label.toLowerCase().includes(q));
  }, [clean, isAdmin]);

  const hits = data ?? [];
  const byKind = (kind: Hit["kind"]) => hits.filter((h) => h.kind === kind);

  function go(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  function openDestination(item: NavLeaf) {
    go(() => navigate({ to: item.to }));
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      {/* Quem filtra é o Postgres, não o cmdk: cada item leva um `value`
          sintético para o cmdk não reordenar nem esconder o que o servidor
          já considerou relevante. */}
      <CommandInput
        value={raw}
        onValueChange={setRaw}
        placeholder="Buscar gerações, projetos, fluxos ou telas…"
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          {clean.length < MIN_CHARS
            ? `Digite ao menos ${MIN_CHARS} caracteres.`
            : isFetching
              ? "Buscando…"
              : "Nada encontrado."}
        </CommandEmpty>

        {destinations.length > 0 && (
          <CommandGroup heading="Ir para">
            {destinations.map((d) => (
              <CommandItem
                key={d.to}
                value={`nav ${d.label}`}
                onSelect={() => openDestination(d)}
                className="gap-3"
              >
                <d.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="flex-1 truncate">{d.label}</span>
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-30" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {byKind("generation").length > 0 && (
          <CommandGroup heading="Gerações">
            {byKind("generation").map((h) => (
              <CommandItem
                key={h.id}
                value={`gen ${h.id}`}
                onSelect={() =>
                  go(() => navigate({ to: "/app/biblioteca", search: { destacar: h.id } }))
                }
                className="gap-3"
              >
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{h.subtitle}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {byKind("project").length > 0 && (
          <CommandGroup heading="Projetos">
            {byKind("project").map((h) => (
              <CommandItem
                key={h.id}
                value={`proj ${h.id}`}
                onSelect={() =>
                  go(() =>
                    navigate({ to: "/app/projetos/$projectId", params: { projectId: h.id } }),
                  )
                }
                className="gap-3"
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{h.subtitle}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {byKind("workflow").length > 0 && (
          <CommandGroup heading="Fluxos do Studio">
            {byKind("workflow").map((h) => (
              <CommandItem
                key={h.id}
                value={`wf ${h.id}`}
                onSelect={() => go(() => navigate({ to: "/app/studio" }))}
                className="gap-3"
              >
                <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{h.subtitle}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
