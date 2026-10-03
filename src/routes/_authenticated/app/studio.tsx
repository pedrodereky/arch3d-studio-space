import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  Play,
  Save,
  Plus,
  Loader2,
  Trash2,
  Upload,
  Library as LibraryIcon,
  Scissors,
  Layers,
  Sparkles,
  Maximize2,
  Shuffle,
  Download,
  X,
  FolderOpen,
  FilePlus,
  Copy,
  MoreVertical,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import { computeNodeHashes } from "@/lib/node-hash";
import { useStudioNodeCost, formatUsd } from "@/lib/pipeline-costs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StudioNode, type StudioNodeData } from "@/components/studio/StudioNode";
import { ExtractFurnitureDialog } from "@/components/studio/ExtractFurnitureDialog";
import { GerarVideoDialog } from "@/components/biblioteca/GerarVideoDialog";
import { OP_META, MODEL_OPTIONS, type StudioOp } from "@/lib/studio-models";

type StudioSearch = { fromGeneration?: string };

export const Route = createFileRoute("/_authenticated/app/studio")({
  validateSearch: (s: Record<string, unknown>): StudioSearch => ({
    fromGeneration: typeof s.fromGeneration === "string" ? s.fromGeneration : undefined,
  }),
  // A tela é um canvas de borda a borda; o shell entrega o `main` sem padding.
  staticData: { fullBleed: true },
  component: StudioPage,
});

const NODE_TYPES = { studio: StudioNode };
const DEFAULT_MODEL = "google/gemini-3.1-flash-image-preview";

const PALETTE: { op: StudioOp; icon: typeof Plus }[] = [
  { op: "image_upload", icon: Upload },
  { op: "library_pick", icon: LibraryIcon },
  { op: "remove_background", icon: Scissors },
  { op: "compose", icon: Layers },
  { op: "edit", icon: Sparkles },
  { op: "upscale", icon: Maximize2 },
  { op: "variations", icon: Shuffle },
  { op: "output", icon: Download },
];

type LibraryAsset = { id: string; url: string; path: string | null; label: string };

function extractOutputsPath(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(
      /\/storage\/v1\/object\/(?:sign|public|authenticated)\/outputs\/(.+)$/,
    );
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

// Templates prontos: estruturas iniciais para ajudar o usuário
type TemplateDef = {
  id: string;
  label: string;
  description: string;
  build: () => { nodes: Node<StudioNodeData>[]; edges: Edge[] };
};

function mkNode(
  op: StudioOp,
  x: number,
  y: number,
  extra: Partial<StudioNodeData> = {},
): Node<StudioNodeData> {
  const meta = OP_META[op];
  return {
    id: `${op}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    type: "studio",
    position: { x, y },
    data: {
      op,
      model: meta.isInput || meta.isOutput ? undefined : DEFAULT_MODEL,
      prompt: meta.needsPrompt ? "" : undefined,
      status: "idle",
      ...extra,
    },
  };
}

const TEMPLATES: TemplateDef[] = [
  {
    id: "insert_furniture_clean",
    label: "Inserir móvel sem fundo no ambiente",
    description: "Upload(móvel) → Remover fundo + Upload(sala) → Compor → Saída",
    build: () => {
      const item = mkNode("image_upload", 0, 0);
      const rb = mkNode("remove_background", 320, 0);
      const room = mkNode("image_upload", 0, 320);
      const compose = mkNode("compose", 640, 160, {
        prompt:
          "Coloque o objeto da primeira imagem dentro do ambiente da segunda, mantendo escala, perspectiva e iluminação realistas.",
      });
      const out = mkNode("output", 960, 160);
      return {
        nodes: [item, rb, room, compose, out],
        edges: [
          { id: `${item.id}-${rb.id}`, source: item.id, target: rb.id, animated: true },
          { id: `${rb.id}-${compose.id}`, source: rb.id, target: compose.id, animated: true },
          { id: `${room.id}-${compose.id}`, source: room.id, target: compose.id, animated: true },
          { id: `${compose.id}-${out.id}`, source: compose.id, target: out.id, animated: true },
        ],
      };
    },
  },
  {
    id: "insert_furniture",
    label: "Inserir móvel no ambiente",
    description: "Upload(sala) + Upload(móvel) → Compor → Saída",
    build: () => {
      const room = mkNode("image_upload", 0, 0);
      const item = mkNode("image_upload", 0, 320);
      const compose = mkNode("compose", 320, 160, {
        prompt:
          "Insira o móvel da segunda imagem no ambiente da primeira, mantendo iluminação, escala e perspectiva realistas.",
      });
      const out = mkNode("output", 640, 160);
      return {
        nodes: [room, item, compose, out],
        edges: [
          { id: `${room.id}-${compose.id}`, source: room.id, target: compose.id, animated: true },
          { id: `${item.id}-${compose.id}`, source: item.id, target: compose.id, animated: true },
          { id: `${compose.id}-${out.id}`, source: compose.id, target: out.id, animated: true },
        ],
      };
    },
  },
  {
    id: "remove_bg",
    label: "Remover fundo do produto",
    description: "Upload → Remover fundo → Saída",
    build: () => {
      const u = mkNode("image_upload", 0, 0);
      const rb = mkNode("remove_background", 320, 0);
      const out = mkNode("output", 640, 0);
      return {
        nodes: [u, rb, out],
        edges: [
          { id: `${u.id}-${rb.id}`, source: u.id, target: rb.id, animated: true },
          { id: `${rb.id}-${out.id}`, source: rb.id, target: out.id, animated: true },
        ],
      };
    },
  },
  {
    id: "edit_prompt",
    label: "Editar com prompt",
    description: "Upload → Editar → Saída",
    build: () => {
      const u = mkNode("image_upload", 0, 0);
      const ed = mkNode("edit", 320, 0, { prompt: "Descreva a edição desejada." });
      const out = mkNode("output", 640, 0);
      return {
        nodes: [u, ed, out],
        edges: [
          { id: `${u.id}-${ed.id}`, source: u.id, target: ed.id, animated: true },
          { id: `${ed.id}-${out.id}`, source: ed.id, target: out.id, animated: true },
        ],
      };
    },
  },
];

type NodeResultEntry = {
  url?: string;
  path?: string;
  mime?: string;
  ms?: number;
  error?: string;
  hash?: string;
};

function StudioPage() {
  return (
    <ReactFlowProvider>
      <StudioInner />
    </ReactFlowProvider>
  );
}

function StudioInner() {
  const { user } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [workflowName, setWorkflowName] = useState("Sem título");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  // `node_results` da última run e o custo que ela registrou. Antes essa
  // informação existia só dentro de runWorkflow e virava um toast que sumia —
  // ou seja, você só sabia o que seria reaproveitado depois de executar.
  const [lastRunResults, setLastRunResults] = useState<Record<string, NodeResultEntry>>({});
  const [lastRunCost, setLastRunCost] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const search = Route.useSearch();
  const { fromGeneration } = search;
  const importedRef = useRef<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryNodeId, setLibraryNodeId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryAsset[]>([]);
  const queryClient = useQueryClient();
  const { data: workflowList = [] } = useQuery({
    queryKey: qk.studioWorkflows(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_workflows")
        .select("id, name, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string; updated_at: string }[];
    },
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfRef = useRef<ReactFlowInstance<any, any> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTargetNode = useRef<string | null>(null);
  const nodesRef = useRef<Node<StudioNodeData>[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [furnitureDialogOpen, setFurnitureDialogOpen] = useState(false);
  const [publishingAction, setPublishingAction] = useState<string | null>(null);

  // Auto-import: chega de /app/gerar/redecorar com ?fromGeneration=<id>
  useEffect(() => {
    if (!user || !fromGeneration) return;
    if (importedRef.current === fromGeneration) return;
    if (nodes.length > 0) return;
    importedRef.current = fromGeneration;
    void (async () => {
      const { data, error } = await supabase
        .from("generations")
        .select("id,final_render_url,thumbnail_url")
        .eq("id", fromGeneration)
        .maybeSingle();
      if (error || !data) {
        toast.error("Não foi possível carregar a imagem de origem");
        return;
      }
      const url = data.final_render_url || data.thumbnail_url;
      if (!url) {
        toast.error("Geração de origem ainda sem imagem final");
        return;
      }
      const path = extractOutputsPath(url);
      const node = mkNode("image_upload", 80, 200, {
        signedUrl: url,
        storagePath: path ?? undefined,
        status: "done",
      });
      setNodes([node]);
      toast.success("Imagem carregada do resultado de Redecoração");
    })();
  }, [user, fromGeneration, nodes.length, setNodes]);

  // Salvar na biblioteca é a única publicação direta do nó. "Gerar 3D da cena"
  // saiu junto com o pipeline scene_to_3d, que o orchestrate descontinuou.
  const publishNode = useCallback(
    async (nodeId: string) => {
      if (!runId) {
        toast.error("Salve e execute o fluxo antes");
        return;
      }
      setPublishingAction("save_only");
      try {
        const { data, error } = await supabase.functions.invoke("studio-publish", {
          body: { runId, nodeId, action: "save_only" },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error ?? "falha");
        toast.success("Salvo na biblioteca", { description: "Aparece em /app/biblioteca." });
      } catch (e) {
        toast.error("Falha", { description: e instanceof Error ? e.message : "?" });
      } finally {
        setPublishingAction(null);
      }
    },
    [runId],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      // Validação: respeita o maxInputs do nó destino e dá dica para trocar para Compor.
      const targetNode = nodes.find((n) => n.id === c.target);
      if (!targetNode) {
        setEdges((eds) => addEdge({ ...c, animated: true }, eds));
        return;
      }
      const meta = OP_META[targetNode.data.op];
      const incoming = edges.filter((e) => e.target === c.target).length;
      if (meta.maxInputs > 0 && incoming >= meta.maxInputs) {
        if (meta.maxInputs === 1) {
          toast.error(
            `"${meta.label}" aceita apenas 1 imagem. Para combinar 2 imagens, use o nó "Compor / Inserir".`,
            {
              action: {
                label: "Trocar para Compor",
                onClick: () => {
                  setNodes((ns) =>
                    ns.map((n) =>
                      n.id === c.target
                        ? {
                            ...n,
                            data: {
                              ...n.data,
                              op: "compose",
                              prompt:
                                n.data.prompt ||
                                "Combine as imagens mantendo iluminação, escala e perspectiva realistas.",
                              model: n.data.model ?? DEFAULT_MODEL,
                            },
                          }
                        : n,
                    ),
                  );
                  setEdges((eds) => addEdge({ ...c, animated: true }, eds));
                },
              },
            },
          );
        } else {
          toast.error(`"${meta.label}" já atingiu o máximo de ${meta.maxInputs} entradas.`);
        }
        return;
      }
      setEdges((eds) => addEdge({ ...c, animated: true }, eds));
    },
    [nodes, edges, setEdges, setNodes],
  );

  const applyTemplate = useCallback(
    (tplId: string) => {
      const tpl = TEMPLATES.find((t) => t.id === tplId);
      if (!tpl) return;
      const { nodes: ns, edges: es } = tpl.build();
      setNodes(ns);
      setEdges(es);
      setSelectedNodeId(null);
      setTimeout(() => rfRef.current?.fitView({ padding: 0.2 }), 50);
      toast.success(`Template aplicado: ${tpl.label}`);
    },
    [setNodes, setEdges],
  );

  const addNode = useCallback(
    (op: StudioOp) => {
      const meta = OP_META[op];
      const id = `${op}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      // Posiciona à direita do nó selecionado para reforçar o fluxo esquerda→direita
      const selected = selectedNodeId
        ? (rfRef.current?.getNode(selectedNodeId) as Node<StudioNodeData> | undefined)
        : undefined;
      const basePos = selected
        ? { x: selected.position.x + 280, y: selected.position.y }
        : (rfRef.current?.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          }) ?? { x: 100, y: 100 });
      const node: Node<StudioNodeData> = {
        id,
        type: "studio",
        position: { x: basePos.x + Math.random() * 30, y: basePos.y + Math.random() * 30 },
        data: {
          op,
          model: meta.isInput || meta.isOutput ? undefined : DEFAULT_MODEL,
          prompt: meta.needsPrompt ? "" : undefined,
          status: "idle",
        },
      };
      setNodes((ns) => [...ns, node]);
      setSelectedNodeId(id);
    },
    [setNodes, selectedNodeId],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Partial<StudioNodeData>) => {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
    setEdges((es) => es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges]);

  // === Upload handler ===
  const handleFile = useCallback(
    async (file: File) => {
      if (!user || !fileTargetNode.current) return;
      const targetId = fileTargetNode.current;
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/studio/uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("inputs").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (error) {
        toast.error(`Falha no upload: ${error.message}`);
        return;
      }
      const { data: signed } = await supabase.storage
        .from("inputs")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      updateNodeData(targetId, {
        signedUrl: signed?.signedUrl,
        storagePath: `inputs/${path}`,
        status: "idle",
      });
      toast.success("Imagem carregada");
    },
    [user, updateNodeData],
  );

  // === Library picker ===
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const openLibrary = useCallback(async (nodeId: string) => {
    setLibraryNodeId(nodeId);
    setLibraryOpen(true);
    setLibrary([]);
    setLibraryError(null);
    setLibraryLoading(true);

    const { data, error } = await supabase
      .from("generations")
      .select("id, final_render_url, thumbnail_url, pipeline_type, prompt, created_at")
      .eq("status", "succeeded")
      .in("pipeline_type", ["floorplan_render", "direct", "edit", "enriched", "in_scene"])
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      setLibraryError(error.message);
      setLibraryLoading(false);
      return;
    }

    type Row = { id: string; rawUrl: string; path: string | null; label: string };
    const rows: Row[] = (data ?? [])
      .map((g) => {
        const rawUrl = (g.final_render_url ?? g.thumbnail_url) as string | null;
        if (!rawUrl) return null;
        return {
          id: g.id as string,
          rawUrl,
          path: extractOutputsPath(rawUrl),
          label: (g.prompt as string | null) ?? (g.pipeline_type as string),
        };
      })
      .filter((x): x is Row => x !== null);

    const paths = Array.from(new Set(rows.map((r) => r.path).filter((p): p is string => !!p)));
    const signedMap = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("outputs")
        .createSignedUrls(paths, 60 * 60 * 24 * 7);
      if (signErr) {
        setLibraryError(`Não foi possível assinar as imagens: ${signErr.message}`);
      }
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl && !s.error) signedMap.set(s.path, s.signedUrl);
      }
    }

    const items: LibraryAsset[] = rows
      .map((r) => {
        const url = r.path ? signedMap.get(r.path) : null;
        if (!url) return null;
        return { id: r.id, url, path: r.path, label: r.label };
      })
      .filter((x): x is LibraryAsset => x !== null);

    setLibrary(items);
    setLibraryLoading(false);
  }, []);

  const pickLibraryAsset = useCallback(
    (asset: LibraryAsset) => {
      if (!libraryNodeId) return;
      updateNodeData(libraryNodeId, {
        signedUrl: asset.url,
        storagePath: asset.path ? `outputs/${asset.path}` : asset.url,
      });
      setLibraryOpen(false);
      setLibraryNodeId(null);
    },
    [libraryNodeId, updateNodeData],
  );

  // === Save / Load ===
  const refreshWorkflowList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.studioWorkflows(user?.id) }),
    [queryClient, user?.id],
  );

  const saveWorkflow = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    const graph = {
      nodes,
      edges,
      viewport: rfRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
    } as unknown as Record<string, unknown>;
    if (workflowId) {
      const { error } = await supabase
        .from("studio_workflows")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ name: workflowName, graph: graph as any })
        .eq("id", workflowId);
      if (error) toast.error(error.message);
      else toast.success("Workflow salvo");
    } else {
      const { data, error } = await supabase
        .from("studio_workflows")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ user_id: user.id, name: workflowName, graph: graph as any })
        .select("id")
        .single();
      if (error) toast.error(error.message);
      else if (data) {
        setWorkflowId(data.id);
        toast.success("Workflow salvo");
      }
    }
    setSaving(false);
    void refreshWorkflowList();
  }, [user, nodes, edges, workflowName, workflowId, refreshWorkflowList]);

  const loadWorkflow = useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from("studio_workflows")
        .select("id, name, graph, last_run_id")
        .eq("id", id)
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Workflow não encontrado");
        return;
      }
      const g = (data.graph ?? {}) as {
        nodes?: Node<StudioNodeData>[];
        edges?: Edge[];
        viewport?: { x: number; y: number; zoom: number };
      };
      setWorkflowId(data.id);
      setWorkflowName(data.name);

      // Tenta hidratar resultados da última run para permitir continuar de onde parou.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastRunId = (data as any).last_run_id as string | null;
      let nodeResults: Record<string, NodeResultEntry> = {};
      if (lastRunId) {
        const { data: run } = await supabase
          .from("studio_runs")
          .select("id, node_results, cost_usd")
          .eq("id", lastRunId)
          .maybeSingle();
        if (run) {
          nodeResults = (run.node_results as Record<string, NodeResultEntry>) ?? {};
          setRunId(run.id);
          setLastRunCost(run.cost_usd ?? null);
        } else {
          setRunId(null);
          setLastRunCost(null);
        }
      } else {
        setRunId(null);
        setLastRunCost(null);
      }
      setLastRunResults(nodeResults);

      setNodes(
        (g.nodes ?? []).map((n) => {
          const r = nodeResults[n.id];
          if (r?.url) {
            return {
              ...n,
              data: {
                ...n.data,
                status: "done" as const,
                resultUrl: r.url,
                errorMessage: undefined,
              },
            };
          }
          return {
            ...n,
            data: {
              ...n.data,
              status: "idle" as const,
              resultUrl: undefined,
              errorMessage: undefined,
            },
          };
        }),
      );
      setEdges(g.edges ?? []);
      setSelectedNodeId(null);
      if (g.viewport) {
        setTimeout(() => rfRef.current?.setViewport(g.viewport!), 50);
      }
    },
    [setNodes, setEdges],
  );

  const newWorkflow = useCallback(() => {
    setWorkflowId(null);
    setWorkflowName("Sem título");
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setRunId(null);
    setLastRunResults({});
    setLastRunCost(null);
  }, [setNodes, setEdges]);

  const duplicateWorkflow = useCallback(async () => {
    if (!user) return;
    const graph = {
      nodes,
      edges,
      viewport: rfRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
    } as unknown as Record<string, unknown>;
    const { data, error } = await supabase
      .from("studio_workflows")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: user.id, name: `${workflowName} (cópia)`, graph: graph as any })
      .select("id, name")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Falha ao duplicar");
      return;
    }
    setWorkflowId(data.id);
    setWorkflowName(data.name);
    toast.success("Workflow duplicado");
    void refreshWorkflowList();
  }, [user, nodes, edges, workflowName, refreshWorkflowList]);

  const deleteWorkflow = useCallback(async () => {
    if (!workflowId) return;
    const { error } = await supabase.from("studio_workflows").delete().eq("id", workflowId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Workflow excluído");
    setConfirmDelete(false);
    newWorkflow();
    void refreshWorkflowList();
  }, [workflowId, newWorkflow, refreshWorkflowList]);

  // === Run ===
  const runWorkflow = useCallback(async () => {
    if (!user) return;
    if (nodes.length === 0) {
      toast.error("Adicione nós ao canvas primeiro");
      return;
    }
    const outputNode = nodes.find((n) => n.data.op === "output");
    if (!outputNode) {
      toast.error("Adicione um nó de Saída para definir o resultado final");
      return;
    }
    // Validação de conexões antes de chamar o backend
    for (const n of nodes) {
      const meta = OP_META[n.data.op];
      const incoming = edges.filter((e) => e.target === n.id).length;
      if (meta.minInputs > 0 && incoming < meta.minInputs) {
        toast.error(`"${meta.label}" precisa de ${meta.minInputs} entrada(s) conectada(s).`);
        return;
      }
      if (meta.isInput && !n.data.signedUrl && !n.data.storagePath) {
        toast.error(`"${meta.label}" sem imagem selecionada.`);
        return;
      }
      if (meta.needsPrompt && !(n.data.prompt ?? "").trim()) {
        toast.error(`"${meta.label}" precisa de uma instrução.`);
        return;
      }
    }

    setRunning(true);

    // Calcula hashes atuais e tenta reaproveitar resultados da run anterior.
    const currentHashes = computeNodeHashes(nodes, edges);
    let reusedResults: Record<string, NodeResultEntry> = {};
    let effectiveRunId: string | null = null;

    if (runId) {
      const { data: prevRun } = await supabase
        .from("studio_runs")
        .select("id, node_results")
        .eq("id", runId)
        .maybeSingle();
      if (prevRun) {
        const prev = (prevRun.node_results as Record<string, NodeResultEntry>) ?? {};
        // Mantém apenas entradas cujo hash bate com o atual e que têm url (resultado válido).
        const valid: Record<string, NodeResultEntry> = {};
        for (const [nid, entry] of Object.entries(prev)) {
          if (entry?.url && entry.hash && entry.hash === currentHashes[nid]) {
            valid[nid] = { ...entry, hash: currentHashes[nid] };
          }
        }
        reusedResults = valid;
        effectiveRunId = prevRun.id;
        setLastRunResults(valid);
      }
    }

    // Estado visual: nós com resultado reaproveitado já aparecem como "done";
    // os demais voltam para "idle" e serão processados.
    setNodes((ns) =>
      ns.map((n) => {
        const r = reusedResults[n.id];
        return r?.url
          ? {
              ...n,
              data: {
                ...n.data,
                status: "done" as const,
                resultUrl: r.url,
                errorMessage: undefined,
              },
            }
          : {
              ...n,
              data: {
                ...n.data,
                status: "idle" as const,
                resultUrl: undefined,
                errorMessage: undefined,
              },
            };
      }),
    );

    const graph = { nodes, edges, viewport: rfRef.current?.getViewport() } as unknown as Record<
      string,
      unknown
    >;

    if (effectiveRunId) {
      const { error: updErr } = await supabase
        .from("studio_runs")
        .update({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graph: graph as any,
          node_results: reusedResults,
          status: "queued",
          error_message: null,
          completed_at: null,
          final_output_url: null,
          final_output_path: null,
          current_node: null,
          progress_percent: 0,
        })
        .eq("id", effectiveRunId);
      if (updErr) {
        toast.error(`Falha ao reaproveitar run: ${updErr.message}`);
        setRunning(false);
        return;
      }
      const reusedCount = Object.keys(reusedResults).length;
      if (reusedCount > 0) {
        toast.message(`Continuando: ${reusedCount} nó(s) reaproveitado(s).`);
      }
    } else {
      // Primeira execução do workflow (ou run anterior perdida): cria nova run.
      const { data: runRow, error: runErr } = await supabase
        .from("studio_runs")
        .insert({
          user_id: user.id,
          workflow_id: workflowId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graph: graph as any,
          status: "queued",
          node_results: {},
        })
        .select("id")
        .single();
      if (runErr || !runRow) {
        toast.error(`Falha ao criar run: ${runErr?.message}`);
        setRunning(false);
        return;
      }
      effectiveRunId = runRow.id;
      if (workflowId) {
        await supabase
          .from("studio_workflows")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ last_run_id: effectiveRunId } as any)
          .eq("id", workflowId);
      }
    }
    setRunId(effectiveRunId);

    // Loop de steps: cada chamada agenda 1 nó (background) e nós pesados rodam fora do request.
    const MAX_STEPS = nodes.length + 4;
    for (let step = 0; step < MAX_STEPS; step++) {
      const { data, error } = await supabase.functions.invoke("studio-execute", {
        body: { runId: effectiveRunId },
      });
      if (error) {
        toast.error(`Execução falhou: ${error.message}`);
        setRunning(false);
        return;
      }
      const res = data as {
        ok: boolean;
        done: boolean;
        status: string;
        error?: string;
        finalUrl?: string;
        processedNodeId?: string;
        scheduled?: boolean;
        inFlight?: boolean;
      };
      if (!res.ok || res.status === "failed") {
        toast.error(res.error ?? "Execução falhou");
        setRunning(false);
        return;
      }
      if (res.done) return;

      // Aguarda o nó em background terminar antes de pedir o próximo.
      const target = res.processedNodeId;
      if (target) {
        const MAX_WAIT_MS = 8 * 60_000;
        const t0 = Date.now();
        while (true) {
          await new Promise((r) => setTimeout(r, 2000));
          const { data: r } = await supabase
            .from("studio_runs")
            .select("status,node_results,error_message,final_output_url")
            .eq("id", effectiveRunId)
            .single();
          if (!r) break;
          if (r.status === "failed") {
            toast.error(r.error_message ?? "Execução falhou");
            setRunning(false);
            return;
          }
          if (r.status === "succeeded") return;
          const nr = (r.node_results as Record<string, { url?: string; error?: string }> | null)?.[
            target
          ];
          if (nr?.url || nr?.error) break;
          if (Date.now() - t0 > MAX_WAIT_MS) {
            toast.error("Tempo esgotado aguardando o nó.");
            setRunning(false);
            return;
          }
        }
      }
    }
    setRunning(false);
    // runId precisa estar aqui: runWorkflow o lê para decidir se reaproveita os
    // resultados da execução anterior. Sem a dependência, o callback memorizado
    // continua enxergando o runId de antes — e uma segunda execução sem edição
    // nenhuma cairia no ramo "primeira run", criando uma run nova em vez de
    // reaproveitar. Ou seja: o usuário pagaria de novo por nós que não mudaram.
    //
    // Hoje isso não dispara porque todo setRunId do arquivo vem acompanhado de
    // um setNodes, que recria o callback. É correção por acidente: basta alguém
    // acrescentar um caminho que mexa no runId sem tocar nos nós.
  }, [user, nodes, edges, workflowId, setNodes, runId]);

  // === Retry de um nó específico ===
  const retryNode = useCallback(
    async (nodeId: string) => {
      if (!runId) {
        toast.error("Nenhuma execução para reaproveitar — rode o fluxo primeiro.");
        return;
      }
      setRunning(true);
      // Limpa visualmente o nó alvo + descendentes
      const desc = new Set<string>([nodeId]);
      const adj = new Map<string, string[]>();
      for (const n of nodes) adj.set(n.id, []);
      for (const e of edges) adj.get(e.source)?.push(e.target);
      const stack = [nodeId];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const nxt of adj.get(cur) ?? []) {
          if (!desc.has(nxt)) {
            desc.add(nxt);
            stack.push(nxt);
          }
        }
      }
      setNodes((ns) =>
        ns.map((n) =>
          desc.has(n.id)
            ? {
                ...n,
                data: { ...n.data, status: "idle", resultUrl: undefined, errorMessage: undefined },
              }
            : n,
        ),
      );

      const MAX_STEPS = nodes.length + 4;
      for (let step = 0; step < MAX_STEPS; step++) {
        const { data, error } = await supabase.functions.invoke("studio-execute", {
          body: { runId, retryNodeId: step === 0 ? nodeId : undefined },
        });
        if (error) {
          toast.error(`Retry falhou: ${error.message}`);
          setRunning(false);
          return;
        }
        const res = data as {
          ok: boolean;
          done: boolean;
          status: string;
          error?: string;
          processedNodeId?: string;
        };
        if (!res.ok || res.status === "failed") {
          toast.error(res.error ?? "Retry falhou");
          setRunning(false);
          return;
        }
        if (res.done) return;

        const target = res.processedNodeId;
        if (target) {
          const MAX_WAIT_MS = 8 * 60_000;
          const t0 = Date.now();
          while (true) {
            await new Promise((r) => setTimeout(r, 2000));
            const { data: r } = await supabase
              .from("studio_runs")
              .select("status,node_results,error_message")
              .eq("id", runId)
              .single();
            if (!r) break;
            if (r.status === "failed") {
              toast.error(r.error_message ?? "Retry falhou");
              setRunning(false);
              return;
            }
            if (r.status === "succeeded") return;
            const nr = (
              r.node_results as Record<string, { url?: string; error?: string }> | null
            )?.[target];
            if (nr?.url || nr?.error) break;
            if (Date.now() - t0 > MAX_WAIT_MS) {
              toast.error("Tempo esgotado aguardando o nó.");
              setRunning(false);
              return;
            }
          }
        }
      }
      setRunning(false);
    },
    [runId, nodes, edges, setNodes],
  );

  // === Realtime updates de runs ===
  useEffect(() => {
    if (!runId) return;
    const ch = supabase
      .channel(`studio-run-${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "studio_runs", filter: `id=eq.${runId}` },
        (payload) => {
          const row = payload.new as {
            status: string;
            node_results: Record<string, { url?: string; error?: string }>;
            current_node: string | null;
            final_output_url: string | null;
            error_message: string | null;
            cost_usd: number | null;
          };
          setNodes((ns) =>
            ns.map((n) => {
              const res = row.node_results?.[n.id];
              if (!res) {
                return n.id === row.current_node
                  ? { ...n, data: { ...n.data, status: "running" } }
                  : n;
              }
              return {
                ...n,
                data: {
                  ...n.data,
                  status: res.error ? "error" : "done",
                  resultUrl: res.url,
                  errorMessage: res.error,
                },
              };
            }),
          );
          if (row.status === "succeeded") {
            setRunning(false);
            toast.success("Execução concluída");
            // Patch hashes em node_results para que a próxima execução possa reaproveitar.
            void (async () => {
              const hashes = computeNodeHashes(nodesRef.current, edgesRef.current);
              const patched: Record<string, NodeResultEntry> = {};
              for (const [nid, entry] of Object.entries(row.node_results ?? {})) {
                patched[nid] = { ...(entry as NodeResultEntry), hash: hashes[nid] };
              }
              setLastRunResults(patched);
              await supabase.from("studio_runs").update({ node_results: patched }).eq("id", runId);
            })();
            setLastRunCost(row.cost_usd ?? null);
          } else if (row.status === "failed") {
            setRunning(false);
            toast.error(row.error_message ?? "Execução falhou");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [runId, setNodes]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  // Mesmo predicado que runWorkflow usa para decidir o que reaproveitar — se
  // divergirem, o painel mente. Por isso a condição está escrita igual.
  const reuse = useMemo(() => {
    if (nodes.length === 0) return { reusable: 0, total: 0 };
    const hashes = computeNodeHashes(nodes, edges);
    const reusable = nodes.filter((n) => {
      const entry = lastRunResults[n.id];
      return !!entry?.url && !!entry.hash && entry.hash === hashes[n.id];
    }).length;
    return { reusable, total: nodes.length };
  }, [nodes, edges, lastRunResults]);

  const { data: nodeCost } = useStudioNodeCost(user?.id);

  // O que vai ser cobrado é o que vai ser processado — não o fluxo inteiro.
  const toProcess = Math.max(reuse.total - reuse.reusable, 0);
  const estimate = nodeCost && toProcess > 0 ? nodeCost.median * toProcess : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FolderOpen className="h-3.5 w-3.5" />
              Abrir
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Workflows salvos</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workflowList.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                Nenhum workflow salvo ainda.
              </div>
            ) : (
              workflowList.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => loadWorkflow(w.id)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-sm">{w.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(w.updated_at).toLocaleString("pt-BR")}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={newWorkflow}>
          <FilePlus className="h-3.5 w-3.5" />
          Novo
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Sparkles className="h-3.5 w-3.5" />
              Templates
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuLabel>Comece com um exemplo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TEMPLATES.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onClick={() => applyTemplate(t.id)}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-[10px] text-muted-foreground">{t.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="h-8 max-w-xs text-sm"
          placeholder="Nome do workflow"
        />
        {workflowId && <span className="text-[10px] text-muted-foreground">salvo</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={saveWorkflow} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Salvar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={duplicateWorkflow}>
                <Copy className="h-3.5 w-3.5" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmDelete(true)}
                disabled={!workflowId}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={runWorkflow} disabled={running}>
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Executar
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove “{workflowName}” permanentemente. As execuções já realizadas serão
              preservadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteWorkflow}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-1 overflow-hidden">
        {/* Palette */}
        <div className="w-52 shrink-0 overflow-y-auto border-r border-border bg-card p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Nós
          </p>
          <div className="space-y-1">
            {PALETTE.map(({ op, icon: Icon }) => (
              <button
                key={op}
                onClick={() => addNode(op)}
                title={OP_META[op].description}
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:border-border hover:bg-muted"
              >
                <Icon className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
                <span>{OP_META[op].label}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 rounded-md bg-muted/50 p-2 text-[10px] leading-relaxed text-muted-foreground">
            Conecte arrastando da bolinha <span className="font-bold">direita</span> de um nó até a
            bolinha <span className="font-bold">esquerda</span> de outro.
          </p>
        </div>

        {/* Canvas */}
        <div className="relative flex-1">
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8">
              <div className="pointer-events-auto max-w-md rounded-lg border border-dashed border-border bg-card/95 p-6 text-center shadow-sm">
                <p className="mb-2 text-sm font-bold uppercase tracking-wide">Comece um fluxo</p>
                <p className="mb-4 text-xs text-muted-foreground">
                  Use um template pronto ou monte seu fluxo arrastando nós da paleta à esquerda.
                </p>
                <Button size="sm" onClick={() => applyTemplate("insert_furniture_clean")}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Inserir móvel no ambiente
                </Button>
              </div>
            </div>
          )}
          {nodes.length > 0 &&
            (() => {
              // detecta nós soltos: nó que não é input nem output e não tem nenhuma conexão
              const isolated = nodes.filter((n) => {
                const meta = OP_META[n.data.op];
                const hasIncoming = edges.some((e) => e.target === n.id);
                const hasOutgoing = edges.some((e) => e.source === n.id);
                if (meta.isInput) return !hasOutgoing;
                if (meta.isOutput) return !hasIncoming;
                return !hasIncoming && !hasOutgoing;
              });
              if (isolated.length === 0) return null;
              return (
                <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
                  <div className="pointer-events-auto rounded-md border border-amber-400/60 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800 shadow-sm dark:bg-amber-950/40 dark:text-amber-200">
                    {isolated.length} nó{isolated.length > 1 ? "s" : ""} sem conexão. Arraste da
                    bolinha direita até a esquerda do próximo nó.
                  </div>
                </div>
              );
            })()}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(inst) => (rfRef.current = inst)}
            onNodeClick={(_e, n) => setSelectedNodeId(n.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls />
            <MiniMap pannable zoomable className="!bg-card !border !border-border" />
          </ReactFlow>
        </div>

        {/* Painel lateral — sempre presente, para que custo e reuso não
            dependam de haver um nó selecionado. */}
        <aside className="flex w-[318px] shrink-0 flex-col border-l border-border/60 bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {selectedNode ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide">
                    {OP_META[selectedNode.data.op].label}
                  </p>
                  <button
                    onClick={deleteSelected}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover nó"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Inputs */}
                {selectedNode.data.op === "image_upload" && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        fileTargetNode.current = selectedNode.id;
                        fileRef.current?.click();
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" /> Escolher arquivo
                    </Button>
                    {selectedNode.data.signedUrl && (
                      <img src={selectedNode.data.signedUrl} alt="" className="w-full rounded-md" />
                    )}
                  </div>
                )}

                {selectedNode.data.op === "library_pick" && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openLibrary(selectedNode.id)}
                    >
                      <LibraryIcon className="h-3.5 w-3.5" /> Escolher da biblioteca
                    </Button>
                    {selectedNode.data.signedUrl && (
                      <img src={selectedNode.data.signedUrl} alt="" className="w-full rounded-md" />
                    )}
                  </div>
                )}

                {/* Modelo (operações) */}
                {!OP_META[selectedNode.data.op].isInput &&
                  !OP_META[selectedNode.data.op].isOutput && (
                    <div className="mb-3">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Modelo
                      </label>
                      <Select
                        value={selectedNode.data.model ?? DEFAULT_MODEL}
                        onValueChange={(v) => updateNodeData(selectedNode.id, { model: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MODEL_OPTIONS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex flex-col">
                                <span>{m.label}</span>
                                <span className="text-[10px] text-muted-foreground">{m.hint}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                {/* Prompt */}
                {OP_META[selectedNode.data.op].needsPrompt && (
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Instrução
                    </label>
                    {selectedNode.data.op === "compose" && (
                      <div className="mb-2 rounded-md border border-border bg-muted/40 p-2 text-[10px] leading-relaxed text-muted-foreground">
                        <span className="font-bold uppercase tracking-wide">Ordem importa:</span> a
                        primeira aresta conectada vira <span className="font-bold">imagem 1</span>,
                        a segunda vira <span className="font-bold">imagem 2</span>, e assim por
                        diante. Use essa numeração no prompt.
                      </div>
                    )}
                    <Textarea
                      rows={5}
                      className="text-xs"
                      placeholder={
                        selectedNode.data.op === "compose"
                          ? "Ex.: Insira o sofá da imagem 1 nesta sala da imagem 2, mantendo iluminação e perspectiva."
                          : "Descreva a edição"
                      }
                      value={selectedNode.data.prompt ?? ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { prompt: e.target.value })}
                    />
                  </div>
                )}

                {selectedNode.data.resultUrl && (
                  <div className="mt-4 space-y-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Resultado
                    </p>
                    <img src={selectedNode.data.resultUrl} alt="" className="w-full rounded-md" />
                    <a
                      href={selectedNode.data.resultUrl}
                      download
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <Download className="h-3 w-3" /> Baixar
                    </a>

                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Usar este resultado
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start"
                          onClick={() => publishNode(selectedNode.id)}
                          disabled={publishingAction !== null || !runId}
                        >
                          {publishingAction === "save_only" ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <LibraryIcon className="mr-2 h-3 w-3" />
                          )}
                          Salvar na biblioteca
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start"
                          onClick={() => setVideoDialogOpen(true)}
                          disabled={publishingAction !== null || !runId}
                        >
                          <Sparkles className="mr-2 h-3 w-3" />
                          Gerar vídeo POV
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start"
                          onClick={() => setFurnitureDialogOpen(true)}
                          disabled={publishingAction !== null || !runId}
                        >
                          <Shuffle className="mr-2 h-3 w-3" />
                          Extrair móveis 3D
                        </Button>
                      </div>
                      {!runId && (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Salve o fluxo e execute para habilitar.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {selectedNode.data.errorMessage && (
                  <div className="mt-3 space-y-2">
                    <p className="rounded-md bg-destructive/10 px-2 py-2 text-xs text-destructive">
                      {selectedNode.data.errorMessage}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => retryNode(selectedNode.id)}
                      disabled={running}
                    >
                      {running ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>Tentar de novo este nó</>
                      )}
                    </Button>
                  </div>
                )}

                {!selectedNode.data.errorMessage &&
                  selectedNode.data.resultUrl &&
                  runId &&
                  !OP_META[selectedNode.data.op].isInput && (
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => retryNode(selectedNode.id)}
                        disabled={running}
                      >
                        {running ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>Executar a partir deste nó</>
                        )}
                      </Button>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Reprocessa este nó e os seguintes, mantendo os anteriores.
                      </p>
                    </div>
                  )}
              </>
            ) : (
              <div className="px-1 py-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Nó selecionado
                </p>
                <p className="mt-2.5 text-[12px] font-light leading-relaxed text-muted-foreground">
                  Clique em um nó do fluxo para editar modelo, instrução e ver o resultado.
                </p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border/60 p-5">
            {reuse.reusable > 0 && (
              <div className="mb-4 rounded-lg bg-emerald-600/10 p-3.5">
                <p className="text-[11.5px] font-semibold text-emerald-800">
                  {reuse.reusable} de {reuse.total}{" "}
                  {reuse.reusable === 1 ? "nó reaproveitado" : "nós reaproveitados"}
                </p>
                <p className="mt-1.5 text-[11px] font-light leading-relaxed text-emerald-800/80">
                  Só o que você mudou será reprocessado na próxima execução.
                </p>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-[12px] font-light text-muted-foreground">
                Custo estimado
                {estimate !== null && (
                  <span className="ml-1.5 text-[11px] opacity-70">
                    ({toProcess} {toProcess === 1 ? "nó" : "nós"})
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-foreground">
                {formatUsd(estimate)}
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-light text-muted-foreground">Última execução</span>
              <span className="shrink-0 text-[12px] font-light text-muted-foreground">
                {formatUsd(lastRunCost)}
              </span>
            </div>
            {estimate === null && reuse.total > 0 && (
              <p className="mt-2.5 text-[11px] font-light leading-relaxed text-muted-foreground">
                A estimativa aparece depois da primeira execução concluída — ela é medida do que
                você já pagou por nó, não tabelada.
              </p>
            )}
          </div>
        </aside>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>Escolher da biblioteca</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-3 gap-2 overflow-y-auto">
            {libraryLoading && (
              <div className="col-span-3 flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!libraryLoading && libraryError && (
              <p className="col-span-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {libraryError}
              </p>
            )}
            {!libraryLoading &&
              library.map((a) => (
                <button
                  key={a.id}
                  onClick={() => pickLibraryAsset(a)}
                  className="aspect-square overflow-hidden rounded-md border border-border bg-muted hover:border-accent"
                  title={a.label}
                >
                  <img
                    src={a.url}
                    alt={a.label}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            {!libraryLoading && !libraryError && library.length === 0 && (
              <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                Nenhum asset na biblioteca ainda.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <GerarVideoDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        sourceGenerationId={runId ?? ""}
        sourceRenderUrl={selectedNode?.data.resultUrl ?? null}
      />

      <ExtractFurnitureDialog
        open={furnitureDialogOpen}
        onOpenChange={setFurnitureDialogOpen}
        runId={runId}
        nodeId={selectedNodeId}
      />
    </div>
  );
}
