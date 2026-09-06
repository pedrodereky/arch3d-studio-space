// floorplan-analyzer.ts
// Substitui em UMA ÚNICA chamada: page-classifier + cropper + project-brief +
// composição de prompt para o gpt-image-2.
//
// Recebe N páginas (JPEGs já normalizados pelo cliente) e devolve:
//   - reference_page_indices: índices a enviar como referência ao image model
//   - prompt_for_gpt_image_2: prompt completo em inglês
//   - classifications: para diagnóstico
//
// Crucial: este helper NÃO decodifica imagens no worker. Só faz fetch HTTP
// para o Lovable AI Gateway. Memória do worker fica em strings + Uint8Array
// brutos, sem RGBA buffer gigante do imagescript.

const VIEW_REMINDERS: Record<string, string> = {
  isometric_aerial:
    "Output MUST be a top-down ~35° isometric cutaway with the roof removed, the entire space visible in one frame.",
  frontal_interior:
    "Output MUST be an eye-level interior shot (~1.6m camera height) looking toward the back of the space, ceiling visible. NO top-down view, NO cutaway.",
  facade_exterior:
    "Output MUST be a frontal exterior facade view from the street, building centered. NO interior, NO top-down view.",
};

export type PageClassification = {
  page_index: number;
  category: "layout" | "architecture" | "sections" | "style" | "other";
  role: string;
  confidence: number;
};

export type FloorplanAnalysis = {
  reference_page_indices: number[];
  prompt_for_gpt_image_2: string;
  classifications: PageClassification[];
  primary_category: string | null;
  diagnostics: {
    rooms_detected: number;
    equipment_detected: number;
    has_facade_style: boolean;
  };
};

export type AnalyzerInput = { b64: string; mime: string };

const SYSTEM_PROMPT = `You are a senior art director for photorealistic isometric architectural renders of Brazilian commercial interiors.

You will receive ALL pages of an executive interior project (some may be redundant title-blocks or unrelated).

Your job — in ONE pass — is to:
(A) Classify each page into one of: layout / architecture / sections / style / other
    - layout       = humanized plan with furniture & equipment positions
    - architecture = walls, doors, windows, building footprint, structural plan
    - sections     = vertical cuts/elevations showing heights
    - style        = mood-board, brand renders, material samples, logo, facade reference
    - other        = title block, legend page, schedule table, irrelevant, duplicate

(B) Pick up to 6 reference page indices to send to the image model. Prefer
    distinct, high-information pages. Always include the best layout and the
    best style page if present. Skip pure title-blocks and duplicates.

(C) Write ONE complete English prompt for the gpt-image-2 image model so it
    generates a photorealistic 3D render that is 100% faithful to the project.

YOUR PROMPT MUST INCLUDE:
1. An explicit reference-hierarchy paragraph telling the image model:
   - LAYOUT image is authoritative for furniture & equipment placement, type, quantity.
   - ARCHITECTURE image is authoritative for walls, doors, windows, footprint, geometry.
   - SECTIONS image is authoritative for ceiling height and vertical proportions.
   - STYLE image is authoritative ONLY for facade style, materials, colors, branding, lighting mood.
   - Conflict rules: walls/footprint → ARCHITECTURE wins. Furniture → LAYOUT wins. Style NEVER overrides geometry.
2. A room-by-room enumeration extracted from the LAYOUT image. For each room give relative position (upper-left, center, right-near-facade, etc.) and what it contains.
3. Equipment list by name in Portuguese AND English when possible (e.g. "passadeiras / ironing tables", "araras / clothing racks", "wet cleaning washer"). Match exact quantities visible in the LAYOUT.
4. Brand colors as hex codes extracted from logos/renders, brand name, where signage/logo appears.
5. Materials (floor, walls, counters, cabinetry, equipment finishes) and lighting/mood — sourced from the STYLE image.
6. NEGATIVE CONSTRAINTS: do NOT create a generic self-service laundromat / generic retail / generic restaurant; do NOT add a long row of identical machines along a back wall; do NOT invent equipment not visible in the layout image; do NOT move the facade to another side; do NOT remove support rooms; do NOT add people; do NOT include technical dimensions, red construction lines, title blocks, legends, stamps, sheet borders or callouts.
7. Final output requirement: clean white background, the entire space visible in one frame, crisp architectural presentation quality.

Return all results via the submit_analysis tool call. The image model will receive the reference pages in the EXACT order of reference_page_indices, so cite them as "Image 1", "Image 2"... in your prompt.`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "submit_analysis",
    description: "Submit the floorplan analysis and final image prompt.",
    parameters: {
      type: "object",
      properties: {
        classifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              page_index: { type: "integer" },
              category: {
                type: "string",
                enum: ["layout", "architecture", "sections", "style", "other"],
              },
              role: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["page_index", "category", "role", "confidence"],
            additionalProperties: false,
          },
        },
        reference_page_indices: {
          type: "array",
          items: { type: "integer" },
          description: "Up to 6 page indices to send as image references, in priority order.",
        },
        primary_category: { type: "string" },
        rooms_detected: { type: "integer" },
        equipment_detected: { type: "integer" },
        has_facade_style: { type: "boolean" },
        prompt_for_gpt_image_2: { type: "string" },
      },
      required: [
        "classifications",
        "reference_page_indices",
        "prompt_for_gpt_image_2",
      ],
      additionalProperties: false,
    },
  },
};

export async function analyzeFloorplan(
  lovableApiKey: string,
  pages: AnalyzerInput[],
  userExtra: string,
  viewMode: "isometric_aerial" | "frontal_interior" | "facade_exterior",
): Promise<FloorplanAnalysis> {
  const viewReminder = VIEW_REMINDERS[viewMode] ?? VIEW_REMINDERS.isometric_aerial;

  const userContent: Array<Record<string, unknown>> = [];
  pages.forEach((p, i) => {
    userContent.push({ type: "text", text: `Page index ${i}:` });
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${p.mime};base64,${p.b64}` },
    });
  });
  userContent.push({
    type: "text",
    text:
      `\nView mode requested by user: ${viewMode}. ${viewReminder}\n` +
      (userExtra
        ? `Additional style notes from end user (incorporate but do not let override layout/architecture references): ${userExtra}\n`
        : "") +
      `\nReturn the analysis via the submit_analysis tool call.`,
  });

  const body = {
    model: "openai/gpt-5.5",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: "function", function: { name: "submit_analysis" } },
  };

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 500);
    if (r.status === 429) throw new Error(`analyzer rate limit (429): ${t}`);
    if (r.status === 402) throw new Error(`analyzer créditos esgotados (402): ${t}`);
    throw new Error(`analyzer ${r.status}: ${t}`);
  }
  const json = await r.json();
  const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new Error("analyzer: sem tool_call");
  const parsed = JSON.parse(argsStr);

  const refsRaw: number[] = Array.isArray(parsed.reference_page_indices)
    ? parsed.reference_page_indices
    : [];
  const refs = refsRaw
    .filter((i) => Number.isInteger(i) && i >= 0 && i < pages.length)
    .slice(0, 6);
  if (refs.length === 0) {
    // Fallback: usa as primeiras 4 páginas
    for (let i = 0; i < Math.min(4, pages.length); i++) refs.push(i);
  }

  const cls: PageClassification[] = Array.isArray(parsed.classifications)
    ? parsed.classifications.filter(
        (c: PageClassification) => Number.isInteger(c.page_index),
      )
    : [];

  const promptFinal = String(parsed.prompt_for_gpt_image_2 ?? "").trim();
  if (!promptFinal) throw new Error("analyzer: prompt vazio");

  return {
    reference_page_indices: refs,
    prompt_for_gpt_image_2: promptFinal,
    classifications: cls,
    primary_category: parsed.primary_category ?? null,
    diagnostics: {
      rooms_detected: Number(parsed.rooms_detected ?? 0),
      equipment_detected: Number(parsed.equipment_detected ?? 0),
      has_facade_style: Boolean(parsed.has_facade_style),
    },
  };
}
