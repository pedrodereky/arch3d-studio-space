import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Sparkles, Info, RefreshCw, ImagePlus } from "lucide-react";
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
  // O trilho de controles encosta na barra lateral, sem respiro entre os dois.
  staticData: { fullBleed: true },
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
    // Uma segunda rodada não pode mostrar as propostas da rodada anterior
    // enquanto a nova roda — agora que os controles ficam na tela, gerar de
    // novo é um clique, e a lista antiga parecia resultado da rodada atual.
    setVariations([]);
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

  const busy = submitting || phase === "loading";

  return (
    <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
      {/* Trilho de controles — permanente. Antes ele era substituído pelo
          resultado, e trocar o estilo exigia voltar uma fase e perder as
          propostas na tela. */}
      <aside className="shrink-0 border-b border-border/60 bg-card lg:sticky lg:top-0 lg:flex lg:max-h-[calc(100vh-76px)] lg:w-[300px] lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-6 overflow-y-auto p-6 lg:flex-1">
          <div>
            <RailLabel>Ambiente</RailLabel>
            <div className="mt-3">
              {previewUrl ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-border/60">
                    <img
                      src={previewUrl}
                      alt="Ambiente original"
                      className="block aspect-[4/3] w-full object-cover"
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[11.5px] font-light text-muted-foreground">
                      {file?.name}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFile(null);
                        setPhase("input");
                        setVariations([]);
                        setGenerationId(null);
                      }}
                      className="shrink-0 text-[11.5px] font-medium text-accent-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      Trocar
                    </button>
                  </div>
                </>
              ) : (
                <PhotoDropzone file={file} previewUrl={previewUrl} onFile={setFile} />
              )}
            </div>
          </div>

          <div>
            <RailLabel>Estilo</RailLabel>
            <StylePicker
              compact
              mode={mode}
              onMode={setMode}
              presetId={presetId}
              onPreset={setPresetId}
              customPrompt={customPrompt}
              onCustomPrompt={setCustomPrompt}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <RailLabel>Preservar layout</RailLabel>
              <Switch
                checked={keepLayout}
                onChange={setKeepLayout}
                label="Preservar layout do ambiente"
              />
            </div>
            <p className="mt-2.5 text-[11.5px] font-light leading-relaxed text-muted-foreground">
              {keepLayout
                ? "Mantém paredes e aberturas; troca acabamentos e mobiliário."
                : "Deixa a IA reinterpretar o ambiente com mais liberdade."}
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Ajustes finos
              <span aria-hidden="true">{advancedOpen ? "−" : "+"}</span>
            </button>
            {advancedOpen && (
              <div className="mt-4 space-y-5">
                <div>
                  <p className="text-[11.5px] font-light text-muted-foreground">Variações</p>
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
                    <p className="text-[11.5px] font-light text-muted-foreground">
                      Vincular a projeto
                    </p>
                    <select
                      value={projectId ?? ""}
                      onChange={(e) => setProjectId(e.target.value || undefined)}
                      className="mt-2 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent-foreground/40"
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
        </div>

        <div className="border-t border-border/60 p-6 lg:shrink-0">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[11.5px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : phase === "results" ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Gerar de novo
              </>
            ) : (
              <>
                Redecorar ambiente <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          <p className="mt-3 text-center text-[11px] font-light text-muted-foreground">
            ≈ 20s · {nVariations} {nVariations === 1 ? "variação" : "variações"} · cobrança no plano
            do workspace
          </p>
        </div>
      </aside>

      {/* Área de resultado */}
      <div className="min-w-0 flex-1 p-4 md:p-10">
        {phase === "loading" ? (
          <LoadingStepper />
        ) : phase === "results" ? (
          <>
            <header>
              <h1 className="text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
                {variations.length} {variations.length === 1 ? "proposta" : "propostas"}
              </h1>
              <p className="mt-2 font-light text-muted-foreground">
                Abra o antes/depois, salve no projeto ou mande para o Studio. Mudou de ideia? Ajuste
                o estilo à esquerda e gere de novo.
              </p>
            </header>
            <div className="mt-8">
              <VariationsGrid
                sourceUrl={previewUrl ?? ""}
                variations={variations}
                segImageUrl={segImageUrl}
                generationId={generationId ?? ""}
                onAddToProject={handleAddToProject}
                onSendToStudio={handleSendToStudio}
                onIterate={() => void handleIterate()}
                iterating={iterating}
              />
            </div>
          </>
        ) : (
          <>
            <header>
              <h1 className="text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
                Redecorar ambiente
              </h1>
              <p className="mt-2 max-w-xl font-light text-muted-foreground">
                Foto real do ambiente → propostas fotorrealistas em ~20 segundos. Mantém paredes,
                janelas e vãos; troca acabamentos, móveis e iluminação.
              </p>
            </header>
            <div className="mt-8 max-w-2xl">{file ? <ReadyToGenerate /> : <HowItWorks />}</div>
          </>
        )}
      </div>
    </div>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-[22px] w-[38px] shrink-0 items-center rounded-full px-[3px] transition-colors ${
        checked ? "justify-end bg-accent-foreground" : "justify-start bg-border"
      }`}
    >
      <span className="block h-4 w-4 rounded-full bg-card" />
    </button>
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
      className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors ${
        active
          ? "border-accent-foreground/25 bg-accent text-accent-foreground"
          : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ReadyToGenerate() {
  return (
    <div
      className="flex items-start gap-4 rounded-[20px] bg-card p-6"
      style={{ boxShadow: "var(--via-shadow-card)" }}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <ImagePlus className="h-[22px] w-[22px]" strokeWidth={1.75} />
      </div>
      <div>
        <p className="font-bold text-foreground">Tudo pronto</p>
        <p className="mt-1 text-sm font-light leading-relaxed text-muted-foreground">
          Confira o estilo no painel à esquerda e clique em <strong>Redecorar ambiente</strong>. As
          propostas aparecem aqui — você pode fechar a aba, avisamos quando ficarem prontas.
        </p>
      </div>
    </div>
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
      title: "Recebe as variações",
      desc: "Em ~20s. Salve, mande pro Studio, ou compartilhe com o cliente.",
    },
  ];
  return (
    <div className="rounded-[20px] bg-card p-6" style={{ boxShadow: "var(--via-shadow-card)" }}>
      <div className="mb-5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-foreground" strokeWidth={1.75} />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Como funciona
        </p>
      </div>
      <div className="space-y-5">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-black text-accent-foreground">
              {s.n}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{s.title}</p>
              <p className="mt-0.5 text-[12px] font-light text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-2 rounded-lg border border-border/60 bg-muted/50 p-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] font-light leading-relaxed text-muted-foreground">
          Mantém geometria do ambiente (paredes, vãos, janelas). Troca acabamentos, móveis e
          iluminação. Não move parede.
        </p>
      </div>
    </div>
  );
}
