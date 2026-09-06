// Single source of truth for AI transparency UI.
// These values mirror the model strings hardcoded in the edge functions
// under supabase/functions/. Keep in sync if a model changes.

export const AI_GATEWAY = {
  provider: "Lovable AI Gateway",
  endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
  credential: "LOVABLE_API_KEY",
  billing:
    "O consumo é faturado no workspace Lovable do dono do projeto (Settings → Workspace → Usage).",
} as const;

export type PipelineStep = {
  stage: string;
  purpose: string;
  model: string;
  file: string;
  viaGateway: boolean;
};

export const AI_PIPELINE_STEPS: PipelineStep[] = [
  {
    stage: "Classificação de pranchas",
    purpose: "Identifica o tipo de cada página do PDF (planta, corte, fachada, estilo).",
    model: "openai/gpt-5.5",
    file: "supabase/functions/_shared/page-classifier.ts",
    viaGateway: true,
  },
  {
    stage: "Brief do projeto",
    purpose: "Resume programa, estilo e materiais a partir das pranchas selecionadas.",
    model: "openai/gpt-5.5",
    file: "supabase/functions/_shared/project-brief.ts",
    viaGateway: true,
  },
  {
    stage: "Recorte de assets",
    purpose: "Extrai bounding boxes de planta, cômodos, mobiliário, equipamentos e estilo.",
    model: "openai/gpt-5.5",
    file: "supabase/functions/_shared/floorplan-cropper.ts",
    viaGateway: true,
  },
  {
    stage: "Orquestração",
    purpose: "Decide a estratégia de geração de cada candidato.",
    model: "openai/gpt-5.5",
    file: "supabase/functions/orchestrate-generation/index.ts",
    viaGateway: true,
  },
  {
    stage: "Texturas PBR",
    purpose: "Gera mapas de textura para os materiais identificados.",
    model: "google/gemini-3.1-flash-image-preview",
    file: "supabase/functions/orchestrate-generation/pbr-textures.ts",
    viaGateway: true,
  },
  {
    stage: "Render do candidato",
    purpose: "Renderiza a imagem final (quality=high, imagens de referência preservadas pelo modelo).",
    model: "openai/gpt-image-2 (OpenAI API direta)",
    file: "supabase/functions/orchestrate-generation/index.ts",
    viaGateway: false,
  },
];
