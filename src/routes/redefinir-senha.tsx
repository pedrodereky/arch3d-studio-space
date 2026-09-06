import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand/Wordmark";
import { toast } from "sonner";

export const Route = createFileRoute("/redefinir-senha")({
  component: ResetPage,
});

const pill =
  "inline-flex items-center justify-center rounded-full px-5 h-11 text-[11px] font-black uppercase tracking-[0.12em] transition-colors";

function ResetPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) setMode("update");
  }, []);

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await resetPassword(email);
    setSubmitting(false);
    if (error) {
      toast.error("Erro ao enviar e-mail", { description: error.message });
      return;
    }
    toast.success("Link enviado", {
      description: "Confira sua caixa de entrada para redefinir a senha.",
    });
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("Erro ao redefinir", { description: error.message });
      return;
    }
    toast.success("Senha redefinida");
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
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            {mode === "request" ? "Recuperar senha" : "Definir nova senha"}
          </h1>
          <p className="mt-1 text-sm font-light text-muted-foreground">
            {mode === "request"
              ? "Vamos enviar um link para você redefinir sua senha."
              : "Escolha uma nova senha para sua conta."}
          </p>

          {mode === "request" ? (
            <form onSubmit={handleRequest} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 h-11 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className={`${pill} w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar link
              </button>
            </form>
          ) : (
            <form onSubmit={handleUpdate} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Nova senha
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
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
                Salvar nova senha
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/entrar" className="font-medium text-foreground hover:underline">
              Voltar para entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
