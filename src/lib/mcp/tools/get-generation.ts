import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_generation",
  title: "Detalhar geração",
  description:
    "Retorna os detalhes de uma geração do usuário, incluindo status, erro e URLs de saída.",
  inputSchema: { generation_id: z.string().describe("ID da geração.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ generation_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("generations")
      .select(
        "id, pipeline_type, status, engine, prompt, edit_instruction, progress_percent, progress_stage, error_message, cost_usd, thumbnail_url, final_render_url, video_url, glb_url, obj_url, fbx_url, created_at, completed_at",
      )
      .eq("id", generation_id)
      .maybeSingle();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return {
        content: [{ type: "text", text: "Geração não encontrada" }],
        isError: true,
      };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { generation: data },
    };
  },
});
