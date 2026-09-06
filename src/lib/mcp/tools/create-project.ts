import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_project",
  title: "Criar projeto",
  description: "Cria um novo projeto para o usuário autenticado.",
  inputSchema: {
    name: z.string().describe("Nome do projeto."),
    client_name: z.string().optional().describe("Nome do cliente."),
    briefing: z.string().optional().describe("Briefing do projeto."),
    deadline: z.string().optional().describe("Prazo em formato ISO (YYYY-MM-DD)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, client_name, briefing, deadline }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const trimmed = name.trim();
    if (!trimmed)
      return {
        content: [{ type: "text", text: "Nome do projeto é obrigatório" }],
        isError: true,
      };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: ctx.getUserId()!,
        name: trimmed,
        client_name: client_name ?? null,
        briefing: briefing ?? null,
        deadline: deadline ?? null,
      })
      .select("id, name, client_name, deadline, briefing, created_at")
      .single();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { project: data },
    };
  },
});
