import { Map, Upload, X, Loader2, Sparkles, Box, Eye, Building2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/gerar/planta")({
  component: GerarPlantaPage,
});

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 20;

// Rasteriza páginas do PDF como JPEG q=0.85 a 2x. ~400KB/página vs ~6MB/página em PNG@3.
// Tamanho-alvo permite que 15 pranchas caibam confortavelmente abaixo de qualquer limite de payload.
async function pdfAllPagesToJpegs(file: File): Promise<File[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerMod = (await import(/* @vite-ignore */ "pdfjs-dist/build/pdf.worker.mjs?url")) as {
    default: string;
  };
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const total = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const baseName = file.name.replace(/\.pdf$/i, "");
  const out: File[] = [];
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    // Fundo branco — JPEG não tem alfa, evita artefatos pretos.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob falhou"))), "image/jpeg", 0.85),
    );
    out.push(new File([blob], `${baseName}-p${i}.jpg`, { type: "image/jpeg" }));
  }
  return out;
}

function GerarPlantaPage() {
  const { user, isAdmin, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [files, setFiles] = useState<File[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [extra, setExtra] = useState("");
  const [viewMode, setViewMode] = useState<
    "isometric_aerial" | "frontal_interior" | "facade_exterior"
  >("isometric_aerial");
  const [diagnosticsMode, setDiagnosticsMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressGenId, setProgressGenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!files || files.length === 0) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(files[0]);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

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
      toast.error("Formato não suportado", { description: "Envie PDF ou imagem (PNG/JPG)." });
      return;
    }
    if (isPdf) {
      setConverting(true);
      try {
        const pages = await pdfAllPagesToJpegs(f);
        setFiles(pages);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha ao ler PDF";
        toast.error("Não foi possível converter o PDF", { description: msg });
      } finally {
        setConverting(false);
      }
    } else {
      setFiles([f]);
    }
  };

  const clearFile = () => {
    setFiles(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const uploadToInputs = async (f: File, genId: string, idx: number) => {
    if (!user) throw new Error("Sem usuário");
    const ext = f.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${genId}/plan-${idx + 1}.${ext}`;
    const { error } = await supabase.storage
      .from("inputs")
      .upload(path, f, { upsert: true, contentType: f.type });
    if (error) throw error;
    const { data: signed } = await supabase.storage
      .from("inputs")
      .createSignedUrl(path, 60 * 60 * 6);
    return signed?.signedUrl ?? path;
  };

  const handleGenerate = async () => {
    if (!user || !files || files.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const { data: gen, error: insErr } = await supabase
        .from("generations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          user_id: user.id,
          pipeline_type: "floorplan_render",
          engine: "hunyuan_2_1",
          status: "queued",
          source_images: [],
          prompt: extra.trim() || null,
          metadata: {
            view_mode: viewMode,
            ...(diagnosticsMode ? { diagnostics_mode: true } : {}),
          },
        } as any)
        .select("id")
        .single();
      if (insErr || !gen) throw insErr ?? new Error("Falha ao criar geração");

      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        urls.push(await uploadToInputs(files[i], gen.id, i));
      }
      await supabase.from("generations").update({ source_images: urls }).eq("id", gen.id);

      const { error: fnErr } = await supabase.functions.invoke("orchestrate-generation", {
        body: { generationId: gen.id },
      });
      if (fnErr) throw fnErr;

      setProgressGenId(gen.id);
      setProgress({ percent: 5, stage: "Iniciando" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao iniciar";
      toast.error("Erro ao gerar", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!progressGenId) return;
    const channel = supabase
      .channel(`gen-${progressGenId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generations",
          filter: `id=eq.${progressGenId}`,
        },
        async (payload) => {
          const row = payload.new as {
            status: string;
            progress_percent?: number;
            progress_stage?: string | null;
          };
          setProgress({
            percent: row.progress_percent ?? 0,
            stage: row.progress_stage ?? "",
          });
          if (row.status === "succeeded") {
            await refreshProfile?.();
            navigate({
              to: "/app/biblioteca",
              search: { destacar: progressGenId },
            } as never);
          } else if (row.status === "failed" || row.status === "cancelled") {
            toast.error("Geração falhou");
            setProgressGenId(null);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [progressGenId, navigate, refreshProfile]);

  const busy = submitting || !!progressGenId;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-foreground">Render de planta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Suba a planta executiva (PDF ou imagem) e a IA gera um render isométrico 3D fotorrealista
          do espaço mobiliado.
        </p>
      </header>

      {progressGenId ? (
        <div className="rounded-md border border-border bg-card p-8">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {progress.stage || "Processando"}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{progress.percent}%</span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            O render isométrico costuma levar 1–2 minutos. Você pode fechar essa aba — avisamos
            quando estiver pronto.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upload */}
          <div className="rounded-md border border-border bg-card p-6">
            <label className="mb-3 block text-sm font-medium text-foreground">
              Planta da loja / espaço
            </label>
            {!files || files.length === 0 ? (
              <label
                className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-background p-10 transition hover:border-accent ${
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
                    <span className="mt-3 text-sm font-medium text-foreground">
                      Clique para enviar
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      PDF, PNG ou JPG · até 20MB · PDF multipágina usa planta + cortes + renders
                      como referência
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
                {files && files.length > 1 && (
                  <span className="absolute left-2 top-2 rounded-full bg-foreground/80 px-2.5 py-1 text-xs font-medium text-background">
                    +{files.length - 1} {files.length - 1 === 1 ? "página" : "páginas"} de
                    referência
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute right-2 top-2 rounded-full bg-foreground/80 p-1.5 text-background hover:bg-foreground"
                  aria-label="Remover arquivo"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>

          {/* Tipo de vista */}
          <div className="rounded-md border border-border bg-card p-6">
            <label className="mb-3 block text-sm font-medium text-foreground">Tipo de vista</label>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  v: "isometric_aerial" as const,
                  icon: Box,
                  title: "Aérea isométrica",
                  desc: "Vista de cima a ~35°, teto removido. Mostra o layout completo.",
                },
                {
                  v: "frontal_interior" as const,
                  icon: Eye,
                  title: "Frontal interior",
                  desc: "Eye-level (~1,6m), olhando para o fundo. Sente a ambientação.",
                },
                {
                  v: "facade_exterior" as const,
                  icon: Building2,
                  title: "Fachada externa",
                  desc: "Vista da rua, fachada centralizada. Mostra identidade visual.",
                },
              ].map(({ v, icon: Icon, title, desc }) => {
                const active = viewMode === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViewMode(v)}
                    className={`flex flex-col items-start gap-2 rounded-md border p-4 text-left transition ${
                      active
                        ? "border-accent bg-accent/5 ring-1 ring-accent"
                        : "border-border bg-background hover:border-accent/60"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${active ? "text-accent" : "text-muted-foreground"}`}
                      strokeWidth={1.75}
                    />
                    <span className="text-sm font-medium text-foreground">{title}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instruções extras */}
          <div className="rounded-md border border-border bg-card p-6">
            <label htmlFor="extra" className="mb-2 block text-sm font-medium text-foreground">
              Instruções extras de estilo <span className="text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              id="extra"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Ex: paleta clara e clean, estilo industrial, mais plantas decorativas, identidade visual da marca XYZ…"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Use esse campo para ajustes de paleta, mood ou marca — não muda o tipo de vista
              escolhido acima.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center justify-between gap-4 rounded-md border border-dashed border-accent/40 bg-accent/5 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Modo diagnóstico</p>
                <p className="text-xs text-muted-foreground">
                  Grava logs detalhados de cada etapa em /admin/diagnóstico (mais lento, só admin).
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={diagnosticsMode}
                  onChange={(e) => setDiagnosticsMode(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                <span className="text-sm text-foreground">
                  {diagnosticsMode ? "Ativo" : "Desligado"}
                </span>
              </label>
            </div>
          )}

          {/* Ação */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Tempo estimado: 1–2 minutos. Custo: ~US$ 0,60 por render (classificação com raciocínio
              profundo + 2 candidatos).
            </p>
            <button
              type="button"
              disabled={!files || files.length === 0 || busy}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              )}
              Gerar render
            </button>
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-10 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4">
        <Map className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-xs text-muted-foreground">
          Esse pipeline usa GPT-Image-2 e funciona melhor com plantas humanizadas ou executivas com
          móveis e equipamentos já posicionados. Quanto mais detalhada a planta, mais fiel o render.
        </p>
      </div>
    </div>
  );
}
