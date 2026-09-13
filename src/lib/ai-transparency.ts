// Fonte única da UI de transparência de IA.
//
// Os valores espelham o que as edge functions em supabase/functions/ realmente
// chamam. Ao trocar um modelo ou provedor, atualize aqui junto.
//
// Não existe um provedor único: parte das chamadas passa pelo gateway da
// Lovable, e parte vai direto para Replicate, OpenAI e Google — cada uma com
// credencial e faturamento próprios.

export type ProviderId = "lovable" | "replicate" | "openai" | "google";

export type Provider = {
  id: ProviderId;
  name: string;
  endpoint: string;
  credential: string;
  billing: string;
};

export const AI_PROVIDERS: Provider[] = [
  {
    id: "lovable",
    name: "Lovable AI Gateway",
    endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
    credential: "LOVABLE_API_KEY",
    billing: "Faturado no workspace Lovable do dono do projeto (Settings → Workspace → Usage).",
  },
  {
    id: "replicate",
    name: "Replicate",
    endpoint: "https://api.replicate.com/v1",
    credential: "REPLICATE_API_TOKEN",
    billing: "Faturado na conta Replicate conectada no assistente de configuração, por predição.",
  },
  {
    id: "openai",
    name: "OpenAI (direto)",
    endpoint: "https://api.openai.com/v1/images/edits",
    credential: "OPENAI_API_KEY",
    billing: "Faturado na conta OpenAI da chave configurada, por imagem gerada.",
  },
  {
    id: "google",
    name: "Google AI (Gemini, direto)",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    credential: "GEMINI_API_KEY",
    billing: "Faturado na conta Google AI da chave configurada.",
  },
];

export const PROVIDER_BY_ID: Record<ProviderId, Provider> = Object.fromEntries(
  AI_PROVIDERS.map((p) => [p.id, p]),
) as Record<ProviderId, Provider>;

export type PipelineStep = {
  /** Recurso do produto ao qual a etapa pertence, como o usuário o conhece. */
  feature: string;
  stage: string;
  purpose: string;
  model: string;
  provider: ProviderId;
  file: string;
};

export const AI_PIPELINE_STEPS: PipelineStep[] = [
  {
    feature: "Objetos 3D",
    stage: "Preparo da imagem",
    purpose:
      "Limpa o fundo e gera vistas multi-view antes do 3D (pipelines Enriquecido e Edita antes).",
    model: "gemini-2.5-flash-image",
    provider: "google",
    file: "supabase/functions/orchestrate-generation/index.ts",
  },
  {
    feature: "Objetos 3D",
    stage: "Malha 3D — Hunyuan 2.1",
    purpose: "Gera o GLB com textura a partir da imagem ou das vistas multi-view.",
    model: "ndreca/hunyuan3d-2.1 (versão fixada)",
    provider: "replicate",
    file: "supabase/functions/orchestrate-generation/index.ts",
  },
  {
    feature: "Objetos 3D",
    stage: "Malha 3D — Hunyuan 3.1",
    purpose: "Motor do pipeline Texto para 3D, sem imagem de entrada.",
    model: "tencent/hunyuan-3d-3.1",
    provider: "replicate",
    file: "supabase/functions/orchestrate-generation/index.ts",
  },
  {
    feature: "Objetos 3D",
    stage: "Refino do prompt",
    purpose: "Reescreve a descrição do objeto quando você usa “Refinar com IA”.",
    model: "google/gemini-2.5-flash",
    provider: "lovable",
    file: "supabase/functions/refine-text-prompt/index.ts",
  },
  {
    feature: "Redecorar",
    stage: "Variações do ambiente",
    purpose:
      "Gera as propostas fotorrealistas a partir da foto do ambiente, preservando o layout quando pedido.",
    model: "gpt-image-2 (/v1/images/edits)",
    provider: "openai",
    file: "supabase/functions/_shared/gpt-image-2-openai.ts",
  },
  {
    feature: "Briefing → Planta 2D",
    stage: "Desenho da planta",
    purpose: "Gera as plantas baixas 2D a partir do texto do briefing.",
    model: "LoRA de planta baixa (versão fixada no Replicate)",
    provider: "replicate",
    file: "supabase/functions/_shared/replicate-floorplan.ts",
  },
  {
    feature: "Análise de planta",
    stage: "Leitura da planta",
    purpose: "Identifica cômodos, áreas e pontos de atenção de NBR 9050 na imagem ou PDF.",
    model: "google/gemini-2.5-flash",
    provider: "lovable",
    file: "supabase/functions/_shared/replicate-floorplan.ts",
  },
  {
    feature: "Render de planta",
    stage: "Análise das pranchas",
    purpose: "Classifica as pranchas e consolida o brief de projeto que orienta o render.",
    model: "openai/gpt-5.5",
    provider: "lovable",
    file: "supabase/functions/_shared/floorplan-analyzer.ts",
  },
  {
    feature: "Render de planta",
    stage: "Render do candidato",
    purpose:
      "Renderiza a imagem final. Vai direto à OpenAI quando há OPENAI_API_KEY; sem ela, usa o proxy do Replicate para o mesmo modelo.",
    model: "gpt-image-2",
    provider: "openai",
    file: "supabase/functions/orchestrate-generation/index.ts",
  },
  {
    feature: "Planta 3D e Cena → 3D",
    stage: "Extração da geometria",
    purpose: "Lê paredes, aberturas e mobiliário da planta ou da cena para montar o GLB.",
    model: "gemini-2.5-pro",
    provider: "google",
    file: "supabase/functions/orchestrate-generation/floorplan-extract.ts",
  },
  {
    feature: "Planta 3D e Cena → 3D",
    stage: "Texturas PBR",
    purpose: "Gera os mapas de textura dos materiais identificados.",
    model: "google/gemini-3.1-flash-image-preview",
    provider: "lovable",
    file: "supabase/functions/orchestrate-generation/pbr-textures.ts",
  },
  {
    feature: "Planta 3D e Cena → 3D",
    stage: "Mobiliário em 3D",
    purpose: "Gera as malhas dos móveis que entram na cena.",
    model: "tencent/hunyuan-3d-3.1",
    provider: "replicate",
    file: "supabase/functions/orchestrate-generation/furniture-mesh.ts",
  },
  {
    feature: "Vídeo POV",
    stage: "Vídeo a partir do render",
    purpose: "Anima um percurso em vídeo a partir de uma imagem já gerada.",
    model: "alibaba/happyhorse-1.0",
    provider: "replicate",
    file: "supabase/functions/orchestrate-generation/index.ts",
  },
  {
    feature: "Studio",
    stage: "Nós de imagem",
    purpose:
      "Executa cada nó do fluxo. O modelo é escolhido por nó; o padrão é o Gemini pelo gateway.",
    model: "google/gemini-3.1-flash-image-preview ou openai/gpt-image-2",
    provider: "lovable",
    file: "supabase/functions/studio-execute/index.ts",
  },
  {
    feature: "Studio",
    stage: "Detecção de mobiliário",
    purpose: "Localiza os móveis da imagem para extraí-los como objetos separados.",
    model: "gemini-2.5-pro",
    provider: "google",
    file: "supabase/functions/_shared/scene-extract.ts",
  },
];

/** Etapas agrupadas por recurso, na ordem em que aparecem acima. */
export function stepsByFeature(): { feature: string; steps: PipelineStep[] }[] {
  const groups: { feature: string; steps: PipelineStep[] }[] = [];
  for (const step of AI_PIPELINE_STEPS) {
    const last = groups.find((g) => g.feature === step.feature);
    if (last) last.steps.push(step);
    else groups.push({ feature: step.feature, steps: [step] });
  }
  return groups;
}
