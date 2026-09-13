import { REDECORATE_PRESETS, type RedecoratePresetId } from "@/lib/redecorate-presets";

type Props = {
  mode: "preset" | "custom";
  onMode: (m: "preset" | "custom") => void;
  presetId: RedecoratePresetId | null;
  onPreset: (id: RedecoratePresetId | null) => void;
  customPrompt: string;
  onCustomPrompt: (s: string) => void;
  /**
   * Versão para o trilho lateral: lista de uma coluna, sem ícone e sem um
   * parágrafo por preset. A descrição do preset escolhido aparece embaixo —
   * é a única que interessa depois da escolha.
   */
  compact?: boolean;
};

const PROMPT_HINTS = [
  "móveis em madeira clara",
  "paleta neutra com verde oliva",
  "estilo art déco contemporâneo",
  "minimalismo escandinavo",
  "ambiente acolhedor com plantas",
];

export function StylePicker({
  mode,
  onMode,
  presetId,
  onPreset,
  customPrompt,
  onCustomPrompt,
  compact = false,
}: Props) {
  const selected = REDECORATE_PRESETS.find((p) => p.id === presetId) ?? null;
  return (
    <div>
      <div className="flex gap-1 rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => onMode("preset")}
          className={`flex-1 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.1em] transition-colors ${
            mode === "preset"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Predefinido
        </button>
        <button
          type="button"
          onClick={() => onMode("custom")}
          className={`flex-1 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.1em] transition-colors ${
            mode === "custom"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Personalizado
        </button>
      </div>

      {mode === "preset" && compact && (
        <>
          <div className="mt-3 flex flex-col gap-1">
            {REDECORATE_PRESETS.map((p) => {
              const active = p.id === presetId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPreset(p.id)}
                  className={`flex h-[34px] items-center rounded-lg border px-3 text-left text-[12px] transition-colors ${
                    active
                      ? "border-accent-foreground/25 bg-accent font-semibold text-accent-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {selected && (
            <p className="mt-3 text-[11.5px] font-light leading-relaxed text-muted-foreground">
              {selected.description}.
            </p>
          )}
        </>
      )}

      {mode === "preset" && !compact && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {REDECORATE_PRESETS.map((p) => {
            const active = p.id === presetId;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(p.id)}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                  active
                    ? "border-accent bg-card shadow-md"
                    : "border-border bg-background hover:border-accent/40 hover:bg-card"
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <p className="text-sm font-bold text-foreground">{p.label}</p>
                <p className="text-[12px] font-light leading-relaxed text-muted-foreground">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {mode === "custom" && (
        <div className="mt-5">
          <textarea
            value={customPrompt}
            onChange={(e) => onCustomPrompt(e.target.value.slice(0, 400))}
            rows={compact ? 4 : 5}
            placeholder="Descreva o estilo desejado. Ex.: sala contemporânea com paleta neutra, toques de verde oliva, mobília em madeira clara, iluminação suave"
            className="w-full resize-none rounded-xl border border-border bg-background p-4 text-sm font-light text-foreground outline-none transition-colors focus:border-accent"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_HINTS.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => onCustomPrompt((customPrompt ? customPrompt + ", " : "") + hint)}
                  className="rounded-md border border-border bg-card px-2 py-1 text-[11px] font-light text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
                >
                  + {hint}
                </button>
              ))}
            </div>
            <span className="shrink-0 text-[11px] font-light text-muted-foreground">
              {customPrompt.length}/400
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
