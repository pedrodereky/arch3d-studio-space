import { useEffect, useState } from "react";
import { Loader2, Sparkles, ArrowRight, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  label: string;
  hint?: string;
  options: string[];
  allowOther: boolean;
};

type Step = "loading" | "questions" | "preview" | "error";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt: string;
  onConfirm: (finalPrompt: string) => void;
};

export function RefinePromptDialog({ open, onOpenChange, initialPrompt, onConfirm }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [openOther, setOpenOther] = useState<Record<string, boolean>>({});
  const [finalPrompt, setFinalPrompt] = useState("");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setStep("loading");
      setError("");
      setAnswers({});
      setOtherText({});
      setOpenOther({});
      setFinalPrompt("");
      setQuestions([]);
      const { data, error } = await supabase.functions.invoke("refine-text-prompt", {
        body: { prompt: initialPrompt },
      });
      if (cancelled) return;
      if (error || !data?.questions) {
        setError(
          (data as { error?: string } | null)?.error ??
            error?.message ??
            "Não foi possível gerar perguntas",
        );
        setStep("error");
        return;
      }
      setQuestions(data.questions as Question[]);
      setStep("questions");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialPrompt]);

  const allAnswered = questions.every((q) => {
    const v = answers[q.id];
    if (!v) return false;
    if (v === "__other__") return (otherText[q.id]?.trim().length ?? 0) > 0;
    return true;
  });

  const handleCompose = async () => {
    setComposing(true);
    const payload = {
      prompt: initialPrompt,
      answers: questions.map((q) => {
        const raw = answers[q.id];
        const value = raw === "__other__" ? otherText[q.id]?.trim() ?? "" : raw;
        return { questionId: q.id, questionLabel: q.label, value };
      }),
    };
    const { data, error } = await supabase.functions.invoke("refine-text-prompt", {
      body: payload,
    });
    setComposing(false);
    if (error || !data?.finalPrompt) {
      toast.error("Falha ao compor prompt", {
        description: (data as { error?: string } | null)?.error ?? error?.message,
      });
      return;
    }
    setFinalPrompt(data.finalPrompt as string);
    setStep("preview");
  };

  const handleConfirm = () => {
    onConfirm(finalPrompt.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 border-border bg-background p-0">
        <header className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Refinar com IA
            </p>
            <h2 className="mt-0.5 text-lg font-black tracking-tight text-foreground">
              Algumas perguntas para deixar seu modelo melhor
            </h2>
          </div>
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm font-light">Analisando seu prompt…</p>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
                <p className="text-sm font-bold">Não deu pra gerar perguntas</p>
              </div>
              <p className="text-[12px] font-light text-muted-foreground">{error}</p>
            </div>
          )}

          {step === "questions" && (
            <div className="space-y-7">
              {questions.map((q) => (
                <div key={q.id}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {q.label}
                  </p>
                  {q.hint && (
                    <p className="mt-1 text-[12px] font-light text-muted-foreground/80">
                      {q.hint}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {q.options.map((opt) => {
                      const selected = answers[q.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setAnswers((a) => ({ ...a, [q.id]: opt }));
                            setOpenOther((o) => ({ ...o, [q.id]: false }));
                          }}
                          className={cn(
                            "rounded-[4px] border px-3 py-1.5 text-[12px] font-bold transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:border-primary/40",
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                    {q.allowOther && (
                      <button
                        type="button"
                        onClick={() => {
                          setAnswers((a) => ({ ...a, [q.id]: "__other__" }));
                          setOpenOther((o) => ({ ...o, [q.id]: true }));
                        }}
                        className={cn(
                          "rounded-[4px] border px-3 py-1.5 text-[12px] font-bold transition-colors",
                          answers[q.id] === "__other__"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-dashed border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        Outro
                      </button>
                    )}
                  </div>
                  {openOther[q.id] && (
                    <input
                      type="text"
                      autoFocus
                      placeholder="Descreva…"
                      value={otherText[q.id] ?? ""}
                      onChange={(e) =>
                        setOtherText((o) => ({ ...o, [q.id]: e.target.value }))
                      }
                      className="mt-2 w-full rounded-[4px] border border-border bg-background px-3 py-2 text-sm font-light text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {step === "preview" && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Prompt final · editável
              </p>
              <textarea
                value={finalPrompt}
                onChange={(e) => setFinalPrompt(e.target.value)}
                rows={8}
                className="mt-3 w-full rounded-md border border-border bg-background p-3 text-sm font-light leading-relaxed text-foreground focus:border-primary focus:outline-none"
              />
              <p className="mt-2 text-[11px] font-light text-muted-foreground">
                Em inglês para máxima qualidade no motor 3D. Pode ajustar à vontade.
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancelar
          </button>

          {step === "questions" && (
            <button
              type="button"
              disabled={!allAnswered || composing}
              onClick={handleCompose}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {composing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Pré-visualizar prompt
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          )}

          {step === "preview" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("questions")}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={finalPrompt.trim().length < 10}
                onClick={handleConfirm}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Usar este prompt
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === "error" && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-5 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted"
            >
              Fechar
            </button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
