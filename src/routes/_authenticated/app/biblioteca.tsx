import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Library as LibraryIcon,
  Loader2,
  Search,
  Download,
  Trash2,
  Globe,
  Lock,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  FolderPlus,
  Check,
  RefreshCw,
  Video,
} from "lucide-react";
import { GerarVideoDialog } from "@/components/biblioteca/GerarVideoDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelViewer } from "@/components/library/ModelViewer";
import { FreshImg, FreshVideo, FreshLink } from "@/components/library/FreshMedia";

type BibliotecaSearch = { destacar?: string };

export const Route = createFileRoute("/_authenticated/app/biblioteca")({
  validateSearch: (search: Record<string, unknown>): BibliotecaSearch => ({
    destacar: typeof search.destacar === "string" ? search.destacar : undefined,
  }),
  component: BibliotecaPage,
});

type GenStatus = "queued" | "processing" | "succeeded" | "failed" | "cancelled";

type GenRow = {
  id: string;
  status: GenStatus;
  pipeline_type: string;
  thumbnail_url: string | null;
  final_render_url: string | null;
  video_url: string | null;
  intermediate_images: unknown;
  glb_url: string | null;
  obj_url: string | null;
  fbx_url: string | null;
  source_images: unknown;
  prompt: string | null;
  error_message: string | null;
  is_public: boolean;
  created_at: string;
  completed_at: string | null;
  cost_usd: number | null;
  metadata: unknown;
};

type Filter = "all" | "succeeded" | "processing" | "failed";

const PIPELINE_LABEL: Record<string, string> = {
  direct: "Direto",
  enriched: "Enriquecido",
  edit: "Edita antes",
  in_scene: "Ver no projeto",
  text_to_3d: "Texto para 3D",
  floorplan: "Planta para 3D (descontinuado)",
  scene_to_3d: "Cena para 3D (descontinuado)",
  floorplan_render: "Planta → Render 3D",
  render_to_video: "Render → Vídeo POV",
  redecorate: "Redecoração",
};

type Variation = { url: string; path?: string; seed?: number };

function readVariations(meta: unknown): Variation[] {
  if (!meta || typeof meta !== "object") return [];
  const v = (meta as { variations?: unknown }).variations;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Variation => !!x && typeof x === "object" && typeof (x as Variation).url === "string");
}

type CardItem = {
  gen: GenRow;
  thumbUrl: string | null;
  variantTotal: number;
};

function BibliotecaPage() {
  const { user } = useAuth();
  const { destacar } = Route.useSearch();
  const navigate = useNavigate();

  const [items, setItems] = useState<GenRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openVariant, setOpenVariant] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    const { data, error } = await supabase
      .from("generations")
      .select(
        "id,status,pipeline_type,thumbnail_url,final_render_url,video_url,intermediate_images,glb_url,obj_url,fbx_url,source_images,prompt,error_message,is_public,created_at,completed_at,cost_usd,metadata",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Erro ao carregar biblioteca", { description: error.message });
      setItems([]);
      return;
    }
    setItems((data ?? []) as GenRow[]);
  }

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`lib-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generations", filter: `user_id=eq.${user.id}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user]);

  const destacarRef = useRef<string | null>(null);
  useEffect(() => {
    if (!destacar || !items) return;
    if (destacarRef.current === destacar) return;
    const found = items.find((i) => i.id === destacar);
    if (found) {
      destacarRef.current = destacar;
      setOpenId(destacar);
    }
  }, [destacar, items]);

  const filtered = useMemo<CardItem[]>(() => {
    if (!items) return [];
    const rows = items.filter((it) => {
      if (filter === "succeeded" && it.status !== "succeeded") return false;
      if (filter === "failed" && it.status !== "failed" && it.status !== "cancelled") return false;
      if (filter === "processing" && it.status !== "queued" && it.status !== "processing") return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (
          !(it.prompt ?? "").toLowerCase().includes(q) &&
          !(PIPELINE_LABEL[it.pipeline_type] ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    return rows.map<CardItem>((it) => {
      const variations = it.pipeline_type === "redecorate" ? readVariations(it.metadata) : [];
      return {
        gen: it,
        thumbUrl: it.thumbnail_url ?? firstSource(it.source_images),
        variantTotal: variations.length,
      };
    });
  }, [items, filter, query]);

  const counts = useMemo(() => {
    const c = { all: 0, succeeded: 0, processing: 0, failed: 0 };
    for (const it of items ?? []) {
      c.all++;
      if (it.status === "succeeded") c.succeeded++;
      else if (it.status === "queued" || it.status === "processing") c.processing++;
      else if (it.status === "failed" || it.status === "cancelled") c.failed++;
    }
    return c;
  }, [items]);

  const openItem = items?.find((i) => i.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Biblioteca
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground">
            Suas gerações
          </h1>
          <p className="mt-3 max-w-xl font-light text-muted-foreground">
            Tudo que você gerou aparece aqui. Baixe, torne público ou adicione a um projeto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/app/gerar" })}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[12px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          Nova geração
        </button>
      </div>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
            Todas
          </FilterChip>
          <FilterChip
            active={filter === "succeeded"}
            onClick={() => setFilter("succeeded")}
            count={counts.succeeded}
          >
            Prontas
          </FilterChip>
          <FilterChip
            active={filter === "processing"}
            onClick={() => setFilter("processing")}
            count={counts.processing}
          >
            Processando
          </FilterChip>
          <FilterChip
            active={filter === "failed"}
            onClick={() => setFilter("failed")}
            count={counts.failed}
          >
            Falhas
          </FilterChip>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por prompt ou pipeline"
            className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm font-light text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none sm:w-72"
          />
        </div>
      </div>

      <div className="mt-8">
        {items === null ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onGenerate={() => navigate({ to: "/app/gerar" })} hasAny={items.length > 0} />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((it) => (
              <Card
                key={it.gen.id}
                gen={it.gen}
                thumbUrl={it.thumbUrl}
                variantTotal={it.variantTotal}
                highlighted={destacar === it.gen.id}
                onOpen={() => {
                  setOpenId(it.gen.id);
                  setOpenVariant(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setOpenVariant(null);
            if (destacar) navigate({ to: "/app/biblioteca", search: {} });
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {openItem && (
            <DetailPanel
              gen={openItem}
              selectedVariant={openVariant}
              onSelectVariant={setOpenVariant}
              onChange={() => void load()}
              onClose={() => {
                setOpenId(null);
                setOpenVariant(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Card({
  gen,
  thumbUrl,
  variantTotal,
  highlighted,
  onOpen,
}: {
  gen: GenRow;
  thumbUrl?: string | null;
  variantTotal?: number;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const thumb = thumbUrl ?? gen.thumbnail_url ?? firstSource(gen.source_images);
  const hasStack = (variantTotal ?? 0) > 1;
  return (
    <div className="relative">
      {hasStack && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 translate-x-2 translate-y-2 rounded-2xl border border-border/40 bg-card"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 translate-x-1 translate-y-1 rounded-2xl border border-border/50 bg-card"
          />
        </>
      )}
      <button
        type="button"
        onClick={onOpen}
        className={
          "group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all " +
          (highlighted
            ? "border-accent shadow-lg ring-2 ring-accent/30"
            : "border-border/60 hover:border-accent/40 hover:shadow-md")
        }
      >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {thumb ? (
          <FreshImg
            src={thumb}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : gen.status === "succeeded" && gen.glb_url ? (
          <div className="pointer-events-none h-full w-full">
            <ModelViewer src={gen.glb_url} alt={gen.prompt ?? "Modelo 3D"} compact />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <LibraryIcon className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <StatusPill status={gen.status} />
        </div>
        {gen.is_public && (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-[4px] bg-primary/90 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-primary-foreground">
            <Globe className="h-3 w-3" />
            Público
          </div>
        )}
        {hasStack && (
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-[4px] bg-foreground/85 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-background">
            {variantTotal} variações
          </div>
        )}
        {gen.video_url && (
          <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-[4px] bg-foreground/85 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-background">
            <Video className="h-3 w-3" />
            Vídeo
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {PIPELINE_LABEL[gen.pipeline_type] ?? gen.pipeline_type}
        </p>
        <p className="line-clamp-2 text-sm font-light text-foreground">
          {gen.prompt?.trim() || "Sem descrição"}
        </p>
        <p className="mt-1 text-[11px] font-light text-muted-foreground">
          {formatDate(gen.created_at)}
        </p>
      </div>
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: GenStatus }) {
  const map = {
    succeeded: { label: "Pronto", icon: CheckCircle2, cls: "bg-emerald-600/90 text-white", spin: false },
    queued: { label: "Em fila", icon: Clock, cls: "bg-amber-500/90 text-white", spin: false },
    processing: { label: "Processando", icon: Loader2, cls: "bg-accent/90 text-accent-foreground", spin: true },
    failed: { label: "Falhou", icon: AlertTriangle, cls: "bg-red-600/90 text-white", spin: false },
    cancelled: { label: "Cancelado", icon: X, cls: "bg-muted-foreground/80 text-white", spin: false },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] " +
        m.cls
      }
    >
      <Icon className={`h-3 w-3 ${m.spin ? "animate-spin" : ""}`} />
      {m.label}
    </span>
  );
}

function DetailPanel({
  gen,
  selectedVariant,
  onSelectVariant,
  onChange,
  onClose,
}: {
  gen: GenRow;
  selectedVariant: number | null;
  onSelectVariant: (i: number | null) => void;
  onChange: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const navigate = useNavigate();
  const variations = readVariations(gen.metadata);
  const activeVariant =
    variations.length > 0 && selectedVariant !== null && selectedVariant < variations.length
      ? variations[selectedVariant]
      : null;
  const thumb =
    activeVariant?.url ?? gen.thumbnail_url ?? firstSource(gen.source_images);
  const renderUrl =
    activeVariant?.url ?? gen.final_render_url ?? gen.thumbnail_url ?? firstSource(gen.source_images);
  const canMakeVideo =
    gen.status === "succeeded" &&
    gen.pipeline_type === "floorplan_render" &&
    !!renderUrl;

  function regenerate() {
    onClose();
    navigate({ to: "/app/gerar", search: { from: gen.id } } as never);
  }

  async function togglePublic() {
    setBusy("public");
    const { error } = await supabase
      .from("generations")
      .update({ is_public: !gen.is_public })
      .eq("id", gen.id);
    setBusy(null);
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success(gen.is_public ? "Marcado como privado" : "Tornado público");
      onChange();
    }
  }

  async function remove() {
    if (!confirm("Excluir esta geração? A ação não pode ser desfeita.")) return;
    setBusy("delete");
    const { error } = await supabase.from("generations").delete().eq("id", gen.id);
    setBusy(null);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      toast.success("Geração excluída");
      onClose();
      onChange();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SheetHeader>
        <SheetTitle className="text-2xl font-black tracking-tight">
          {PIPELINE_LABEL[gen.pipeline_type] ?? gen.pipeline_type}
          {activeVariant && (
            <span className="ml-2 text-sm font-light text-muted-foreground">
              · Variação {(selectedVariant ?? 0) + 1}/{variations.length}
            </span>
          )}
        </SheetTitle>
      </SheetHeader>

      {gen.status === "succeeded" && gen.video_url ? (
        <FreshVideo
          src={gen.video_url}
          poster={thumb ?? undefined}
          controls
          className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black"
        />
      ) : gen.status === "succeeded" && gen.glb_url ? (
        <ModelViewer src={gen.glb_url} poster={thumb ?? undefined} alt={gen.prompt ?? "Modelo 3D"} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-muted">
          {thumb ? (
            <FreshImg src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center">
              <LibraryIcon className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.25} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <StatusPill status={gen.status} />
        {gen.is_public && (
          <span className="inline-flex items-center gap-1 rounded-[4px] bg-primary/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-primary">
            <Globe className="h-3 w-3" />
            Público
          </span>
        )}
        <span className="ml-auto text-[11px] font-light text-muted-foreground">
          {formatDate(gen.created_at)}
        </span>
      </div>

      {gen.prompt && (
        <Section label="Descrição">
          <p className="text-sm font-light text-foreground">{gen.prompt}</p>
        </Section>
      )}

      <VariationsPanel
        gen={gen}
        variations={variations}
        selectedVariant={selectedVariant}
        onSelectVariant={onSelectVariant}
        onChange={onChange}
        disabled={!!busy}
      />
      <CandidatesPanel gen={gen} onChange={onChange} disabled={!!busy} />
      <CleanAssetsPanel gen={gen} />

      {gen.status === "failed" && gen.error_message && (
        <Section label="Erro">
          <p className="text-sm font-light text-red-700">{gen.error_message}</p>
        </Section>
      )}

      {gen.status === "succeeded" && (
        <Section label="Downloads">
          <div className="flex flex-wrap gap-2">
            {activeVariant && (
              <DownloadBtn
                href={activeVariant.url}
                label={`Variação ${(selectedVariant ?? 0) + 1}`}
              />
            )}
            {gen.glb_url && <DownloadBtn href={gen.glb_url} label="GLB" />}
            {gen.obj_url && <DownloadBtn href={gen.obj_url} label="OBJ" />}
            {gen.fbx_url && <DownloadBtn href={gen.fbx_url} label="FBX" />}
            {!activeVariant && !gen.glb_url && !gen.obj_url && !gen.fbx_url && (
              <p className="text-sm font-light text-muted-foreground">Sem arquivos disponíveis.</p>
            )}
          </div>
        </Section>
      )}

      {gen.cost_usd != null && Number(gen.cost_usd) > 0 && (
        <Section label="Custo">
          <p className="text-sm font-light text-foreground">
            US$ {Number(gen.cost_usd).toFixed(4)}
          </p>
        </Section>
      )}

      <div className="mt-2 flex flex-wrap gap-3 border-t border-border pt-6">
        <button
          type="button"
          onClick={regenerate}
          disabled={!!busy}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </button>
        <button
          type="button"
          onClick={togglePublic}
          disabled={!!busy}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {gen.is_public ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
          {gen.is_public ? "Tornar privado" : "Tornar público"}
        </button>
        <AddToProject generationId={gen.id} disabled={!!busy} />
        {canMakeVideo && !gen.video_url && (
          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            disabled={!!busy}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Video className="h-3.5 w-3.5" />
            Gerar vídeo POV
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={!!busy}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-red-200 bg-background px-4 text-[11px] font-black uppercase tracking-[0.12em] text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </button>
      </div>

      {canMakeVideo && (
        <GerarVideoDialog
          open={videoOpen}
          onOpenChange={setVideoOpen}
          sourceGenerationId={gen.id}
          sourceRenderUrl={renderUrl}
          onCreated={() => onChange()}
        />
      )}
    </div>
  );
}

type CandidateMeta = { variant: string; url: string };

function VariationsPanel({
  gen,
  variations,
  selectedVariant,
  onSelectVariant,
  onChange,
  disabled,
}: {
  gen: GenRow;
  variations: Variation[];
  selectedVariant: number | null;
  onSelectVariant: (i: number | null) => void;
  onChange: () => void;
  disabled: boolean;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (variations.length === 0) return null;

  async function setAsPrimary(v: Variation) {
    setBusy(true);
    const { error } = await supabase
      .from("generations")
      .update({ thumbnail_url: v.url, final_render_url: v.url })
      .eq("id", gen.id);
    setBusy(false);
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Definida como principal");
      onChange();
    }
  }

  async function promote(i: number) {
    if (!user) return;
    const v = variations[i];
    if (!v) return;
    setBusy(true);
    const remaining = variations.filter((_, idx) => idx !== i);
    const originalMeta = (gen.metadata && typeof gen.metadata === "object" ? gen.metadata : {}) as Record<string, unknown>;
    const { data: created, error: insErr } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        pipeline_type: "redecorate" as never,
        status: "succeeded" as never,
        prompt: gen.prompt,
        source_images: (gen.source_images as never) ?? [],
        thumbnail_url: v.url,
        final_render_url: v.url,
        context_image_url: v.url,
        cost_usd: 0,
        metadata: {
          variations: [v],
          promoted_from: gen.id,
          original_seed: v.seed ?? null,
        } as never,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      setBusy(false);
      toast.error("Erro ao promover", { description: insErr?.message });
      return;
    }
    const { error: updErr } = await supabase
      .from("generations")
      .update({ metadata: { ...originalMeta, variations: remaining } as never })
      .eq("id", gen.id);
    setBusy(false);
    if (updErr) {
      toast.error("Promovida, mas falhou ao atualizar original", { description: updErr.message });
    } else {
      toast.success("Variação promovida — agora aparece como item separado");
    }
    onSelectVariant(null);
    onChange();
  }

  return (
    <Section label={`Variações (${variations.length})`}>
      <div className="grid grid-cols-4 gap-2">
        {variations.map((v, i) => {
          const active = selectedVariant === i;
          const isPrimary = gen.thumbnail_url === v.url;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectVariant(active ? null : i)}
              className={
                "group relative aspect-square overflow-hidden rounded-lg border transition-all " +
                (active ? "border-accent ring-2 ring-accent/40" : "border-border/60 hover:border-accent/40")
              }
            >
              <FreshImg src={v.url} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[9px] font-black text-background">
                {i + 1}
              </span>
              {isPrimary && (
                <span className="absolute right-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                  ★
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selectedVariant !== null && variations[selectedVariant] && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || disabled || gen.thumbnail_url === variations[selectedVariant].url}
            onClick={() => setAsPrimary(variations[selectedVariant]!)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Definir como principal
          </button>
          <FreshLink href={variations[selectedVariant].url} download>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-accent">
              <Download className="h-3.5 w-3.5" />
              Baixar variação
            </span>
          </FreshLink>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => void promote(selectedVariant)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Promover a geração
          </button>
        </div>
      )}
    </Section>
  );
}

function CandidatesPanel({
  gen,
  onChange,
  disabled,
}: {
  gen: GenRow;
  onChange: () => void;
  disabled: boolean;
}) {
  // Hooks antes de qualquer early return: a contagem de candidatos muda entre
  // renders (realtime) e um return antecipado acima do useState quebraria a
  // ordem dos hooks.
  const [busyVariant, setBusyVariant] = useState<string | null>(null);
  const meta = (gen.metadata ?? {}) as { candidates?: CandidateMeta[] };
  const candidates = Array.isArray(meta.candidates) ? meta.candidates : [];
  const primaryUrl = gen.final_render_url ?? gen.thumbnail_url;

  async function setAsPrimary(c: CandidateMeta) {
    if (disabled || busyVariant) return;
    setBusyVariant(c.variant);
    const intermediates = candidates.filter((x) => x.url !== c.url).map((x) => x.url);
    const { error } = await supabase
      .from("generations")
      .update({
        final_render_url: c.url,
        thumbnail_url: c.url,
        intermediate_images: intermediates,
      })
      .eq("id", gen.id);
    setBusyVariant(null);
    if (error) toast.error("Erro ao definir principal", { description: error.message });
    else {
      toast.success(`Variante "${c.variant}" definida como principal`);
      onChange();
    }
  }

  if (candidates.length < 2) return null;

  return (
    <Section label={`Candidatos (${candidates.length})`}>
      <div className="grid grid-cols-2 gap-3">
        {candidates.map((c) => {
          const isPrimary = c.url === primaryUrl;
          return (
            <div
              key={c.variant}
              className={
                "flex flex-col gap-2 overflow-hidden rounded-2xl border bg-card " +
                (isPrimary ? "border-accent ring-1 ring-accent/40" : "border-border")
              }
            >
              <div className="aspect-[3/2] overflow-hidden bg-muted">
                <FreshImg src={c.url} alt={c.variant} className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between gap-2 px-3 pb-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                  {c.variant}
                </span>
                {isPrimary ? (
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-accent">
                    Principal
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAsPrimary(c)}
                    disabled={disabled || !!busyVariant}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {busyVariant === c.variant ? "..." : "Definir como principal"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

type CleanAssetMeta = { type: string; url: string; path?: string };

function CleanAssetsPanel({ gen }: { gen: GenRow }) {
  const meta = (gen.metadata ?? {}) as { asset_urls?: CleanAssetMeta[] };
  const assets = Array.isArray(meta.asset_urls) ? meta.asset_urls : [];
  if (assets.length === 0) return null;
  return (
    <Section label={`Assets limpos (${assets.length})`}>
      <div className="grid grid-cols-3 gap-2">
        {assets.map((a) => (
          <FreshLink
            key={a.type}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col gap-1 overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-accent"
          >
            <div className="aspect-square overflow-hidden bg-muted">
              <FreshImg src={a.url} alt={a.type} className="h-full w-full object-contain" />
            </div>
            <span className="px-2 pb-2 text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">
              {a.type.replace(/_/g, " ")}
            </span>
          </FreshLink>
        ))}
      </div>
    </Section>
  );
}

function AddToProject({ generationId, disabled }: { generationId: string; disabled?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function loadProjects() {
    if (!user) return;
    setLoading(true);
    const [{ data: ps }, { data: links }] = await Promise.all([
      supabase.from("projects").select("id,name").order("created_at", { ascending: false }),
      supabase.from("project_assets").select("project_id").eq("generation_id", generationId),
    ]);
    setProjects((ps ?? []) as Array<{ id: string; name: string }>);
    setLinkedIds(new Set((links ?? []).map((l: { project_id: string }) => l.project_id)));
    setLoading(false);
  }

  async function toggle(projectId: string) {
    const isLinked = linkedIds.has(projectId);
    if (isLinked) {
      const { error } = await supabase
        .from("project_assets")
        .delete()
        .eq("project_id", projectId)
        .eq("generation_id", generationId);
      if (error) {
        toast.error("Erro", { description: error.message });
        return;
      }
      setLinkedIds((s) => {
        const n = new Set(s);
        n.delete(projectId);
        return n;
      });
      toast.success("Removido do projeto");
    } else {
      const { error } = await supabase
        .from("project_assets")
        .insert({ project_id: projectId, generation_id: generationId });
      if (error) {
        toast.error("Erro", { description: error.message });
        return;
      }
      setLinkedIds((s) => new Set(s).add(projectId));
      toast.success("Adicionado ao projeto");
    }
  }

  async function createAndAdd() {
    if (!user || !newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: newName.trim() })
      .select("id,name")
      .single();
    if (error || !data) {
      setCreating(false);
      toast.error("Erro ao criar projeto", { description: error?.message });
      return;
    }
    const { error: linkErr } = await supabase
      .from("project_assets")
      .insert({ project_id: data.id, generation_id: generationId });
    setCreating(false);
    if (linkErr) {
      toast.error("Erro", { description: linkErr.message });
      return;
    }
    setProjects((p) => [data, ...p]);
    setLinkedIds((s) => new Set(s).add(data.id));
    setNewName("");
    toast.success(`Adicionado a "${data.name}"`);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void loadProjects();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Adicionar a projeto
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Seus projetos
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <p className="px-2 py-3 text-xs font-light text-muted-foreground">
            Você ainda não tem projetos.
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            {projects.map((p) => {
              const linked = linkedIds.has(p.id);
              return (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    void toggle(p.id);
                  }}
                  className="flex items-center justify-between gap-2 text-sm font-light"
                >
                  <span className="truncate">{p.name}</span>
                  {linked && <Check className="h-4 w-4 text-accent" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
        <DropdownMenuSeparator />
        <div className="flex items-center gap-2 p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Novo projeto"
            className="h-9 flex-1 rounded-full border border-border bg-background px-3 text-xs font-light text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createAndAdd();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void createAndAdd()}
            disabled={creating || !newName.trim()}
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-3 text-[10px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Criar
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function DownloadBtn({ href, label }: { href: string; label: string }) {
  return (
    <FreshLink
      href={href}
      download
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </FreshLink>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-colors " +
        (active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-foreground hover:bg-muted")
      }
    >
      {children}
      <span
        className={
          "rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold " +
          (active ? "bg-accent-foreground/15 text-accent-foreground" : "bg-muted text-muted-foreground")
        }
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ onGenerate, hasAny }: { onGenerate: () => void; hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/[0.06] text-primary">
        <LibraryIcon className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <h3 className="mt-5 text-xl font-black tracking-tight text-foreground">
        {hasAny ? "Nada por aqui" : "Sua biblioteca está vazia"}
      </h3>
      <p className="mt-2 max-w-md text-sm font-light text-muted-foreground">
        {hasAny
          ? "Tente outro filtro ou limpe a busca."
          : "Gere seu primeiro modelo 3D para começar a montar sua biblioteca."}
      </p>
      {!hasAny && (
        <button
          type="button"
          onClick={onGenerate}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[12px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          Gerar agora
        </button>
      )}
    </div>
  );
}

function firstSource(src: unknown): string | null {
  if (Array.isArray(src) && typeof src[0] === "string") return src[0];
  return null;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
