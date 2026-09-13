import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_generations",
  title: "Listar gerações",
  description:
    "Lista as gerações da biblioteca do usuário (renders, vídeos, 3D), com filtros de pipeline e status.",
  inputSchema: {
    limit: z.number().int().optional().describe("Máximo de itens (padrão 20)."),
    pipeline_type: z
      .string()
      .optional()
      .describe("Filtra pelo tipo de pipeline (ex.: floorplan_render, redecorate, text_to_3d)."),
    status: z
      .string()
      .optional()
      .describe("Filtra pelo status (ex.: pending, processing, completed, failed)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, pipeline_type, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("generations")
      .select(
        "id, pipeline_type, status, engine, prompt, progress_percent, thumbnail_url, final_render_url, video_url, glb_url, created_at, completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    if (pipeline_type) query = query.eq("pipeline_type", pipeline_type);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { generations: data ?? [] },
    };
  },
});
