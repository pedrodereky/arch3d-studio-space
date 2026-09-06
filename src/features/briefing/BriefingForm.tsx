import type { Briefing, ExtraId } from "./types";
import {
  TIPOLOGIA_OPTIONS,
  ESTILO_OPTIONS,
  EXTRA_OPTIONS,
  composeBriefingPreview,
} from "./types";
import { Loader2 } from "lucide-react";

type Props = {
  value: Briefing;
  onChange: (b: Briefing) => void;
  submitting: boolean;
  onSubmit: () => void;
};

export function BriefingForm({ value, onChange, submitting, onSubmit }: Props) {
  const update = <K extends keyof Briefing>(k: K, v: Briefing[K]) =>
    onChange({ ...value, [k]: v });

  const toggleExtra = (id: ExtraId) => {
    const has = value.extras.includes(id);
    update("extras", has ? value.extras.filter((e) => e !== id) : [...value.extras, id]);
  };

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-6 py-5">
        <h2 className="text-lg font-black tracking-tight text-foreground">
          Configuração do briefing
        </h2>
        <p className="mt-1 text-xs font-normal text-muted-foreground">
          Defina os parâmetros técnicos da planta 2D
        </p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <Field label="Tipologia">
          <select
            value={value.tipologia}
            onChange={(e) => update("tipologia", e.target.value as Briefing["tipologia"])}
            className={selectClass}
          >
            {TIPOLOGIA_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Área (m²)">
            <NumberInput
              value={value.areaM2}
              min={20}
              max={2000}
              onChange={(v) => update("areaM2", v)}
            />
          </Field>
          <Field label="Vagas">
            <NumberInput
              value={value.vagas}
              min={0}
              max={10}
              onChange={(v) => update("vagas", v)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Quartos">
            <NumberInput
              value={value.quartos}
              min={0}
              max={10}
              onChange={(v) => update("quartos", v)}
            />
          </Field>
          <Field label="Suítes">
            <NumberInput
              value={value.suites}
              min={0}
              max={10}
              onChange={(v) => update("suites", v)}
            />
          </Field>
        </div>

        <Field label="Banheiros">
          <NumberInput
            value={value.banhos}
            min={0}
            max={10}
            onChange={(v) => update("banhos", v)}
          />
        </Field>

        <Field label="Extras">
          <div className="flex flex-wrap gap-2">
            {EXTRA_OPTIONS.map((o) => {
              const active = value.extras.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleExtra(o.id)}
                  className={`rounded-[4px] border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    active
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Estilo arquitetônico">
          <select
            value={value.estilo}
            onChange={(e) => update("estilo", e.target.value as Briefing["estilo"])}
            className={selectClass}
          >
            {ESTILO_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Observações livres">
          <textarea
            rows={3}
            value={value.observacoes}
            onChange={(e) => update("observacoes", e.target.value.slice(0, 500))}
            placeholder="Ex: Cozinha integrada com a sala, circulação fluida..."
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-accent"
          />
        </Field>

        <div className="rounded-md border border-border bg-foreground/95 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.1em] text-background/70">
            Auto-prompt
          </p>
          <p className="mt-2 font-mono text-xs font-normal leading-[1.6] text-background">
            {composeBriefingPreview(value)}
          </p>
        </div>
      </div>

      <div className="border-t border-border bg-card px-6 py-5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-[12px] font-black uppercase tracking-[0.08em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Gerar plantas baixas"
          )}
        </button>
        <p className="mt-2 text-center text-xs font-normal text-muted-foreground">
          ≈ 30–60s · 4 propostas
        </p>
      </div>
    </aside>
  );
}

const selectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-black uppercase tracking-[0.08em] text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
      className={selectClass}
    />
  );
}
