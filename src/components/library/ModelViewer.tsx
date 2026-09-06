import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, RotateCcw, AlertTriangle } from "lucide-react";
import { useFreshUrl } from "@/lib/use-fresh-url";

type Props = {
  src: string;
  poster?: string;
  alt?: string;
  /** Compact mode: no controls, no chrome — apenas preview auto-rotativo. */
  compact?: boolean;
  /** URL HDR (.hdr) para iluminação baseada em imagem. */
  hdri?: string;
};

const DEFAULT_HDRI =
  "https://modelviewer.dev/shared-assets/environments/spruit_sunrise_1k_HDR.hdr";

export function ModelViewer({
  src,
  poster,
  alt = "Modelo 3D",
  compact = false,
  hdri = DEFAULT_HDRI,
}: Props) {
  const freshSrc = useFreshUrl(src) ?? src;
  const freshPoster = useFreshUrl(poster);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@google/model-viewer")
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onError = () => setFailed(true);
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ totalProgress: number }>).detail;
      const p = Math.max(0, Math.min(1, detail?.totalProgress ?? 0));
      setProgress(p);
      if (p >= 1) setLoaded(true);
    };
    const onLoad = () => {
      setProgress(1);
      setLoaded(true);
    };
    el.addEventListener("error", onError);
    el.addEventListener("progress", onProgress as EventListener);
    el.addEventListener("load", onLoad);
    return () => {
      el.removeEventListener("error", onError);
      el.removeEventListener("progress", onProgress as EventListener);
      el.removeEventListener("load", onLoad);
    };
  }, [ready]);

  // Reset progresso ao trocar de modelo
  useEffect(() => {
    setProgress(0);
    setLoaded(false);
  }, [src]);

  function reset() {
    const el = ref.current as (HTMLElement & {
      resetTurntableRotation?: () => void;
      cameraOrbit?: string;
    }) | null;
    if (!el) return;
    el.resetTurntableRotation?.();
    el.setAttribute("camera-orbit", "0deg 75deg 105%");
    el.setAttribute("field-of-view", "auto");
  }

  function fullscreen() {
    const el = ref.current;
    if (!el) return;
    void el.requestFullscreen?.();
  }

  const showProgress = ready && !failed && !loaded;

  return (
    <div
      className={
        compact
          ? "relative h-full w-full overflow-hidden bg-muted"
          : "relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted"
      }
    >
      {!ready && !failed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted">
          {freshPoster ? (
            <img src={freshPoster} alt="" className="h-full w-full object-cover opacity-60" />
          ) : null}
          <Loader2 className="absolute h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center">
          {freshPoster ? (
            <img src={freshPoster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
          ) : null}
          <AlertTriangle className="relative h-6 w-6 text-muted-foreground" />
          <p className="relative text-sm font-light text-muted-foreground">
            Não foi possível carregar o modelo 3D.
          </p>
        </div>
      )}

      {ready && !failed && (
        <>
          {/* @ts-expect-error custom element */}
          <model-viewer
            ref={ref as React.RefObject<HTMLElement>}
            src={freshSrc}
            poster={freshPoster ?? undefined}
            alt={alt}
            {...(compact ? {} : { "camera-controls": "" })}
            auto-rotate=""
            auto-rotate-delay={compact ? "0" : "1500"}
            interaction-prompt="none"
            exposure="1"
            shadow-intensity="0.8"
            shadow-softness="0.75"
            environment-image={hdri}
            tone-mapping="aces"
            loading="eager"
            reveal="auto"
            touch-action="pan-y"
            disable-zoom={compact ? "" : undefined}
            disable-pan={compact ? "" : undefined}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              backgroundColor: "transparent",
              pointerEvents: compact ? "none" : undefined,
            }}
          />

          {showProgress && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-muted/70 backdrop-blur-sm">
              <div className="h-1 w-2/3 max-w-[240px] overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-primary transition-[width] duration-150 ease-out"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              {!compact && (
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  Carregando · {Math.round(progress * 100)}%
                </span>
              )}
            </div>
          )}

          {!compact && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 p-3">
              <span className="rounded-[4px] bg-primary/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-primary-foreground backdrop-blur">
                Arraste · scroll para zoom
              </span>
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={reset}
                  title="Resetar câmera"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={fullscreen}
                  title="Tela cheia"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
