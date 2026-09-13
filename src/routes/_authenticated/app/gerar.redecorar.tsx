import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pollGenerationStatus } from "@/lib/poll-generation";
import { useAuth } from "@/lib/auth-context";
import { PhotoDropzone } from "@/components/redecorar/PhotoDropzone";
import { StylePicker } from "@/components/redecorar/StylePicker";
import { LoadingStepper } from "@/components/redecorar/LoadingStepper";
import { VariationsGrid, type RedecorateVariation } from "@/components/redecorar/VariationsGrid";
import { PRESET_BY_ID, type RedecoratePresetId } from "@/lib/redecorate-presets";

type Search = { projectId?: string };

export const Route = createFileRoute("/_authenticated/app/gerar/redecorar")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    projectId: typeof s.projectId === "string" ? s.projectId : undefined,
  }),
  component: RedecorarPage,
});

type Phase = "input" | "loading" | "results";

type Project = { id: string; name: string };

function RedecorarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { projectId: initialProjectId } = Route.useSearch();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetId, setPresetId] = useState<RedecoratePresetId | null>("scandinavian");
  const [customPrompt, setCustomPrompt] = useState("");
  const [keepLayout, setKeepLayout] = useState(true);
  const [nVariations, setNVariations] = useState<1 | 2 | 4>(4);
  const [projectId, setProjectId] = useState<string | undefined>(initialProjectId);
  const [projects, setProjects] = useState<Project[]>([]);

  const [phase, setPhase] = useState<Phase>("input");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [variations, setVariations] = useState<RedecorateVariation[]>([]);
  const [segImageUrl, setSegImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // preview local da foto
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // projetos do usuário
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("projects")
      .select("id,name")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setProjects((data ?? []) as Project[]));
  }, [user]);

  const canGenerate = useMemo(() => {
    if (!file || submitting) return false;
    if (mode === "preset") return !!presetId;
    return customPrompt.trim().length >= 4;
  }, [file, mode, presetId, customPrompt, submitting]);

  // Edge function retorna 202 imediato; o processamento dura ~2-3 min.
  const pollGeneration = async (genId: string) => {
    const outcome = await pollGenerationStatus(genId);
    if (!outcome) return { ok: false as const, error: "cancelado" };
    if (!outcome.ok) return { ok: false as const, error: outcome.error };
    const vars = (outcome.metadata.variations as RedecorateVariation[] | undefined) ?? [];
    return { ok: true as const, variations: vars };
  };

  const handleGenerate = async () => {
    if (!user || !file || !canGenerate) return;
    setSubmitting(true);
    setPhase("loading");
    try {
      // 1. sobe a foto no bucket inputs com path temporário
      const tempId = crypto.randomUUID();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const sourcePath = `${user.id}/redecorate/${tempId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("inputs")
        .upload(sourcePath, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      // 2. dispara edge function (resposta imediata, processamento em bg)
      const { data, error } = await supabase.functions.invoke("redecorate-image", {
        body: {
          sourceImagePath: sourcePath,
          stylePreset: mode === "preset" ? presetId : undefined,
          stylePrompt:
            mode === "custom"
              ? customPrompt.trim()
              : presetId
                ? PRESET_BY_ID[presetId].description
                : undefined,
          keepLayout,
          variations: nVariations,
          projectId,
        },
      });

      if (error) {
        const msg = (error as { message?: string }).message ?? "Falha na redecoração";
        throw new Error(msg);
      }
      const ack = data as { ok?: boolean; error?: string; generationId?: string };
      if (!ack?.ok || !ack.generationId) {
        throw new Error(ack?.error ?? "Resposta inválida");
      }
      setGenerationId(ack.generationId);

      // 3. polling até terminar
      const result = await pollGeneration(ack.generationId);
      if (!result.ok) throw new Error(result.error);

      setVariations(result.variations);
      setSegImageUrl(null);
      setPhase("results");
      toast.success("Redecoração pronta", {
        description: `${result.variations.length} variações geradas.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha desconhecida";
      toast.error("Erro ao redecorar", { description: msg });
      setPhase("input");
    } finally {
      setSubmitting(false);
    }
  };

  const handleIterate = async () => {
    if (!generationId || iterating) return;
    setIterating(true);
    try {
      const { data, error } = await supabase.functions.invoke("redecorate-iterate", {
        body: { generationId, addVariations: 4 },
      });
      if (error) throw new Error((error as { message?: string }).message ?? "Falha");
      const ack = data as { ok?: boolean; error?: string; generationId?: string };
      if (!ack?.ok || !ack.generationId) {
        throw new Error(ack?.error ?? "Resposta inválida");
      }
      setGenerationId(ack.generationId);

      const result = await pollGeneration(ack.generationId);
      if (!result.ok) throw new Error(result.error);

      setVariations((prev) => [...prev, ...result.variations]);
      toast.success("Mais variações adicionadas");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha";
      toast.error("Não foi possível iterar", { description: msg });
    } finally {
      setIterating(false);
    }
  };

  const handleChangeStyle = () => {
    setPhase("input");
    setVariations([]);
    setGenerationId(null);
    if (mode === "preset") setPresetId(null);
  };

  const handleAddToProject = async (_v: RedecorateVariation) => {
    if (!generationId) return;
    if (!projectId) {
      navigate({
        to: "/app/biblioteca",
        search: { destacar: generationId } as never,
      });
      return;
    }
    const { error } = await supabase
      .from("project_assets")
      .insert({ project_id: projectId, generation_id: generationId } as never);
    if (error) {
      toast.error("Falha ao vincular", { description: error.message });
      return;
    }
    toast.success("Adicionado ao projeto");
    navigate({
      to: "/app/projetos/$projectId",
      params: { projectId },
    });
  };

  const handleSendToStudio = (_v: RedecorateVariation) => {
    if (!generationId) return;
    navigate({
      to: "/app/studio",
      search: { fromGeneration: generationId } as never,
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Gerar
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground">
          Redecorar ambiente
        </h1>
        <p className="mt-3 max-w-xl font-light text-muted-foreground">
          Foto real do ambiente → 4 propostas fotorrealistas em 20 segundos. Mantém paredes, janelas
          e vãos; troca acabamentos, móveis e iluminação.
        </p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Coluna esquerda: foto */}
        <div>
          {phase === "input" || phase === "loading" ? (
            <PhotoDropzone file={file} previewUrl={previewUrl} onFile={setFile} />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <p className="border-b border-border bg-muted/50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                Foto original
              </p>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Foto original"
                  className="block max-h-[70vh] w-full object-contain"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPhase("input");
                  setVariations([]);
                  setGenerationId(null);
                }}
                className="block w-full border-t border-border bg-background px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Trocar foto e recomeçar
              </button>
            </div>
          )}
        </div>

        {/* Coluna direita */}
        <div>
          {phase === "input" && !file && <HowItWorks />}

          {phase === "input" && file && (
            <div className="space-y-6">
              <StylePicker
                mode={mode}
                onMode={setMode}
                presetId={presetId}
                onPreset={setPresetId}
                customPrompt={customPrompt}
                onCustomPrompt={setCustomPrompt}
              />

              <div className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-foreground"
                >
                  Ajustes finos
                  <span className="text-muted-foreground">{advancedOpen ? "−" : "+"}</span>
                </button>
                {advancedOpen && (
                  <div className="space-y-5 border-t border-border px-4 py-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Fidelidade ao layout
                      </label>
                      <div className="mt-2 flex gap-2">
                        <ToggleBtn active={!keepLayout} onClick={() => setKeepLayout(false)}>
                          Mais criativo
                        </ToggleBtn>
                        <ToggleBtn active={keepLayout} onClick={() => setKeepLayout(true)}>
                          Mais fiel
                        </ToggleBtn>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Variações
                      </label>
                      <div className="mt-2 flex gap-2">
                        {([1, 2, 4] as const).map((n) => (
                          <ToggleBtn
                            key={n}
                            active={nVariations === n}
                            onClick={() => setNVariations(n)}
                          >
                            {n}
                          </ToggleBtn>
                        ))}
                      </div>
                    </div>

                    {projects.length > 0 && (
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          Vincular a projeto (opcional)
                        </label>
                        <select
                          value={projectId ?? ""}
                          onChange={(e) => setProjectId(e.target.value || undefined)}
                          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                        >
                          <option value="">Sem projeto</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-5">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={!canGenerate}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-[12px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Redecorar ambiente <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <p className="mt-2 text-center text-[11px] font-light text-muted-foreground">
                  ≈ 20s · {nVariations} {nVariations === 1 ? "variação" : "variações"} · cobrança no
                  plano do workspace
                </p>
              </div>
            </div>
          )}

          {phase === "loading" && <LoadingStepper />}

          {phase === "results" && previewUrl && (
            <VariationsGrid
              sourceUrl={previewUrl}
              variations={variations}
              segImageUrl={segImageUrl}
              generationId={generationId ?? ""}
              onAddToProject={handleAddToProject}
              onSendToStudio={handleSendToStudio}
              onIterate={() => void handleIterate()}
              onChangeStyle={handleChangeStyle}
              iterating={iterating}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-bold transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Sobe a foto",
      desc: "Frontal, com boa luz. Móveis e parede visíveis funcionam melhor.",
    },
    {
      n: 2,
      title: "Escolhe o estilo",
      desc: "Use um preset ou descreva em texto livre o clima desejado.",
    },
    {
      n: 3,
      title: "Recebe 4 variações",
      desc: "Em ~20s. Salve, mande pro Studio, ou compartilhe com o cliente.",
    },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.75} />
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          Como funciona
        </p>
      </div>
      <div className="space-y-5">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[12px] font-black text-accent">
              {s.n}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{s.title}</p>
              <p className="mt-0.5 text-[12px] font-light text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-2 rounded-md border border-border bg-muted/50 p-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] font-light leading-relaxed text-muted-foreground">
          Mantém geometria do ambiente (paredes, vãos, janelas). Troca acabamentos, móveis e
          iluminação. Não move parede.
        </p>
      </div>
    </div>
  );
}
