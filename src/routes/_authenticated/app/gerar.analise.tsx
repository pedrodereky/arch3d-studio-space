import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Upload, X, Loader2, ArrowRight, ArrowLeft, FileText, Check, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { pdfFirstPageToJpeg } from "@/lib/pdf-to-image";
import { VisionAnalysisSheet } from "@/features/briefing/VisionAnalysisSheet";
import type { FloorplanAnalysis } from "@/features/briefing/types";
import { PlantasTabs } from "@/components/gerar/PlantasTabs";

export const Route = createFileRoute("/_authenticated/app/gerar/analise")({
  component: AnalisePage,
});

const MAX_BYTES = 20 * 1024 * 1024;

type BriefingOption = {
  id: string;
  label: string;
  briefing: {
    areaM2?: number;
    quartos?: number;
    suites?: number;
    banhos?: number;
    vagas?: number;
  } | null;
};

function AnalisePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const [briefingOptions, setBriefingOptions] = useState<BriefingOption[]>([]);
  const [briefingId, setBriefingId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<FloorplanAnalysis | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"analysis" | "compare">("analysis");

  const inputRef = useRef<HTMLInputElement>(null);

  // preview
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // briefings recentes pra opção de comparação
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("generations")
        .select("id,created_at,metadata")
        .eq("user_id", user.id)
        .eq("pipeline_type", "floorplan_2d")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(10);
      const opts: BriefingOption[] = (data ?? []).map((g) => {
        const meta = (g.metadata ?? {}) as Record<string, unknown>;
        const b = (meta.briefing ?? null) as BriefingOption["briefing"];
        const label = b
          ? `${b.areaM2 ?? "?"} m² · ${b.quartos ?? 0}q · ${b.suites ?? 0}s · ${b.banhos ?? 0}b`
          : new Date(g.created_at as string).toLocaleString("pt-BR");
        return { id: g.id as string, label, briefing: b };
      });
      setBriefingOptions(opts);
    })();
  }, [user]);

  const selectedBriefing = useMemo(
    () => briefingOptions.find((b) => b.id === briefingId) ?? null,
    [briefingOptions, briefingId],
  );

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error("Arquivo muito grande", { description: "Máximo 20MB." });
      return;
    }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const isImg = f.type.startsWith("image/");
    if (!isPdf && !isImg) {
      toast.error("Formato não suportado", { description: "Envie PDF ou imagem." });
      return;
    }
    if (isPdf) {
      setConverting(true);
      try {
        const jpg = await pdfFirstPageToJpeg(f);
        setFile(jpg);
      } catch (err) {
        toast.error("Falha ao ler PDF", {
          description: err instanceof Error ? err.message : "desconhecido",
        });
      } finally {
        setConverting(false);
      }
    } else {
      setFile(f);
    }
  };

  const clearFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAnalyze = async () => {
    if (!user || !file || submitting) return;
    setSubmitting(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/floorplan-analysis/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("inputs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("inputs")
        .createSignedUrl(path, 60 * 60 * 6);
      const url = signed?.signedUrl;
      if (!url) throw new Error("URL assinada indisponível");

      setImageUrl(url);
      setStep(2);
      setAnalysis(null);

      const { data, error } = await supabase.functions.invoke("analyze-existing-floorplan", {
        body: {
          imageUrl: url,
          storagePath: path,
          briefingGenerationId: briefingId || null,
        },
      });
      if (error) throw new Error((error as { message?: string }).message ?? "Falha");
      const body = data as {
        ok?: boolean;
        error?: string;
        generationId?: string;
        analysis?: FloorplanAnalysis;
      };
      if (!body?.ok || !body.analysis) {
        throw new Error(body?.error ?? "Resposta inválida");
      }
      setAnalysis(body.analysis);
      setGenerationId(body.generationId ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha";
      toast.error("Erro ao analisar", { description: msg });
      setStep(1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-planta-${generationId ?? "sem-id"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendStudio = () => {
    if (!generationId) return;
    navigate({
      to: "/app/studio",
      search: { fromGeneration: generationId },
    } as never);
  };

  const restart = () => {
    setStep(1);
    setFile(null);
    setPreview(null);
    setAnalysis(null);
    setGenerationId(null);
    setImageUrl(null);
    setTab("analysis");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <PlantasTabs className="mb-6" />
        <h1 className="text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
          Análise de planta existente
        </h1>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Suba uma planta baixa (imagem ou PDF) e a IA devolve cômodos, áreas e validação NBR 9050.
        </p>
      </header>

      <Stepper step={step} />

      {step === 1 ? (
        <Step1
          file={file}
          preview={preview}
          converting={converting}
          onPick={onPick}
          onClear={clearFile}
          inputRef={inputRef}
          briefingOptions={briefingOptions}
          briefingId={briefingId}
          setBriefingId={setBriefingId}
          submitting={submitting}
          onNext={handleAnalyze}
        />
      ) : (
        <Step2
          imageUrl={imageUrl}
          analysis={analysis}
          analyzing={submitting && !analysis}
          onBack={restart}
          onExport={handleExport}
          onSendStudio={handleSendStudio}
          briefing={selectedBriefing?.briefing ?? null}
          tab={tab}
          setTab={setTab}
        />
      )}
    </div>
  );
}

/* ============== STEPPER ============== */

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-10 flex items-center gap-4">
      <StepDot index={1} label="Enviar planta" active={step === 1} done={step > 1} />
      <div className={`h-px flex-1 ${step > 1 ? "bg-accent" : "bg-border"}`} />
      <StepDot index={2} label="Resultado" active={step === 2} done={false} />
    </div>
  );
}

function StepDot({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-black ${
          done
            ? "border-accent bg-accent text-accent-foreground"
            : active
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-background text-muted-foreground"
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : index}
      </div>
      <span
        className={`text-[11px] font-black uppercase tracking-[0.14em] ${
          active || done ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ============== STEP 1 ============== */

function Step1({
  file,
  preview,
  converting,
  onPick,
  onClear,
  inputRef,
  briefingOptions,
  briefingId,
  setBriefingId,
  submitting,
  onNext,
}: {
  file: File | null;
  preview: string | null;
  converting: boolean;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  briefingOptions: BriefingOption[];
  briefingId: string;
  setBriefingId: (v: string) => void;
  submitting: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-card p-6">
        <label className="mb-3 block text-sm font-bold text-foreground">
          Planta baixa (imagem ou PDF)
        </label>
        {!file ? (
          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-background p-12 transition hover:border-accent ${
              converting ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {converting ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="mt-3 text-sm text-muted-foreground">Convertendo PDF…</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                <span className="mt-3 text-sm font-bold text-foreground">
                  Clique ou arraste o arquivo
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  PDF (1ª página), PNG, JPG · até 20MB
                </span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onPick}
            />
          </label>
        ) : (
          <div className="relative overflow-hidden rounded-md border border-border bg-background">
            {preview && (
              <img
                src={preview}
                alt="Pré-visualização da planta"
                className="max-h-96 w-full object-contain"
              />
            )}
            <button
              type="button"
              onClick={onClear}
              className="absolute right-2 top-2 rounded-full bg-foreground/80 p-1.5 text-background hover:bg-foreground"
              aria-label="Remover arquivo"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <label className="mb-2 block text-sm font-bold text-foreground">
          Vincular a um briefing{" "}
          <span className="font-light text-muted-foreground">(opcional)</span>
        </label>
        <p className="mb-3 text-xs font-light text-muted-foreground">
          Selecione um briefing anterior para comparar os dados pedidos com o que a IA detectou.
        </p>
        <select
          value={briefingId}
          onChange={(e) => setBriefingId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          <option value="">Sem comparação</option>
          {briefingOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-6">
        <p className="text-xs font-light text-muted-foreground">
          Tempo estimado: ~20s. Custo: ~US$ 0,003 por análise.
        </p>
        <button
          type="button"
          disabled={!file || submitting || converting}
          onClick={onNext}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-[12px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Analisar planta
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ============== STEP 2 ============== */

function Step2({
  imageUrl,
  analysis,
  analyzing,
  onBack,
  onExport,
  onSendStudio,
  briefing,
  tab,
  setTab,
}: {
  imageUrl: string | null;
  analysis: FloorplanAnalysis | null;
  analyzing: boolean;
  onBack: () => void;
  onExport: () => void;
  onSendStudio: () => void;
  briefing: BriefingOption["briefing"];
  tab: "analysis" | "compare";
  setTab: (t: "analysis" | "compare") => void;
}) {
  const hasBriefing = !!briefing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Nova análise
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExport}
            disabled={!analysis}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[11px] font-black uppercase tracking-[0.14em] text-foreground transition-colors hover:border-accent/60 hover:bg-muted disabled:opacity-40"
          >
            <FileText className="h-4 w-4" /> Exportar JSON
          </button>
          <button
            type="button"
            onClick={onSendStudio}
            disabled={!analysis}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[11px] font-black uppercase tracking-[0.14em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" /> Enviar para o Studio
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Planta analisada"
              className="max-h-[640px] w-full bg-background object-contain"
            />
          ) : (
            <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
              Sem imagem
            </div>
          )}
        </div>

        <div className="rounded-md border border-border bg-card">
          {hasBriefing && (
            <div className="flex border-b border-border">
              <TabBtn active={tab === "analysis"} onClick={() => setTab("analysis")}>
                Análise
              </TabBtn>
              <TabBtn active={tab === "compare"} onClick={() => setTab("compare")}>
                Comparar com briefing
              </TabBtn>
            </div>
          )}
          <div className="relative min-h-[400px]">
            {tab === "analysis" && <InlineAnalysis loading={analyzing} analysis={analysis} />}
            {tab === "compare" && analysis && briefing && (
              <CompareView analysis={analysis} briefing={briefing} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
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
      className={`flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
        active
          ? "border-b-2 border-accent text-accent"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ============== ANALYSIS PANEL (sem Sheet flutuante) ============== */

function InlineAnalysis({
  loading,
  analysis,
}: {
  loading: boolean;
  analysis: FloorplanAnalysis | null;
}) {
  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
        <p className="text-[12px] font-light text-muted-foreground">
          Detectando cômodos, áreas e validando NBR…
        </p>
      </div>
    );
  }
  if (!analysis) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center text-[12px] font-light text-muted-foreground">
        Nenhuma análise disponível.
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 py-5">
      {(analysis.totalAreaApprox != null ||
        analysis.bedrooms != null ||
        analysis.suites != null ||
        analysis.bathrooms != null ||
        analysis.garages != null) && (
        <Section title="Resumo">
          <div className="grid grid-cols-2 gap-2">
            {analysis.totalAreaApprox != null && (
              <Stat label="Área aprox." value={`${analysis.totalAreaApprox} m²`} />
            )}
            {analysis.bedrooms != null && (
              <Stat label="Quartos" value={String(analysis.bedrooms)} />
            )}
            {analysis.suites != null && <Stat label="Suítes" value={String(analysis.suites)} />}
            {analysis.bathrooms != null && (
              <Stat label="Banhos" value={String(analysis.bathrooms)} />
            )}
            {analysis.garages != null && <Stat label="Vagas" value={String(analysis.garages)} />}
          </div>
        </Section>
      )}

      {analysis.rooms.length > 0 && (
        <Section title={`Cômodos detectados (${analysis.rooms.length})`}>
          <div className="space-y-1.5">
            {analysis.rooms.map((r, i) => (
              <div
                key={`${r.name}-${i}`}
                className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
              >
                <span className="text-[12px] font-bold text-foreground">{r.name}</span>
                {r.areaM2 != null && (
                  <span className="text-[12px] font-black text-foreground">
                    {r.areaM2.toFixed(1)} m²
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {analysis.accessibility && (
        <Section title="Validação NBR 9050">
          {analysis.accessibility.nbr9050 != null && (
            <span
              className={`inline-flex items-center rounded-[4px] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                analysis.accessibility.nbr9050
                  ? "border border-accent/30 bg-accent/10 text-accent"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              {analysis.accessibility.nbr9050 ? "Conforme" : "Atenção"}
            </span>
          )}
          {!!analysis.accessibility.notes?.length && (
            <ul className="mt-3 space-y-2">
              {analysis.accessibility.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="text-[11px] font-light leading-relaxed text-muted-foreground">
                    {n}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function CompareView({
  analysis,
  briefing,
}: {
  analysis: FloorplanAnalysis;
  briefing: NonNullable<BriefingOption["briefing"]>;
}) {
  const rows: { label: string; pedido?: number; detectado?: number }[] = [
    { label: "Área (m²)", pedido: briefing.areaM2, detectado: analysis.totalAreaApprox },
    { label: "Quartos", pedido: briefing.quartos, detectado: analysis.bedrooms },
    { label: "Suítes", pedido: briefing.suites, detectado: analysis.suites },
    { label: "Banhos", pedido: briefing.banhos, detectado: analysis.bathrooms },
    { label: "Vagas", pedido: briefing.vagas, detectado: analysis.garages },
  ];

  return (
    <div className="px-6 py-5">
      <h5 className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-accent">
        Briefing vs detectado
      </h5>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 font-bold text-foreground">Campo</th>
              <th className="px-3 py-2 text-right font-bold text-foreground">Pedido</th>
              <th className="px-3 py-2 text-right font-bold text-foreground">Detectado</th>
              <th className="px-3 py-2 text-right font-bold text-foreground">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.pedido != null && r.detectado != null ? r.detectado - r.pedido : null;
              const ok = diff != null && Math.abs(diff) < 0.5;
              return (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-3 py-2 font-bold text-foreground">{r.label}</td>
                  <td className="px-3 py-2 text-right font-light text-muted-foreground">
                    {r.pedido ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-light text-muted-foreground">
                    {r.detectado ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-black ${
                      diff == null
                        ? "text-muted-foreground"
                        : ok
                          ? "text-accent"
                          : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {diff == null ? "—" : diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-accent">
        {title}
      </h5>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

// keep VisionAnalysisSheet imported for potential future flotation; not used inline here
void VisionAnalysisSheet;
