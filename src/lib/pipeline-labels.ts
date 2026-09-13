import type { Enums } from "@/integrations/supabase/types";

export type PipelineType = Enums<"pipeline_type">;

/**
 * Rótulo de cada pipeline para a UI.
 *
 * O `Record<PipelineType, string>` é proposital: se o enum do banco ganhar um
 * valor novo e o types.ts for regerado, o tsc passa a cobrar a entrada aqui, em
 * vez de a tela cair no fallback silencioso.
 */
export const PIPELINE_LABEL: Record<PipelineType, string> = {
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
  floorplan_2d: "Briefing → Planta 2D",
  floorplan_analysis: "Análise de planta",
};

export const PIPELINE_TYPES = Object.keys(PIPELINE_LABEL) as PipelineType[];

export function pipelineLabel(type: string): string {
  return PIPELINE_LABEL[type as PipelineType] ?? type;
}
