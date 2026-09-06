// Modelos disponíveis em cada tipo de nó do Studio
export type StudioOp =
  | "image_upload"
  | "library_pick"
  | "remove_background"
  | "compose"
  | "edit"
  | "upscale"
  | "variations"
  | "output";

export type StudioModel = {
  id: string;
  label: string;
  hint: string;
};

export const MODELS: Record<string, StudioModel> = {
  "google/gemini-3.1-flash-image-preview": {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    hint: "Rápido, qualidade alta",
  },
  "google/gemini-3-pro-image-preview": {
    id: "google/gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    hint: "Mais qualidade, mais lento",
  },
  "openai/gpt-image-2": {
    id: "openai/gpt-image-2",
    label: "GPT-image-2",
    hint: "Alta fidelidade, OpenAI direto",
  },
};

export const MODEL_OPTIONS: StudioModel[] = Object.values(MODELS);

export const OP_META: Record<
  StudioOp,
  {
    label: string;
    description: string;
    needsPrompt: boolean;
    minInputs: number;
    maxInputs: number;
    isInput?: boolean;
    isOutput?: boolean;
  }
> = {
  image_upload: {
    label: "Upload de imagem",
    description: "Sobe uma imagem do seu computador para usar no fluxo.",
    needsPrompt: false,
    minInputs: 0,
    maxInputs: 0,
    isInput: true,
  },
  library_pick: {
    label: "Da biblioteca",
    description: "Escolhe uma imagem já gerada na sua biblioteca.",
    needsPrompt: false,
    minInputs: 0,
    maxInputs: 0,
    isInput: true,
  },
  remove_background: {
    label: "Remover fundo",
    description: "Recebe 1 imagem e devolve sem fundo (PNG transparente).",
    needsPrompt: false,
    minInputs: 1,
    maxInputs: 1,
  },
  compose: {
    label: "Compor / Inserir",
    description: "Junta 2+ imagens (ex.: ambiente + móvel) usando um prompt.",
    needsPrompt: true,
    minInputs: 2,
    maxInputs: 6,
  },
  edit: {
    label: "Editar com prompt",
    description: "Edita 1 imagem com base em uma instrução em texto.",
    needsPrompt: true,
    minInputs: 1,
    maxInputs: 1,
  },
  upscale: {
    label: "Upscale",
    description: "Aumenta a resolução de 1 imagem.",
    needsPrompt: false,
    minInputs: 1,
    maxInputs: 1,
  },
  variations: {
    label: "Variações",
    description: "Gera variações a partir de 1 imagem.",
    needsPrompt: false,
    minInputs: 1,
    maxInputs: 1,
  },
  output: {
    label: "Saída",
    description: "Marca o resultado final do fluxo. Aceita 1 conexão.",
    needsPrompt: false,
    minInputs: 1,
    maxInputs: 1,
    isOutput: true,
  },
};
