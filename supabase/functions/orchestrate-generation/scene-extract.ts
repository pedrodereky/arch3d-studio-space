// Detecta objetos em uma imagem de cena/perspectiva usando Gemini 2.5 Pro
// com tool calling. Retorna lista de objetos com posição, escala, rotação
// estimadas em metros + prompt de isolamento (para Gemini regenerar cada
// objeto sozinho em fundo branco antes de virar 3D).

import type { Furniture, FurnitureType } from "./floorplan-extract.ts";

export type SceneObject = Furniture & {
  isolation_prompt: string;
};

export type Scene = {
  bounds_m: { w: number; h: number };
  objects: SceneObject[];
};

const MAX_OBJECTS = 8;

const FUNCTION_SCHEMA = {
  name: "submit_scene",
  description:
    "Submit the list of furniture/object items detected in a perspective rendering or photograph of an interior scene. All measurements in meters. Origin at top-left of an imaginary floor plan, +x right, +y depth (away from camera).",
  parameters: {
    type: "OBJECT",
    properties: {
      bounds_m: {
        type: "OBJECT",
        description: "Approximate floor area covered by the visible scene in meters.",
        properties: { w: { type: "NUMBER" }, h: { type: "NUMBER" } },
        required: ["w", "h"],
      },
      objects: {
        type: "ARRAY",
        description: `Up to ${MAX_OBJECTS} distinct, salient objects in the scene. Skip background details (walls, ceiling, floor, light fixtures embedded in ceiling). Focus on free-standing furniture and large appliances.`,
        items: {
          type: "OBJECT",
          properties: {
            type: {
              type: "STRING",
              enum: [
                "sofa",
                "armchair",
                "chair",
                "bed_double",
                "bed_single",
                "table_dining",
                "table_coffee",
                "desk",
                "wardrobe",
                "tv",
                "toilet",
                "sink",
                "bathtub",
                "shower",
                "stove",
                "fridge",
                "kitchen_counter",
                "lamp",
                "plant",
              ],
            },
            x: { type: "NUMBER", description: "Center X in meters on a top-down floor plan." },
            y: { type: "NUMBER", description: "Center Y (depth) in meters." },
            rotation_deg: {
              type: "NUMBER",
              description: "Rotation in degrees, 0 = facing +y (toward camera).",
            },
            width_m: { type: "NUMBER" },
            depth_m: { type: "NUMBER" },
            prompt: {
              type: "STRING",
              description:
                "Detailed English description of THIS specific item (style, material, color, finish). Used as text fallback. Always end with: 'photorealistic, single object, isolated, white background, neutral lighting'.",
            },
            isolation_prompt: {
              type: "STRING",
              description:
                "Instruction in English telling an image model to ISOLATE this exact object from the original scene image and render it alone, centered, on a pure white background, soft studio lighting, with no other objects, no shadows on ground, no perspective distortion. Be very specific about which object to isolate (mention position, color, distinctive features) so the model picks the right one when there are multiple similar items.",
            },
          },
          required: [
            "type",
            "x",
            "y",
            "rotation_deg",
            "width_m",
            "depth_m",
            "prompt",
            "isolation_prompt",
          ],
        },
      },
    },
    required: ["bounds_m", "objects"],
  },
};

const SYSTEM_PROMPT =
  "You are a 3D scene analyst. Given a single perspective rendering or photograph of an interior, extract the salient free-standing furniture and large appliances so they can be reconstructed individually in 3D and placed back in the scene.\n" +
  "RULES:\n" +
  "(1) Use METERS. Estimate using standard references: chair seat=0.45m high, dining chair footprint ~0.5x0.5m, sofa 2.2x0.9m, fridge 0.7x0.7x1.9m, dining table 1.6x0.9m.\n" +
  "(2) Place each object on a top-down floor plan: origin (0,0) at the visual back-left of the floor, +x to the right, +y toward the camera. Spread objects realistically — don't stack them at the same point.\n" +
  '(3) For repeated identical items (e.g. 3 dining chairs in a row), emit ONE entry per chair with distinct positions but the SAME prompt and isolation_prompt — except the isolation_prompt must specify WHICH chair ("the leftmost chair", "the middle chair", etc.).\n' +
  "(4) IGNORE: walls, ceiling, floor, recessed ceiling lights, wall outlets, decorative items smaller than 20cm, items embedded in cabinetry that you cannot isolate.\n" +
  `(5) Cap output at ${MAX_OBJECTS} objects. Pick the most prominent / largest items if there are more.\n` +
  "(6) The isolation_prompt is the most important field. It will be sent to an image model along with the original scene image to produce a clean isolated render of that one object on white background. Make it specific enough that the model picks the right object.\n" +
  "Output ONLY by calling submit_scene.";

export async function extractScene(
  geminiKey: string,
  imageB64: string,
  mime: string,
): Promise<Scene> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" +
    geminiKey;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract the scene objects from this interior render." },
          { inline_data: { mime_type: mime, data: imageB64 } },
        ],
      },
    ],
    tools: [{ functionDeclarations: [FUNCTION_SCHEMA] }],
    toolConfig: {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["submit_scene"] },
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`gemini scene extract ${r.status}: ${t.slice(0, 500)}`);
  }
  const json = await r.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const fc = p.functionCall ?? p.function_call;
    if (fc?.name === "submit_scene" && fc.args) {
      return validateScene(fc.args);
    }
  }
  throw new Error("gemini scene extract: nenhuma chamada de submit_scene");
}

function validateScene(raw: unknown): Scene {
  const s = raw as Scene;
  if (!s?.bounds_m?.w || !s?.bounds_m?.h) {
    s.bounds_m = { w: 6, h: 6 };
  }
  if (!Array.isArray(s.objects)) s.objects = [];
  s.objects = s.objects.slice(0, MAX_OBJECTS);
  for (const o of s.objects) {
    if (!o.type) (o as { type: FurnitureType }).type = "chair";
    if (!o.width_m || o.width_m <= 0) o.width_m = 0.6;
    if (!o.depth_m || o.depth_m <= 0) o.depth_m = 0.6;
    if (typeof o.rotation_deg !== "number") o.rotation_deg = 0;
    if (!o.prompt)
      o.prompt = `a ${o.type}, photorealistic, single object, isolated, white background, neutral lighting`;
    if (!o.isolation_prompt) {
      o.isolation_prompt = `Isolate the ${o.type} from this image. Render it alone, centered, fully visible, on a pure white background (#FFFFFF), soft even studio lighting, no other objects, no shadows on the ground, no perspective distortion, photorealistic.`;
    }
  }
  if (s.objects.length === 0) {
    throw new Error("scene extract: nenhum objeto detectado na cena");
  }
  return s;
}
