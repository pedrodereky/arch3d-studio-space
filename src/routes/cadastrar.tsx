import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Wordmark } from "@/components/brand/Wordmark";
import { toast } from "sonner";

export const Route = createFileRoute("/cadastrar")({
  component: SignupPage,
});

const pill =
  "inline-flex items-center justify-center rounded-full px-5 h-11 text-[11px] font-black uppercase tracking-[0.12em] transition-colors";

function SignupPage() {
  const { signUp, signInWithGoogle, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cau, setCau] = useState("");
  const [office, setOffice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) navigate({ to: "/app", replace: true });
  }, [user, isLoading, navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullNameValue = String(fd.get("full_name") ?? fullName).trim();
    const emailValue = String(fd.get("email") ?? email).trim();
    const passwordValue = String(fd.get("password") ?? password);
    const cauValue = String(fd.get("cau") ?? cau).trim();
    const officeValue = String(fd.get("office") ?? office).trim();
    if (!fullNameValue || !emailValue || !passwordValue) {
      toast.error("Preencha nome, e-mail e senha");
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(emailValue, passwordValue, {
      full_name: fullNameValue,
      cau_number: cauValue || undefined,
      office_name: officeValue || undefined,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível criar a conta", { description: error.message });
      return;
    }
    toast.success("Conta criada", {
      description: "Verifique seu e-mail para confirmar o acesso.",
    });
    navigate({ to: "/entrar", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-primary" />
        </div>
        <div
          className="rounded-2xl border border-border/60 bg-card p-8"
          style={{ boxShadow: "var(--via-shadow-card)" }}
        >
          <h1 className="text-2xl font-black tracking-tight text-foreground">Criar conta</h1>
          <p className="mt-1 text-sm font-light text-muted-foreground">
            Comece com 3 créditos grátis. Sem cartão.
          </p>

          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className={`${pill} mt-6 w-full border border-border bg-background text-foreground hover:bg-secondary`}
          >
            Continuar com Google
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              ou
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field name="full_name" label="Nome completo" required value={fullName} onChange={setFullName} autoComplete="name" />
            <Field name="email" label="E-mail" type="email" required value={email} onChange={setEmail} autoComplete="email" />
            <Field
              name="password"
              label="Senha"
              type="password"
              required
              value={password}
              onChange={setPassword}
              hint="Mínimo 8 caracteres."
              autoComplete="new-password"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field name="cau" label="CAU (opcional)" value={cau} onChange={setCau} />
              <Field name="office" label="Escritório (opcional)" value={office} onChange={setOffice} autoComplete="organization" />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={`${pill} w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar conta
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/entrar" className="font-medium text-foreground hover:underline">
              Entrar
            </Link>
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ao criar conta, você concorda com os Termos e a Política de Privacidade.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  hint,
  name,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  hint?: string;
  name?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      <input
        name={name}
        autoComplete={autoComplete}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 h-11 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
