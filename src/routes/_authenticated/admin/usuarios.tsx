import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsuariosPage,
});

type Profile = {
  id: string;
  full_name: string | null;
  office_name: string | null;
  cau_number: string | null;
  total_generations: number;
  total_cost_usd: number;
  created_at: string;
};

type RoleRow = { user_id: string; role: string };

type SortKey = "cost" | "generations" | "name" | "created";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "cost", label: "Custo" },
  { key: "generations", label: "Gerações" },
  { key: "name", label: "Nome" },
  { key: "created", label: "Mais recentes" },
];

function UsuariosPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("cost");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [profRes, roleRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,full_name,office_name,cau_number,total_generations,total_cost_usd,created_at",
          ),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (!alive) return;

      // Erro visível em vez de uma tabela vazia que parece "nenhum usuário".
      const firstError = profRes.error ?? roleRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }
      setProfiles((profRes.data ?? []) as Profile[]);
      setRoles((roleRes.data ?? []) as RoleRow[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const adminIds = useMemo(
    () => new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id)),
    [roles],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? profiles.filter(
          (p) =>
            (p.full_name ?? "").toLowerCase().includes(q) ||
            (p.office_name ?? "").toLowerCase().includes(q) ||
            (p.cau_number ?? "").toLowerCase().includes(q),
        )
      : profiles;

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "generations":
          return b.total_generations - a.total_generations;
        case "name":
          return (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt-BR");
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "cost":
        default:
          return Number(b.total_cost_usd ?? 0) - Number(a.total_cost_usd ?? 0);
      }
    });
  }, [profiles, query, sort]);

  const totals = useMemo(
    () => ({
      users: profiles.length,
      admins: profiles.filter((p) => adminIds.has(p.id)).length,
      cost: profiles.reduce((s, p) => s + Number(p.total_cost_usd ?? 0), 0),
      generations: profiles.reduce((s, p) => s + p.total_generations, 0),
    }),
    [profiles, adminIds],
  );

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">Usuários</h1>
        <p className="mt-2 font-light text-muted-foreground">
          Perfis cadastrados, papel e consumo acumulado. O e-mail não aparece aqui: ele vive em{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            auth.users
          </code>
          , fora do alcance do cliente.
        </p>
      </header>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-bold text-foreground">
              Não foi possível carregar os usuários
            </p>
            <p className="mt-1 text-sm font-light text-muted-foreground">{error}</p>
            <p className="mt-2 text-xs font-light text-muted-foreground">
              Se for erro de permissão, confirme que as políticas de RLS de{" "}
              <code className="font-mono">profiles</code> e{" "}
              <code className="font-mono">user_roles</code> liberam leitura para admin.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Usuários" value={String(totals.users)} />
            <Stat label="Admins" value={String(totals.admins)} />
            <Stat label="Gerações acumuladas" value={String(totals.generations)} />
            <Stat label="Custo acumulado" value={`$ ${totals.cost.toFixed(2)}`} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, escritório ou CAU"
                className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Ordenar
              </span>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSort(s.key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] transition-colors ${
                    sort === s.key
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="px-5 py-3 text-left font-bold">Usuário</th>
                  <th className="px-5 py-3 text-left font-bold">CAU</th>
                  <th className="px-5 py-3 text-left font-bold">Papel</th>
                  <th className="px-5 py-3 text-right font-bold">Gerações</th>
                  <th className="px-5 py-3 text-right font-bold">Custo</th>
                  <th className="px-5 py-3 text-right font-bold">Desde</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center font-light text-muted-foreground"
                    >
                      {query ? "Nenhum usuário para essa busca." : "Nenhum usuário cadastrado."}
                    </td>
                  </tr>
                ) : (
                  rows.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-5 py-3">
                        <span className="font-medium text-foreground">
                          {p.full_name ?? "(sem nome)"}
                        </span>
                        {p.office_name && (
                          <span className="block text-xs font-light text-muted-foreground">
                            {p.office_name}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-light text-muted-foreground">
                        {p.cau_number ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        {adminIds.has(p.id) ? (
                          <span className="rounded-[4px] bg-accent px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-accent-foreground">
                            Admin
                          </span>
                        ) : (
                          <span className="text-xs font-light text-muted-foreground">Usuário</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                        {p.total_generations}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-foreground">
                        $ {Number(p.total_cost_usd ?? 0).toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right font-light text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs font-light text-muted-foreground">
            Esta tela é somente leitura. Mudar papel de usuário exige política de escrita em{" "}
            <code className="font-mono">user_roles</code> e ainda não está implementado.
          </p>
        </>
      )}
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
