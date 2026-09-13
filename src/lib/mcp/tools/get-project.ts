import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Detalhar projeto",
  description: "Retorna um projeto do usuário com os assets (gerações) vinculados a ele.",
  inputSchema: { project_id: z.string().describe("ID do projeto.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, name, client_name, deadline, briefing, created_at, updated_at")
      .eq("id", project_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!project)
      return {
        content: [{ type: "text", text: "Projeto não encontrado" }],
        isError: true,
      };

    const { data: links } = await supabase
      .from("project_assets")
      .select("generation_id, added_at")
      .eq("project_id", project_id);

    const ids = (links ?? []).map((l) => l.generation_id);
    let assets: unknown[] = [];
    if (ids.length) {
      const { data: gens } = await supabase
        .from("generations")
        .select(
          "id, pipeline_type, status, prompt, thumbnail_url, final_render_url, video_url, glb_url, created_at",
        )
        .in("id", ids);
      assets = gens ?? [];
    }

    const payload = { project, assets };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
