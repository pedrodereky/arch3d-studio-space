// Extrai estrutura 2.5D de uma planta baixa usando Gemini 2.5 Pro com tool calling.
// Retorna JSON validado pronto para o builder procedural.

export type Wall = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness_m: number;
  height_m: number;
};

export type Opening = {
  wall_idx: number;
  offset_m: number; // distância ao longo da parede a partir de (x1,y1)
  width_m: number;
  height_m: number;
  sill_m: number; // 0 = porta; >0 = janela (altura do peitoril)
  kind: "door" | "window";
};

export type WallFinish = "painted_white" | "painted_warm" | "wood_panel" | "exposed_brick";

export type Room = {
  polygon: Array<[number, number]>;
  label: string;
  floor_material: "wood" | "tile" | "carpet" | "concrete";
  wall_finish: WallFinish;
};

export type Style = "modern" | "scandi" | "industrial" | "classic" | "minimal";

export type FurnitureType =
  | "sofa"
  | "armchair"
  | "chair"
  | "bed_double"
  | "bed_single"
  | "table_dining"
  | "table_coffee"
  | "desk"
  | "wardrobe"
  | "tv"
  | "toilet"
  | "sink"
  | "bathtub"
  | "shower"
  | "stove"
  | "fridge"
  | "kitchen_counter"
  | "lamp"
  | "plant";

export type Furniture = {
  type: FurnitureType;
  x: number;
  y: number;
  rotation_deg: number;
  width_m: number;
  depth_m: number;
  prompt: string;
};

export type Blueprint = {
  bounds_m: { w: number; h: number };
  style: Style;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: Furniture[];
};

const FUNCTION_SCHEMA = {
  name: "submit_blueprint",
  description:
    "Submit the structured blueprint extracted from the floor plan image. All measurements in meters. Coordinate origin at top-left, +x right, +y down.",
  parameters: {
    type: "OBJECT",
    properties: {
      bounds_m: {
        type: "OBJECT",
        description: "Total bounding box of the floor plan in meters.",
        properties: {
          w: { type: "NUMBER" },
          h: { type: "NUMBER" },
        },
        required: ["w", "h"],
      },
      style: {
        type: "STRING",
        enum: ["modern", "scandi", "industrial", "classic", "minimal"],
        description:
          "Overall interior design style inferred from the plan layout and any visible cues. Default to 'modern'.",
      },
      walls: {
        type: "ARRAY",
        description:
          "Wall segments. Each segment is a straight wall from (x1,y1) to (x2,y2). Walls should form closed rooms when combined. Default thickness 0.15m, default height 2.7m.",
        items: {
          type: "OBJECT",
          properties: {
            x1: { type: "NUMBER" },
            y1: { type: "NUMBER" },
            x2: { type: "NUMBER" },
            y2: { type: "NUMBER" },
            thickness_m: { type: "NUMBER" },
            height_m: { type: "NUMBER" },
          },
          required: ["x1", "y1", "x2", "y2", "thickness_m", "height_m"],
        },
      },
      openings: {
        type: "ARRAY",
        description:
          "Doors and windows. wall_idx references the walls array. offset_m is distance from wall start along the wall direction. sill_m=0 for doors, ~0.9 for windows.",
        items: {
          type: "OBJECT",
          properties: {
            wall_idx: { type: "INTEGER" },
            offset_m: { type: "NUMBER" },
            width_m: { type: "NUMBER" },
            height_m: { type: "NUMBER" },
            sill_m: { type: "NUMBER" },
            kind: { type: "STRING", enum: ["door", "window"] },
          },
          required: ["wall_idx", "offset_m", "width_m", "height_m", "sill_m", "kind"],
        },
      },
      rooms: {
        type: "ARRAY",
        description:
          "Closed room polygons (interior floor area), as ordered [x,y] points in meters.",
        items: {
          type: "OBJECT",
          properties: {
            polygon: {
              type: "ARRAY",
              items: {
                type: "ARRAY",
                items: { type: "NUMBER" },
              },
            },
            label: { type: "STRING" },
            floor_material: { type: "STRING", enum: ["wood", "tile", "carpet", "concrete"] },
            wall_finish: {
              type: "STRING",
              enum: ["painted_white", "painted_warm", "wood_panel", "exposed_brick"],
            },
          },
          required: ["polygon", "label", "floor_material", "wall_finish"],
        },
      },
      furniture: {
        type: "ARRAY",
        description:
          "Furniture items detected in the plan. Position (x,y) is the CENTER of the item in meters. rotation_deg is clockwise from north (0 = facing +y).",
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
            x: { type: "NUMBER" },
            y: { type: "NUMBER" },
            rotation_deg: { type: "NUMBER" },
            width_m: { type: "NUMBER" },
            depth_m: { type: "NUMBER" },
            prompt: {
              type: "STRING",
              description:
                "Detailed English text-to-3D prompt describing this specific furniture item. Include style, material, color, finish. Always end with: 'photorealistic, single object, isolated, white background, neutral lighting'. Example: 'a modern 3-seat fabric sofa, beige linen upholstery, wooden legs, scandinavian style, photorealistic, single object, isolated, white background, neutral lighting'.",
            },
          },
          required: ["type", "x", "y", "rotation_deg", "width_m", "depth_m", "prompt"],
        },
      },
    },
    required: ["bounds_m", "style", "walls", "openings", "rooms", "furniture"],
  },
};

const SYSTEM_PROMPT =
  "You are an architectural plan analyst. Given a 2D floor plan image, extract the geometry as structured data so it can be reconstructed in 3D. " +
  "RULES: " +
  "(1) Use METERS for all measurements. If the plan has dimension annotations, use them. Otherwise estimate using standard references: door=0.8m wide, single bed=2x1m, double bed=2x1.6m, sofa=2.2x0.9m, dining table=1.6x0.9m, toilet=0.7x0.5m. " +
  "(2) Coordinate origin = TOP-LEFT corner of the plan. +x goes right, +y goes down. " +
  "(3) Walls must be straight segments. Decompose curved walls into short straight segments. Default thickness 0.15m, default height 2.7m. " +
  "(4) Make sure walls actually CLOSE rooms — every room must be fully enclosed by walls. " +
  "(5) For each opening (door/window), reference the wall it sits on by index, give the offset along that wall from (x1,y1). Doors: sill_m=0, height_m=2.1. Windows: sill_m=0.9, height_m=1.2. " +
  "(6) Room polygons should be the INTERIOR floor area (inside the walls), points in order forming a closed loop. " +
  "(7) For furniture, x/y is the CENTER of the item. Rotation 0° = item's main axis aligned with +y (north). " +
  "(8) Be generous detecting furniture — even simple rectangles in a bedroom likely represent a bed; rectangles around a table are chairs; etc. " +
  "(9) For EACH furniture item write a rich English `prompt` describing exactly that piece (style, material, color, finish) so a separate text-to-3D model can generate it. Always end the prompt with: 'photorealistic, single object, isolated, white background, neutral lighting'. Use the global `style` to keep all furniture coherent. " +
  "(10) Pick a `style` and consistent `wall_finish`/`floor_material` per room. " +
  "Output ONLY by calling submit_blueprint.";

export async function extractFloorplan(
  geminiKey: string,
  imageB64: string,
  mime: string,
): Promise<Blueprint> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" +
    geminiKey;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract the blueprint from this floor plan." },
          { inline_data: { mime_type: mime, data: imageB64 } },
        ],
      },
    ],
    tools: [{ functionDeclarations: [FUNCTION_SCHEMA] }],
    toolConfig: {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["submit_blueprint"] },
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`gemini extract ${r.status}: ${t.slice(0, 500)}`);
  }
  const json = await r.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const fc = p.functionCall ?? p.function_call;
    if (fc?.name === "submit_blueprint" && fc.args) {
      return validateBlueprint(fc.args);
    }
  }
  throw new Error("gemini extract: nenhuma chamada de submit_blueprint");
}

function validateBlueprint(raw: unknown): Blueprint {
  const bp = raw as Blueprint;
  if (!bp?.bounds_m?.w || !bp?.bounds_m?.h) throw new Error("blueprint: bounds inválidos");
  if (!Array.isArray(bp.walls) || bp.walls.length === 0) throw new Error("blueprint: sem paredes");
  // Defaults defensivos
  bp.openings = Array.isArray(bp.openings) ? bp.openings : [];
  bp.rooms = Array.isArray(bp.rooms) ? bp.rooms : [];
  bp.furniture = Array.isArray(bp.furniture) ? bp.furniture : [];
  if (!bp.style) bp.style = "modern";
  for (const w of bp.walls) {
    if (!w.thickness_m || w.thickness_m <= 0) w.thickness_m = 0.15;
    if (!w.height_m || w.height_m <= 0) w.height_m = 2.7;
  }
  for (const r of bp.rooms) {
    if (!r.wall_finish) r.wall_finish = "painted_white";
    if (!r.floor_material) r.floor_material = "wood";
  }
  for (const f of bp.furniture) {
    if (!f.prompt)
      f.prompt = `a ${f.type}, photorealistic, single object, isolated, white background, neutral lighting`;
  }
  return bp;
}
