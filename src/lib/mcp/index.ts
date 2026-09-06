import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import getProject from "./tools/get-project";
import createProject from "./tools/create-project";
import listGenerations from "./tools/list-generations";
import getGeneration from "./tools/get-generation";

// O issuer OAuth precisa ser o host direto do Supabase (o proxy publicado é rejeitado).
const projectRef =
  import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "arq3d-studio",
  title: "Arq3D Studio",
  version: "0.1.0",
  instructions:
    "Ferramentas do Arq3D Studio. Use `list_projects` e `get_project` para consultar projetos do usuário, `create_project` para criar um novo, e `list_generations`/`get_generation` para consultar a biblioteca de renders, vídeos e modelos 3D.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjects, getProject, createProject, listGenerations, getGeneration],
});
