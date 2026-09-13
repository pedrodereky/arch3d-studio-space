// Logger compartilhado da pipeline. Sempre escreve no console.log; persiste
// em public.generation_logs apenas quando `enabled` (modo diagnóstico).
// Inserts são fire-and-forget — nunca derrubam a pipeline.

// deno-lint-ignore no-explicit-any
type Admin = any;

export type LogHandle = { step: string; startedAt: number; details?: Record<string, unknown> };

function memMb(): number | null {
  try {
    // @ts-ignore: Deno global
    const m = Deno.memoryUsage?.();
    return m ? Math.round(m.heapUsed / (1024 * 1024)) : null;
  } catch {
    return null;
  }
}

function truncate(value: unknown): unknown {
  try {
    const json = JSON.stringify(value);
    if (json.length <= 16 * 1024) return value;
    return { truncated: true, preview: json.slice(0, 2000) };
  } catch {
    return { unserializable: true };
  }
}

export type Logger = {
  enabled: boolean;
  start: (step: string, details?: Record<string, unknown>) => LogHandle;
  end: (
    h: LogHandle,
    opts?: { payload_kb?: number; details?: Record<string, unknown>; message?: string },
  ) => void;
  error: (step: string, err: unknown, details?: Record<string, unknown>) => void;
  info: (step: string, message: string, details?: Record<string, unknown>) => void;
};

export function createLogger(opts: {
  admin: Admin;
  generationId: string;
  userId: string;
  enabled: boolean;
}): Logger {
  const { admin, generationId, userId, enabled } = opts;

  const persist = (row: Record<string, unknown>) => {
    if (!enabled) return;
    // fire-and-forget
    admin
      .from("generation_logs")
      .insert({
        generation_id: generationId,
        user_id: userId,
        ...row,
      })
      .then(({ error }: { error: unknown }) => {
        if (error) console.warn("[logger] insert fail:", (error as Error)?.message ?? error);
      })
      .catch((e: unknown) => console.warn("[logger] insert throw:", (e as Error)?.message ?? e));
  };

  return {
    enabled,
    start(step, details) {
      const startedAt = Date.now();
      const mem = memMb();
      console.log(`[step] ${step} START${mem != null ? ` mem=${mem}MB` : ""}`);
      persist({ step, event: "start", memory_mb: mem, details: truncate(details ?? {}) });
      return { step, startedAt, details };
    },
    end(h, o) {
      const dur = Date.now() - h.startedAt;
      const mem = memMb();
      const extras = [
        `${dur}ms`,
        o?.payload_kb != null ? `${o.payload_kb}KB` : null,
        mem != null ? `mem=${mem}MB` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      console.log(`[step] ${h.step} END ${extras}${o?.message ? ` — ${o.message}` : ""}`);
      persist({
        step: h.step,
        event: "end",
        duration_ms: dur,
        payload_kb: o?.payload_kb ?? null,
        memory_mb: mem,
        message: o?.message ?? null,
        details: truncate(o?.details ?? {}),
      });
    },
    error(step, err, details) {
      const e = err as Error;
      const msg = e?.message ?? String(err);
      console.error(`[step] ${step} ERROR ${msg}`);
      persist({
        step,
        event: "error",
        memory_mb: memMb(),
        message: msg.slice(0, 2000),
        details: truncate({ ...(details ?? {}), stack: e?.stack?.slice(0, 2000) }),
      });
    },
    info(step, message, details) {
      console.log(`[step] ${step} INFO ${message}`);
      persist({
        step,
        event: "info",
        memory_mb: memMb(),
        message: message.slice(0, 2000),
        details: truncate(details ?? {}),
      });
    },
  };
}
