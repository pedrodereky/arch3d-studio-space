import { Sparkles, ArrowRight, ImageUp, X, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { RefinePromptDialog } from "@/components/gerar/RefinePromptDialog";
import { pollGenerationStatus } from "@/lib/poll-generation";
import { qk } from "@/lib/query-keys";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type GerarSearch = { from?: string };

export const Route = createFileRoute("/_authenticated/app/gerar/")({
  validateSearch: (search: Record<string, unknown>): GerarSearch => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  component: GerarPage,
});

type PipelineId = "direct" | "enriched" | "edit" | "text_to_3d";

type Pipeline = {
  id: PipelineId;
  title: string;
  desc: string;
  recommended?: boolean;
  estSeconds: number;
};

type EngineId = "hunyuan_2_1" | "hunyuan_3_1";

/**
 * Custo por geração, em dólar. Só existe número publicado para o motor de
 * imagem — é o mesmo que a tela do motor já mostrava. `null` significa "não
 * temos estimativa", e a tela diz isso em vez de inventar um número.
 */
const ENGINE_COST_USD: Record<EngineId, number | null> = {
  hunyuan_2_1: 0.05,
  hunyuan_3_1: null,
};

const PIPELINES: Pipeline[] = [
  {
    id: "direct",
    title: "Direto",
    desc: "Foto pronta vira 3D na hora. Use quando o objeto já está com fundo limpo.",
    estSeconds: 45,
  },
  {
    id: "enriched",
    title: "Enriquecido",
    desc: "IA limpa fundo e gera vistas multi-view antes do 3D. Resultado superior.",
    recommended: true,
    estSeconds: 90,
  },
  {
    id: "edit",
    title: "Edita antes",
    desc: "Modifica cor, material ou tamanho antes de virar 3D.",
    estSeconds: 120,
  },
  {
    id: "text_to_3d",
    title: "Texto para 3D",
    desc: "Descreva o objeto e a IA cria o modelo 3D do zero. Sem precisar de imagem.",
    estSeconds: 150,
  },
];

const TEXT_PROMPT_SUGGESTIONS = [
  "Poltrona art déco em veludo verde com detalhes em latão polido, estilo dos anos 1920, render fotorrealista, iluminação de estúdio",
  "Mesa lateral redonda em mármore travertino com base em aço escovado, design escandinavo minimalista",
  "Luminária pendente orgânica em vidro fosco soprado, formato de gota, acabamento dourado fosco no topo",
  "Estante modular em carvalho natural com gavetas embutidas, estilo japandi, proporções equilibradas",
];

const EDIT_SUGGESTIONS = [
  "Mudar para dourado",
  "Aumentar 30%",
  "Estilo art déco",
  "Acabamento fosco",
  "Cor preta",
  "Material em mármore",
];

function GerarPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { from } = Route.useSearch();

  const [pipelineId, setPipelineId] = useState<PipelineId>("enriched");
  const [engine, setEngine] = useState<EngineId>("hunyuan_2_1");
  const [primary, setPrimary] = useState<File | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [textPrompt, setTextPrompt] = useState("");

  const [reusedFrom, setReusedFrom] = useState<{
    id: string;
    sourceImages: string[];
    contextImageUrl: string | null;
    pipelineLabel: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progressGenId, setProgressGenId] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);

  const pipeline = PIPELINES.find((p) => p.id === pipelineId)!;
  const isTextPipeline = pipelineId === "text_to_3d";
  const effectiveEngine: EngineId = isTextPipeline ? "hunyuan_3_1" : engine;

  const hasReusedSource = (reusedFrom?.sourceImages.length ?? 0) > 0;
  const primarySatisfied = !!primary || hasReusedSource;

  const canGenerate = isTextPipeline
    ? textPrompt.trim().length >= 10
    : primarySatisfied && (pipelineId !== "edit" || editPrompt.trim().length > 0);

  // Carrega geração de origem quando ?from=<id>
  const loadedFromRef = useRef<string | null>(null);
  const { data: sourceGeneration, error: sourceError } = useQuery({
    queryKey: qk.generation(from ?? ""),
    enabled: !!user && !!from,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generations")
        .select("id,pipeline_type,engine,source_images,context_image_url,prompt,edit_instruction")
        .eq("id", from!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    if (sourceError || (sourceGeneration === null && from)) {
      toast.error("Não foi possível carregar a geração de origem");
      navigate({ to: "/app/gerar", search: {} } as never);
    }
  }, [sourceError, sourceGeneration, from, navigate]);

  // Semeia o formulário uma vez por `from`; o ref impede que uma revalidação
  // sobrescreva o que o usuário já ajustou na tela.
  useEffect(() => {
    const data = sourceGeneration;
    if (!data || !from || loadedFromRef.current === from) return;
    loadedFromRef.current = from;

    const pt = data.pipeline_type as string;
    // Pipelines descontinuados: cai para o recomendado
    if (pt !== "direct" && pt !== "enriched" && pt !== "edit" && pt !== "text_to_3d") {
      toast.info("Este modo foi descontinuado — usando Enriquecido");
      setPipelineId("enriched");
    } else {
      setPipelineId(pt as PipelineId);
    }
    if (data.engine === "hunyuan_2_1" || data.engine === "hunyuan_3_1") {
      setEngine(data.engine);
    }
    const srcs = Array.isArray(data.source_images)
      ? (data.source_images as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    setReusedFrom({
      id: data.id,
      sourceImages: srcs,
      contextImageUrl: (data.context_image_url as string | null) ?? null,
      pipelineLabel: PIPELINES.find((p) => p.id === pt)?.title ?? pt,
    });
    const promptStr = (data.prompt as string | null) ?? "";
    if (pt === "text_to_3d") {
      setTextPrompt(promptStr);
    } else if (pt === "edit") {
      setEditPrompt((data.edit_instruction as string | null) ?? "");
      setInstruction(promptStr);
    } else {
      setInstruction(promptStr);
    }
    toast.success("Geração carregada — ajuste e gere de novo");
  }, [sourceGeneration, from]);

  const clearReused = () => {
    setReusedFrom(null);
    loadedFromRef.current = null;
    setPrimary(null);
    setInstruction("");
    setEditPrompt("");
    setTextPrompt("");
    navigate({ to: "/app/gerar", search: {} } as never);
  };

  useEffect(() => {
    setEditPrompt("");
    if (reusedFrom && reusedFrom.pipelineLabel !== pipeline.title) {
      setReusedFrom(null);
      loadedFromRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  const uploadToInputs = async (file: File, genId: string, name: string) => {
    if (!user) throw new Error("Sem usuário");
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${user.id}/${genId}/${name}.${ext}`;
    const { error } = await supabase.storage
      .from("inputs")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data: signed } = await supabase.storage
      .from("inputs")
      .createSignedUrl(path, 60 * 60 * 6);
    return signed?.signedUrl ?? path;
  };

  const handleGenerate = async (overridePrompt?: string) => {
    if (!user || submitting) return;
    const effectivePrompt = isTextPipeline ? (overridePrompt ?? textPrompt).trim() : instruction;
    if (isTextPipeline ? effectivePrompt.length < 10 : !canGenerate) return;
    setSubmitting(true);
    try {
      const { data: gen, error: insErr } = await supabase
        .from("generations")
        .insert({
          user_id: user.id,
          pipeline_type: pipelineId,
          engine: effectiveEngine,
          status: "queued",
          source_images: [],
          prompt: isTextPipeline ? effectivePrompt : instruction || null,
          edit_instruction: pipelineId === "edit" ? editPrompt : null,
        } as TablesInsert<"generations">)
        .select("id")
        .single();
      if (insErr || !gen) throw insErr ?? new Error("Falha ao criar geração");

      if (!isTextPipeline) {
        let sources: string[] = [];

        if (primary) {
          const primaryUrl = await uploadToInputs(primary, gen.id, "source");
          sources = [primaryUrl];
        } else if (hasReusedSource && reusedFrom) {
          sources = reusedFrom.sourceImages;
        }

        await supabase
          .from("generations")
          .update({
            source_images: sources,
            prompt: instruction,
          } as TablesUpdate<"generations">)
          .eq("id", gen.id);
      }

      const { error: fnErr } = await supabase.functions.invoke("orchestrate-generation", {
        body: { generationId: gen.id },
      });
      if (fnErr) throw fnErr;

      setProgressGenId(gen.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao iniciar geração";
      toast.error("Erro ao gerar", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!progressGenId) return;
    const genId = progressGenId;
    // `settled` garante que realtime e polling não resolvam a mesma geração duas vezes.
    let settled = false;

    const onSucceeded = async () => {
      if (settled) return;
      settled = true;
      await refreshProfile?.();
      navigate({ to: "/app/biblioteca", search: { destacar: genId } } as never);
    };

    const onFailed = (description?: string) => {
      if (settled) return;
      settled = true;
      toast.error("Geração falhou", description ? { description } : undefined);
      setProgressGenId(null);
    };

    // Caminho rápido: realtime.
    const channel = supabase
      .channel(`gen-${genId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generations",
          filter: `id=eq.${genId}`,
        },
        (payload) => {
          const row = payload.new as { status: string; error_message?: string | null };
          if (row.status === "succeeded") {
            void onSucceeded();
          } else if (row.status === "failed" || row.status === "cancelled") {
            onFailed(row.error_message ?? undefined);
          }
        },
      )
      .subscribe();

    // Rede de segurança: se o websocket não conectar, o polling encerra o overlay.
    void (async () => {
      const outcome = await pollGenerationStatus(genId, {
        timeoutMs: 10 * 60 * 1000,
        isCancelled: () => settled,
      });
      if (!outcome || settled) return;
      if (outcome.ok) {
        void onSucceeded();
        return;
      }
      if (outcome.status === "timeout") {
        settled = true;
        toast.message("Ainda processando", {
          description:
            "A geração continua rodando em segundo plano — avisamos quando ficar pronta.",
        });
        setProgressGenId(null);
        navigate({ to: "/app/biblioteca", search: { destacar: genId } } as never);
        return;
      }
      onFailed(outcome.error);
    })();

    return () => {
      settled = true;
      void supabase.removeChannel(channel);
    };
  }, [progressGenId, navigate, refreshProfile]);

  return (
    <div className="mx-auto max-w-6xl">
      <Header />

      {reusedFrom && (
        <div className="mt-6 flex items-start gap-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-3">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">
              Regenerando a partir de uma geração anterior
            </p>
            <p className="mt-0.5 text-[12px] font-light text-muted-foreground">
              Pipeline {reusedFrom.pipelineLabel} ·{" "}
              {hasReusedSource ? "imagem de origem reaproveitada" : "sem imagem de origem"}. Ajuste
              o prompt e gere novamente — você pode trocar a imagem se quiser.
            </p>
          </div>
          <button
            type="button"
            onClick={clearReused}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Descartar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <PipelineGrid value={pipelineId} onChange={setPipelineId} />

      {/* Entrada à esquerda, o que vai acontecer à direita. Antes o botão
          ficava no fim de uma coluna só, depois de rolar tudo. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <div>
          {(pipelineId === "direct" || pipelineId === "enriched") && (
            <BasicForm
              file={primary}
              onFile={setPrimary}
              instruction={instruction}
              onInstruction={setInstruction}
            />
          )}
          {pipelineId === "edit" && (
            <EditForm
              file={primary}
              onFile={setPrimary}
              prompt={editPrompt}
              onPrompt={setEditPrompt}
            />
          )}
          {isTextPipeline && <TextTo3DForm prompt={textPrompt} onPrompt={setTextPrompt} />}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          {!isTextPipeline && (
            <div>
              <Label>Motor</Label>
              <div className="mt-3">
                <EngineCard
                  selected={engine === "hunyuan_2_1"}
                  onClick={() => setEngine("hunyuan_2_1")}
                  title="Hunyuan 2.1"
                  tag="Padrão"
                  desc="Multi-view com controle por ângulo. Recomendado para todas as pipelines com imagem."
                />
              </div>
            </div>
          )}

          <div
            className="rounded-[20px] bg-card p-6"
            style={{ boxShadow: "var(--via-shadow-card)" }}
          >
            <SummaryRow label="Tempo estimado" value={`~${pipeline.estSeconds} s`} />
            <div className="my-3.5 h-px bg-border/60" />
            <SummaryRow
              label="Custo estimado"
              value={formatCost(ENGINE_COST_USD[effectiveEngine])}
            />

            {isTextPipeline && (
              <button
                type="button"
                onClick={() => setRefineOpen(true)}
                disabled={textPrompt.trim().length < 3 || submitting}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border/60 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                Refinar com IA
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate || submitting}
              className="mt-3 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary text-[12px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Gerar 3D
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[11px] font-light leading-relaxed text-muted-foreground">
              Você pode fechar esta aba — avisamos quando ficar pronto.
            </p>
          </div>
        </div>
      </div>

      {isTextPipeline && (
        <RefinePromptDialog
          open={refineOpen}
          onOpenChange={setRefineOpen}
          initialPrompt={textPrompt}
          onConfirm={(finalPrompt) => {
            setTextPrompt(finalPrompt);
            void handleGenerate(finalPrompt);
          }}
        />
      )}

      {progressGenId && (
        <ProgressOverlay
          pipeline={pipeline}
          onBackground={() => {
            setProgressGenId(null);
            navigate({ to: "/app" });
          }}
        />
      )}
    </div>
  );
}

/* ============== HEADER ============== */

function Header() {
  return (
    <div>
      <h1 className="text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
        Gerar objeto 3D
      </h1>
      <p className="mt-2 max-w-xl font-light text-muted-foreground">
        Suba uma referência ou descreva o objeto. O resto é com a gente.
      </p>
    </div>
  );
}

/* ============== PIPELINE GRID ============== */

function PipelineGrid({
  value,
  onChange,
}: {
  value: PipelineId;
  onChange: (v: PipelineId) => void;
}) {
  return (
    <div className="mt-8">
      <Label>Como gerar</Label>
      <div className="mt-3 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {PIPELINES.map((p) => (
          <PipelineCard
            key={p.id}
            pipeline={p}
            selected={value === p.id}
            onClick={() => onChange(p.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PipelineCard({
  pipeline,
  selected,
  onClick,
}: {
  pipeline: Pipeline;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex h-full flex-col rounded-xl border-[1.5px] bg-card p-5 text-left transition-colors " +
        (selected
          ? "border-accent-foreground ring-[3px] ring-accent-foreground/15"
          : "border-border/60 hover:border-accent-foreground/40")
      }
    >
      {pipeline.recommended && (
        <span className="absolute right-3.5 top-3.5 rounded-[4px] bg-emerald-600/10 px-[7px] py-[3px] text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
          Recomendado
        </span>
      )}
      <p className="text-[15px] font-black tracking-tight text-foreground">{pipeline.title}</p>
      <p className="mt-2 text-xs font-light leading-relaxed text-muted-foreground">
        {pipeline.desc}
      </p>
      <span
        className={
          "mt-auto pt-3.5 text-[10px] font-black uppercase tracking-[0.12em] " +
          (selected ? "text-accent-foreground" : "text-muted-foreground")
        }
      >
        ~{pipeline.estSeconds}s
      </span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] font-light text-muted-foreground">{label}</span>
      <span className="text-[13px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

/** Sem número publicado o traço é honesto; um "$ 0,00" não seria. */
function formatCost(usd: number | null): string {
  if (usd === null) return "—";
  return `$ ${usd.toFixed(2).replace(".", ",")}`;
}

/* ============== FORMS ============== */

function EngineCard({
  selected,
  onClick,
  title,
  tag,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  tag: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ boxShadow: "var(--via-shadow-card)" }}
      className={
        "relative flex w-full flex-col rounded-[20px] bg-card p-5 text-left transition-shadow " +
        (selected ? "ring-2 ring-accent-foreground/30" : "hover:shadow-md")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-black tracking-tight text-foreground">{title}</span>
        <span className="rounded-[4px] bg-muted px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          {tag}
        </span>
      </div>
      <p className="mt-2.5 text-xs font-light leading-relaxed text-muted-foreground">{desc}</p>
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </label>
  );
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function Dropzone({
  file,
  onFile,
  accept = "image/png,image/jpeg",
  hint = "Arraste uma imagem aqui ou clique para selecionar. PNG ou JPG, máximo 10MB.",
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  accept?: string;
  hint?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Revoga o object URL ao trocar/remover o arquivo — criá-lo no corpo do
  // render vazava um blob por render enquanto a aba estivesse aberta.
  useEffect(() => {
    if (!file || file.type === "application/pdf") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // O atributo `accept` filtra o seletor nativo, mas não o arquivo solto:
  // validação precisa rodar nos dois caminhos.
  const acceptFile = (f: File) => {
    const allowed = accept
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const matches = allowed.some((a) => {
      if (a.endsWith("/*")) return f.type.startsWith(a.slice(0, -1));
      if (a.startsWith(".")) return f.name.toLowerCase().endsWith(a.toLowerCase());
      return f.type === a;
    });
    if (!matches) {
      toast.error("Formato não suportado", {
        description: `Envie ${allowed.join(" ou ")}.`,
      });
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("Arquivo maior que 10MB");
      return;
    }
    onFile(f);
  };

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    acceptFile(f);
    // Permite reenviar o mesmo arquivo depois de removê-lo.
    e.target.value = "";
  };

  if (file) {
    const isPdf = file.type === "application/pdf";
    return (
      <div
        className="flex items-center gap-[18px] rounded-[20px] bg-card p-[18px]"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        <div className="flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {isPdf ? (
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
              PDF
            </span>
          ) : (
            previewUrl && (
              <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
            )
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{file.name}</p>
          <p className="mt-1 text-[11.5px] font-light text-muted-foreground">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
          <div className="mt-3.5 flex items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border/60 px-3.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted">
              Trocar
              <input type="file" accept={accept} onChange={handle} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => onFile(null)}
              className="inline-flex h-8 items-center rounded-full px-3.5 text-[11px] font-light text-muted-foreground transition-colors hover:text-foreground"
            >
              Remover
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <label
      onDragOver={(e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) acceptFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed px-6 py-12 text-center transition-colors ${
        dragging
          ? "border-accent-foreground bg-accent/40"
          : "border-border/60 bg-card hover:bg-muted/40"
      }`}
    >
      <ImageUp className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      <span className="max-w-sm text-sm font-light text-muted-foreground">{hint}</span>
      <input type="file" accept={accept} onChange={handle} className="hidden" />
    </label>
  );
}

function BasicForm({
  file,
  onFile,
  instruction,
  onInstruction,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  instruction: string;
  onInstruction: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <FieldLabel>Imagem de referência</FieldLabel>
        <div className="mt-2">
          <Dropzone file={file} onFile={onFile} />
        </div>
      </div>
      <div>
        <FieldLabel>Instrução adicional (opcional)</FieldLabel>
        <textarea
          rows={3}
          value={instruction}
          onChange={(e) => onInstruction(e.target.value)}
          placeholder="Ex: luminária pendente dourada estilo art déco"
          className="mt-2 block w-full resize-none rounded-xl border border-border/60 bg-card px-4 py-3.5 text-sm font-light text-foreground focus:border-accent-foreground/40 focus:outline-none"
        />
      </div>
    </div>
  );
}

function TextTo3DForm({ prompt, onPrompt }: { prompt: string; onPrompt: (v: string) => void }) {
  const MIN = 10;
  const MAX = 1024;
  const trimmedLen = prompt.trim().length;
  const tooShort = trimmedLen > 0 && trimmedLen < MIN;
  const tooLong = prompt.length > MAX;
  const remaining = MAX - prompt.length;
  const counterTone = tooLong
    ? "text-destructive"
    : remaining <= 80
      ? "text-accent"
      : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <div>
        <FieldLabel>Descrição do objeto</FieldLabel>
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => onPrompt(e.target.value.slice(0, MAX))}
          placeholder="Ex: Poltrona elegante esculpida no formato de um abacate, casca verde aveludada, almofada interna dourada polida, detalhes ornamentais em latão, render fotorrealista, iluminação dramática de estúdio, fundo neutro"
          aria-invalid={tooShort || tooLong}
          className={`mt-2 block w-full resize-y rounded-xl border bg-card px-4 py-3.5 text-sm font-light text-foreground focus:outline-none ${
            tooShort || tooLong
              ? "border-destructive focus:border-destructive"
              : "border-border/60 focus:border-accent-foreground/40"
          }`}
        />
        <div className="mt-2 flex items-start justify-between gap-4">
          <p className="text-[11px] font-light text-muted-foreground">
            {tooShort
              ? `Descreva com pelo menos ${MIN} caracteres — faltam ${MIN - trimmedLen}.`
              : trimmedLen === 0
                ? "Descreva forma, material, cor, estilo e iluminação. Quanto mais detalhe, melhor o resultado."
                : "Quanto mais detalhe sobre forma, material, cor e iluminação, melhor o resultado."}
          </p>
          <span className={`shrink-0 text-[11px] font-light tabular-nums ${counterTone}`}>
            {prompt.length}/{MAX}
          </span>
        </div>
      </div>
      <div>
        <FieldLabel>Sugestões para começar</FieldLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEXT_PROMPT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPrompt(s.slice(0, MAX))}
              className="rounded-[4px] border border-border bg-card px-3 py-2 text-left text-xs font-light text-foreground transition-colors hover:border-accent hover:bg-accent/5"
            >
              {s.length > 70 ? `${s.slice(0, 70)}…` : s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditForm({
  file,
  onFile,
  prompt,
  onPrompt,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  prompt: string;
  onPrompt: (v: string) => void;
}) {
  const addChip = (s: string) => {
    onPrompt(prompt ? `${prompt}, ${s.toLowerCase()}` : s);
  };
  return (
    <div className="space-y-6">
      <div>
        <FieldLabel>Imagem de referência</FieldLabel>
        <div className="mt-2">
          <Dropzone file={file} onFile={onFile} />
        </div>
      </div>
      <div>
        <FieldLabel>Como modificar antes de virar 3D</FieldLabel>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
          placeholder="Descreva as alterações desejadas"
          className="mt-2 block w-full resize-none rounded-xl border border-border/60 bg-card px-4 py-3.5 text-sm font-light text-foreground focus:border-accent-foreground/40 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EDIT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addChip(s)}
              className="rounded-[4px] bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-accent transition-colors hover:bg-accent/15"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============== PROGRESS OVERLAY ============== */

const PROGRESS_STEPS = [
  { label: "Analisando imagem...", sub: "Validando referência e preparando o pipeline.", ms: 1500 },
  { label: "Limpando fundo com IA...", sub: "Isolando o objeto da cena.", ms: 8000 },
  { label: "Gerando vistas multi-view...", sub: "Criando ângulos para reconstrução.", ms: 18000 },
  { label: "Criando malha 3D...", sub: "Reconstruindo geometria a partir das vistas.", ms: 38000 },
  { label: "Aplicando texturas...", sub: "Pintando cores e materiais.", ms: 18000 },
  {
    label: "Compondo render contextual...",
    sub: "Posicionando o objeto na cena com lighting.",
    ms: 15000,
  },
];

function ProgressOverlay({
  pipeline,
  onBackground,
}: {
  pipeline: Pipeline;
  onBackground: () => void;
}) {
  const steps = useMemo(() => {
    if (pipeline.id === "direct") return [PROGRESS_STEPS[0], PROGRESS_STEPS[3], PROGRESS_STEPS[4]];

    return [
      PROGRESS_STEPS[0],
      PROGRESS_STEPS[1],
      PROGRESS_STEPS[2],
      PROGRESS_STEPS[3],
      PROGRESS_STEPS[4],
    ];
  }, [pipeline.id]);

  const totalMs = useMemo(() => steps.reduce((acc, s) => acc + s.ms, 0), [steps]);
  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 250);
    return () => clearInterval(t);
  }, [steps]);

  // Step atual baseado em tempo acumulado
  let acc = 0;
  let idx = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i].ms;
    if (elapsed < acc) {
      idx = i;
      break;
    }
  }
  const overtime = elapsed >= totalMs;
  const pct = Math.min(elapsed / totalMs, 0.97);
  const remainingS = Math.max(0, Math.round((totalMs - elapsed) / 1000));
  const current = steps[idx];

  const formatEta = (s: number) => {
    if (s >= 60) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      return r ? `~${m}min ${r}s restantes` : `~${m}min restantes`;
    }
    return `~${s}s restantes`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, color-mix(in oklab, hsl(var(--accent)) 18%, transparent), transparent 60%)",
        }}
      />
      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" strokeWidth={1.5} />
        <h2 className="mt-8 text-2xl font-black tracking-tight text-foreground">
          {overtime ? "Finalizando..." : current.label}
        </h2>
        <p className="mt-2 text-sm font-light text-muted-foreground">
          {overtime
            ? "Quase lá. Algumas gerações passam do tempo estimado quando há fila."
            : current.sub}
        </p>

        <div className="mt-8 h-1.5 w-72 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Passo {Math.min(idx + 1, steps.length)} de {steps.length}
          {!overtime && remainingS > 0 ? ` · ${formatEta(remainingS)}` : ""}
        </p>

        <button
          type="button"
          onClick={onBackground}
          className="mt-8 inline-flex h-9 items-center rounded-full border border-border bg-background px-4 text-[10px] font-black uppercase tracking-[0.12em] text-foreground hover:bg-muted"
        >
          Continuar em segundo plano
        </button>
      </div>
    </div>
  );
}
