import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BriefingForm } from "@/features/briefing/BriefingForm";
import { FloorplanGrid } from "@/features/briefing/FloorplanGrid";
import { VisionAnalysisSheet } from "@/features/briefing/VisionAnalysisSheet";
import {
  DEFAULT_BRIEFING,
  type Briefing,
  type FloorplanAsset,
  type FloorplanAnalysis,
} from "@/features/briefing/types";

export const Route = createFileRoute("/_authenticated/app/gerar/briefing")({
  component: BriefingPage,
});

type Phase = "empty" | "loading" | "results";

function BriefingPage() {
  const { user } = useAuth();
  const [briefing, setBriefing] = useState<Briefing>(DEFAULT_BRIEFING);
  const [phase, setPhase] = useState<Phase>("empty");
  const [assets, setAssets] = useState<FloorplanAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FloorplanAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleGenerate = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setPhase("loading");
    setAssets([]);
    setSelectedId(null);
    setAnalysis(null);
    setSheetOpen(false);

    try {
      const { data, error } = await supabase.functions.invoke("generate-floorplan-2d", {
        body: { briefing },
      });
      if (error) {
        throw new Error((error as { message?: string }).message ?? "Falha na geração");
      }
      const body = data as {
        ok?: boolean;
        error?: string;
        generationId?: string;
        assets?: FloorplanAsset[];
      };
      if (!body?.ok || !body.assets?.length) {
        throw new Error(body?.error ?? "Resposta inválida");
      }
      setAssets(body.assets);
      setPhase("results");
      toast.success("Plantas geradas", {
        description: `${body.assets.length} propostas prontas.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha desconhecida";
      toast.error("Erro ao gerar plantas", { description: msg });
      setPhase("empty");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelect = async (assetId: string) => {
    setSelectedId(assetId);
    setSheetOpen(true);
    setAnalysis(null);
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-floorplan-vision", {
        body: { assetId },
      });
      if (error) {
        throw new Error((error as { message?: string }).message ?? "Falha na análise");
      }
      const body = data as { ok?: boolean; error?: string; analysis?: FloorplanAnalysis };
      if (!body?.ok || !body.analysis) {
        throw new Error(body?.error ?? "Resposta inválida");
      }
      setAnalysis(body.analysis);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha desconhecida";
      toast.error("Erro ao analisar", { description: msg });
    } finally {
      setAnalyzing(false);
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
    a.download = `analise-planta-${selectedId ?? "sem-id"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="-mx-6 -my-6 h-[calc(100vh-4rem)] md:-mx-8 md:-my-8">
      <div className="grid h-full grid-cols-[minmax(320px,400px)_1fr]">
        <BriefingForm
          value={briefing}
          onChange={setBriefing}
          submitting={submitting}
          onSubmit={() => void handleGenerate()}
        />
        <main className="relative">
          <FloorplanGrid
            phase={phase}
            assets={assets}
            selectedId={selectedId}
            onSelect={(id) => void handleSelect(id)}
          />
          <VisionAnalysisSheet
            open={sheetOpen}
            loading={analyzing}
            analysis={analysis}
            onClose={() => setSheetOpen(false)}
            onExport={handleExport}
          />
        </main>
      </div>
    </div>
  );
}
