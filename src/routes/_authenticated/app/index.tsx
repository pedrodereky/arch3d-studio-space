import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  FolderOpen,
  Library,
  Map,
  ArrowRight,
  Loader2,
  Workflow,
  Wand2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FreshImg } from "@/components/library/FreshMedia";
import { pipelineLabel } from "@/lib/pipeline-labels";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/")({
  component: DashboardPage,
});

type RecentGen = {
  id: string;
  pipeline_type: string;
  status: string;
  thumbnail_url: string | null;
  final_render_url: string | null;
  prompt: string | null;
  created_at: string;
};

type RecentProject = {
  id: string;
  name: string;
  client_name: string | null;
};

type LastRun = {
  id: string;
  workflow_id: string | null;
  status: string;
  updated_at: string;
};

function DashboardPage() {
  const { user, profile } = useAuth();

  const { data, isPending, error } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const [gensRes, projectsRes, monthRes, runRes] = await Promise.all([
        supabase
          .from("generations")
          .select("id, pipeline_type, status, thumbnail_url, final_render_url, prompt, created_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("projects")
          .select("id, name, client_name")
          .eq("user_id", user!.id)
          .order("updated_at", { ascending: false })
          .limit(4),
        supabase
          .from("generations")
          .select("cost_usd", { count: "exact" })
          .eq("user_id", user!.id)
          .eq("status", "succeeded")
          .gte("created_at", since.toISOString()),
        supabase
          .from("studio_runs")
          .select("id, workflow_id, status, updated_at")
          .eq("user_id", user!.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Erro deixa de ser engolido: antes qualquer falha virava zeros na tela,
      // indistinguível de uma conta sem uso nenhum.
      const failure = gensRes.error ?? projectsRes.error ?? monthRes.error ?? runRes.error;
      if (failure) throw new Error(failure.message);

      return {
        gens: (gensRes.data ?? []) as RecentGen[],
        projects: (projectsRes.data ?? []) as RecentProject[],
        monthCost: (monthRes.data ?? []).reduce(
          (acc, r) => acc + Number((r as { cost_usd: number | null }).cost_usd ?? 0),
          0,
        ),
        monthCount: monthRes.count ?? 0,
        lastRun: (runRes.data as LastRun | null) ?? null,
      };
    },
  });

  const gens = data?.gens ?? [];
  const projects = data?.projects ?? [];
  const monthCost = data?.monthCost ?? null;
  const monthCount = data?.monthCount ?? 0;
  const lastRun = data?.lastRun ?? null;
  const loading = isPending;

  const firstName = profile?.full_name?.split(" ")[0] ?? "arquiteto";

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <header className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[34px] font-black leading-[1.1] tracking-tight text-foreground">
            Olá, {firstName}
          </h1>
          <p className="mt-2 font-light text-muted-foreground">
            Bem-vindo ao Arq3D Studio. Aqui está um resumo da sua conta.
          </p>
        </div>
        {/* Números como tipografia, separados por fio — não como caixas. */}
        <dl className="flex shrink-0 gap-8">
          <Stat label="Gerações" value={String(profile?.total_generations ?? 0)} />
          <Divider />
          <Stat label="30 dias" value={String(monthCount)} />
          <Divider />
          <Stat label="Custo" value={monthCost === null ? "—" : `$ ${monthCost.toFixed(2)}`} />
        </dl>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-bold text-foreground">Não foi possível carregar o resumo</p>
            <p className="mt-1 text-sm font-light text-muted-foreground">{error.message}</p>
          </div>
        </div>
      )}

      {/* Continuar de onde parou */}
      {lastRun && (
        <Link
          to="/app/studio"
          className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 p-5 transition-colors hover:bg-accent/10"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Workflow className="h-[22px] w-[22px]" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Continuar de onde parou</h3>
              <p className="text-sm font-light text-muted-foreground">
                Última execução no Studio: {new Date(lastRun.updated_at).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      {/* Atalhos */}
      <section>
        <h2 className="text-xl font-black tracking-tight text-foreground">Comece por aqui</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: Wand2,
              title: "Redecorar ambiente",
              desc: "Foto real → 4 propostas em 20s.",
              to: "/app/gerar/redecorar",
              badge: "Novo",
            },
            {
              icon: Sparkles,
              title: "Gerar objeto 3D",
              desc: "Sobe uma foto ou descreve.",
              to: "/app/gerar",
            },
            {
              icon: Map,
              title: "Render de planta",
              desc: "Planta 2D vira render 3D.",
              to: "/app/gerar/planta",
            },
            {
              icon: FolderOpen,
              title: "Projetos",
              desc: "Agrupe por cliente.",
              to: "/app/projetos",
            },
          ].map((c) => (
            <Link
              key={c.title}
              to={c.to}
              className="group flex items-start gap-4 rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/30"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <c.icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground">{c.title}</h3>
                  {"badge" in c && c.badge && (
                    <span className="rounded-[4px] bg-emerald-600/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                      {c.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-light text-muted-foreground">{c.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      {/* Trabalho recente */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Trabalho recente
          </span>
          <Link
            to="/app/biblioteca"
            className="text-[11px] font-medium text-accent-foreground hover:text-foreground"
          >
            Ver biblioteca
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : gens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
            <p className="text-sm font-light text-muted-foreground">
              Quando você gerar seu primeiro modelo, ele aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {gens.map((g: RecentGen) => {
              const thumb = g.thumbnail_url ?? g.final_render_url;
              return (
                <Link
                  key={g.id}
                  to="/app/biblioteca"
                  search={{ destacar: g.id }}
                  className="group overflow-hidden rounded-xl bg-card transition-shadow hover:shadow-md"
                  style={{ boxShadow: "var(--via-shadow-card)" }}
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    {thumb ? (
                      <FreshImg src={thumb} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] font-light text-muted-foreground">
                        {g.status === "failed" ? "falhou" : "processando"}
                      </div>
                    )}
                    <span className="absolute left-3 top-3 rounded-[4px] bg-background/92 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-accent-foreground">
                      {pipelineLabel(g.pipeline_type)}
                    </span>
                  </div>
                  <div className="px-4 pb-4 pt-3">
                    <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                      {g.prompt?.trim() || "Sem descrição"}
                    </p>
                    <p className="mt-1.5 text-[11px] font-light text-muted-foreground">
                      {formatDistanceToNow(new Date(g.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Projetos recentes */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Projetos
          </span>
          <Link
            to="/app/projetos"
            className="text-[11px] font-medium text-accent-foreground hover:text-foreground"
          >
            Ver todos
          </Link>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
            <p className="text-sm font-light text-muted-foreground">Nenhum projeto criado ainda.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p: RecentProject) => (
              <Link
                key={p.id}
                to="/app/projetos/$projectId"
                params={{ projectId: p.id }}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card px-5 py-4 transition-colors hover:border-accent-foreground/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="mt-1 truncate text-[11px] font-light text-muted-foreground">
                    {p.client_name ?? "Sem cliente"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[28px] font-black leading-none tracking-tight text-foreground">
        {value}
      </dd>
    </div>
  );
}

function Divider() {
  return <div className="w-px bg-border/60" aria-hidden="true" />;
}
