import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Wordmark } from "@/components/brand/Wordmark";
import { toast } from "sonner";

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/app",
  }),
  component: LoginPage,
});

const pill =
  "inline-flex items-center justify-center rounded-full px-5 h-11 text-[11px] font-black uppercase tracking-[0.12em] transition-colors";

function LoginPage() {
  const { signIn, signInWithGoogle, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) navigate({ to: search.redirect, replace: true });
  }, [user, isLoading, navigate, search.redirect]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const emailValue = String(fd.get("email") ?? email).trim();
    const passwordValue = String(fd.get("password") ?? password);
    if (!emailValue || !passwordValue) {
      toast.error("Preencha e-mail e senha");
      return;
    }
    setSubmitting(true);
    const { error } = await signIn(emailValue, passwordValue);
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    navigate({ to: search.redirect, replace: true });
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
          <h1 className="text-2xl font-black tracking-tight text-foreground">Entrar</h1>
          <p className="mt-1 text-sm font-light text-muted-foreground">
            Acesse sua conta para continuar gerando.
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
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                E-mail
              </label>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 h-11 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder="voce@escritorio.com.br"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Senha
                </label>
                <Link
                  to="/redefinir-senha"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Esqueci a senha
                </Link>
              </div>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 h-11 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={`${pill} w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <Link to="/cadastrar" className="font-medium text-foreground hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
