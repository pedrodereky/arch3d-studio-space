import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles,
  FolderOpen,
  Library,
  Map,
  ArrowRight,
  Loader2,
  Workflow,
  Wand2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FreshImg } from "@/components/library/FreshMedia";

export const Route = createFileRoute("/_authenticated/app/")({
  component: DashboardPage,
});

type RecentGen = {
  id: string;
  pipeline_type: string;
  status: string;
  thumbnail_url: string | null;
  final_render_url: string | null;
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
  const [gens, setGens] = useState<RecentGen[]>([]);
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [monthCost, setMonthCost] = useState<number | null>(null);
  const [monthCount, setMonthCount] = useState(0);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    void Promise.all([
      supabase
        .from("generations")
        .select("id, pipeline_type, status, thumbnail_url, final_render_url, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("projects")
        .select("id, name, client_name")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(4),
      supabase
        .from("generations")
        .select("cost_usd", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "succeeded")
        .gte("created_at", since.toISOString()),
      supabase
        .from("studio_runs")
        .select("id, workflow_id, status, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([gensRes, projectsRes, monthRes, runRes]) => {
      setGens((gensRes.data ?? []) as RecentGen[]);
      setProjects((projectsRes.data ?? []) as RecentProject[]);
      setMonthCost(
        (monthRes.data ?? []).reduce(
          (acc, r) => acc + Number((r as { cost_usd: number | null }).cost_usd ?? 0),
          0,
        ),
      );
      setMonthCount(monthRes.count ?? 0);
      setLastRun((runRes.data as LastRun | null) ?? null);
      setLoading(false);
    });
  }, [user]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "arquiteto";

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">Olá, {firstName}</h1>
        <p className="mt-2 font-light text-muted-foreground">
          Bem-vindo ao Arq3D Studio. Aqui está um resumo da sua conta.
        </p>
      </header>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Gerações totais" value={String(profile?.total_generations ?? 0)} />
        <Stat label="Últimos 30 dias" value={String(monthCount)} />
        <Stat
          label="Custo (30 dias)"
          value={monthCost === null ? "—" : `$ ${monthCost.toFixed(2)}`}
        />
      </div>

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

      {/* Últimas gerações */}
      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-black tracking-tight text-foreground">Últimas gerações</h2>
          <Link
            to="/app/biblioteca"
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            Ver tudo →
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {gens.map((g) => {
              const thumb = g.thumbnail_url ?? g.final_render_url;
              return (
                <Link
                  key={g.id}
                  to="/app/biblioteca"
                  search={{ destacar: g.id }}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted transition-all hover:border-accent"
                >
                  {thumb ? (
                    <FreshImg src={thumb} className="h-full w-full object-cover" alt="" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      {g.status}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Projetos recentes */}
      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-black tracking-tight text-foreground">Projetos recentes</h2>
          <Link
            to="/app/projetos"
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            Ver tudo →
          </Link>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
            <p className="text-sm font-light text-muted-foreground">Nenhum projeto criado ainda.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                to="/app/projetos/$projectId"
                params={{ projectId: p.id }}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-accent/40"
              >
                <h3 className="truncate text-sm font-bold text-foreground">{p.name}</h3>
                {p.client_name && (
                  <p className="mt-1 truncate text-xs font-light text-muted-foreground">
                    {p.client_name}
                  </p>
                )}
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
    <div
      className="rounded-xl border border-border/60 bg-card p-5"
      style={{ boxShadow: "var(--via-shadow-card)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight text-foreground">{value}</p>
    </div>
  );
}
