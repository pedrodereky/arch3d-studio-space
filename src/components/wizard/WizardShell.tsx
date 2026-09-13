import { Loader2, Circle, CheckCircle2 } from "lucide-react";
import { type ReactNode } from "react";

export type WizardStep = {
  id: string;
  label: string;
  shortLabel: string;
  content: ReactNode;
  hidden?: boolean;
};

interface WizardShellProps {
  steps: WizardStep[];
  currentIndex: number;
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
  isSubmitting?: boolean;
  nextLabel?: string;
  hideFooter?: boolean;
}

export function WizardShell({
  steps,
  currentIndex,
  onBack,
  onNext,
  canProceed,
  isSubmitting = false,
  nextLabel = "Continuar",
  hideFooter = false,
}: WizardShellProps) {
  const visible = steps.filter((s) => !s.hidden);
  const currentStep = steps[currentIndex];
  const visibleCurrentIndex = visible.findIndex((s) => s.id === currentStep.id);
  const totalVisible = visible.length;

  return (
    <div
      className="w-full rounded-2xl border border-border/60 bg-card p-8 sm:p-10"
      style={{ boxShadow: "var(--via-shadow-card)" }}
    >
      {/* Desktop progress dots */}
      <div className="hidden items-center justify-between gap-2 md:flex">
        {visible.map((step, i) => {
          const isDone = i < visibleCurrentIndex;
          const isCurrent = i === visibleCurrentIndex;
          return (
            <div key={step.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                {isDone ? (
                  <CheckCircle2 className="h-6 w-6 text-accent" strokeWidth={2} />
                ) : isCurrent ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[12px] font-black text-primary-foreground">
                    {i + 1}
                  </div>
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
                )}
                <span
                  className={
                    "max-w-[88px] text-center text-[9px] font-bold uppercase tracking-[0.12em] " +
                    (isCurrent
                      ? "text-foreground"
                      : isDone
                        ? "text-accent"
                        : "text-muted-foreground/60")
                  }
                >
                  {step.shortLabel}
                </span>
              </div>
              {i < totalVisible - 1 && (
                <div className={"mx-1 mb-5 h-px flex-1 " + (isDone ? "bg-accent" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile indicator */}
      <div className="md:hidden">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Passo {visibleCurrentIndex + 1} de {totalVisible}
        </p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-foreground">
          {currentStep.shortLabel}
        </h2>
      </div>

      {/* Content */}
      <div className="mt-8 min-h-[280px]">{currentStep.content}</div>

      {/* Footer */}
      {!hideFooter && (
        <div className="mt-10 flex items-center justify-between border-t border-border/60 pt-6">
          <button
            type="button"
            onClick={onBack}
            disabled={visibleCurrentIndex === 0 || isSubmitting}
            className="inline-flex h-11 items-center rounded-full border border-border bg-background px-6 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed || isSubmitting}
            className="inline-flex h-11 items-center rounded-full bg-primary px-7 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
