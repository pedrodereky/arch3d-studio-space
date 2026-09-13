import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, User as UserIcon, KeyRound, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/app/conta")({
  component: ContaPage,
});

function ContaPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [cau, setCau] = useState("");
  const [office, setOffice] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const [monthCost, setMonthCost] = useState<number | null>(null);
  const [monthCount, setMonthCount] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setCau(profile.cau_number ?? "");
    setOffice(profile.office_name ?? "");
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    void supabase
      .from("generations")
      .select("cost_usd, status", { count: "exact" })
      .eq("user_id", user.id)
      .eq("status", "succeeded")
      .gte("created_at", since.toISOString())
      .then(({ data, count }) => {
        const sum = (data ?? []).reduce(
          (acc, r) => acc + Number((r as { cost_usd: number | null }).cost_usd ?? 0),
          0,
        );
        setMonthCost(sum);
        setMonthCount(count ?? 0);
      });
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        cau_number: cau.trim() || null,
        office_name: office.trim() || null,
      })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      toast.error("Não consegui salvar: " + error.message);
      return;
    }
    toast.success("Perfil atualizado");
    await refreshProfile();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) {
      toast.error("Senha precisa ter pelo menos 8 caracteres");
      return;
    }
    if (pwd !== pwd2) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) {
      toast.error("Não consegui trocar a senha: " + error.message);
      return;
    }
    setPwd("");
    setPwd2("");
    toast.success("Senha atualizada");
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-10">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">Conta</h1>
        <p className="mt-2 font-light text-muted-foreground">Seus dados, senha e consumo do mês.</p>
      </header>

      {/* Consumo */}
      <section
        className="rounded-xl border border-border/60 bg-card p-6"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <DollarSign className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black tracking-tight text-foreground">Últimos 30 dias</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <Stat label="Gerações concluídas" value={monthCount?.toString() ?? "—"} />
              <Stat
                label="Custo (USD)"
                value={monthCost === null ? "—" : `$ ${monthCost.toFixed(2)}`}
              />
            </div>
            <p className="mt-4 text-xs font-light text-muted-foreground">
              Acumulado total: {profile?.total_generations ?? 0} gerações · $
              {Number(profile?.total_cost_usd ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
      </section>

      {/* Perfil */}
      <section
        className="rounded-xl border border-border/60 bg-card p-6"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <UserIcon className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </div>
          <form onSubmit={saveProfile} className="flex-1 space-y-4">
            <div>
              <h2 className="text-xl font-black tracking-tight text-foreground">Dados pessoais</h2>
              <p className="mt-1 text-xs font-light text-muted-foreground">Email: {user?.email}</p>
            </div>
            <Field label="Nome completo">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="CAU">
              <input
                type="text"
                value={cau}
                onChange={(e) => setCau(e.target.value)}
                placeholder="A12345-6"
                className={inputCls}
              />
            </Field>
            <Field label="Escritório">
              <input
                type="text"
                value={office}
                onChange={(e) => setOffice(e.target.value)}
                className={inputCls}
              />
            </Field>
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {savingProfile && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Salvar
            </button>
          </form>
        </div>
      </section>

      {/* Senha */}
      <section
        className="rounded-xl border border-border/60 bg-card p-6"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <KeyRound className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </div>
          <form onSubmit={changePassword} className="flex-1 space-y-4">
            <h2 className="text-xl font-black tracking-tight text-foreground">Trocar senha</h2>
            <Field label="Nova senha">
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirmar nova senha">
              <input
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
              />
            </Field>
            <button
              type="submit"
              disabled={savingPwd}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {savingPwd && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Atualizar senha
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-light text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
    </div>
  );
}
