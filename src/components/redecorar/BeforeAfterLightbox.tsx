import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { RedecorateVariation } from "./VariationsGrid";
import { FreshImg, FreshLink } from "@/components/library/FreshMedia";

type Props = {
  beforeUrl: string;
  variations: RedecorateVariation[];
  startIndex: number;
  onClose: () => void;
};

export function BeforeAfterLightbox({ beforeUrl, variations, startIndex, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex);
  const [split, setSplit] = useState(50);
  const [aspect, setAspect] = useState<number>(16 / 9);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const current = variations[idx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % variations.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + variations.length) % variations.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variations.length, onClose]);

  const updateSplit = (clientX: number) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(100, Math.max(0, pct)));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <header className="flex items-center justify-between px-6 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white/70">
          Antes / Depois — Variação {idx + 1} de {variations.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center px-6">
        <div
          ref={wrapRef}
          className="relative w-full max-w-5xl max-h-[80vh] overflow-hidden rounded-xl select-none bg-black"
          style={{ aspectRatio: aspect }}
          onMouseDown={(e) => {
            dragging.current = true;
            updateSplit(e.clientX);
          }}
          onMouseMove={(e) => {
            if (dragging.current) updateSplit(e.clientX);
          }}
          onMouseUp={() => (dragging.current = false)}
          onMouseLeave={() => (dragging.current = false)}
          onTouchStart={(e) => {
            dragging.current = true;
            updateSplit(e.touches[0].clientX);
          }}
          onTouchMove={(e) => {
            if (dragging.current) updateSplit(e.touches[0].clientX);
          }}
          onTouchEnd={() => (dragging.current = false)}
        >
          <FreshImg
            src={current.url}
            alt="Depois"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ width: `${split}%` }}
          >
            <FreshImg
              src={beforeUrl}
              alt="Antes"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ width: `${(100 / split) * 100}%`, maxWidth: "none" }}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                if (img.naturalWidth && img.naturalHeight) {
                  setAspect(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-white"
            style={{ left: `${split}%` }}
          >
            <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-foreground shadow-lg">
              <ChevronLeft className="h-3.5 w-3.5" />
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            Antes
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            Depois
          </span>
        </div>
      </div>

      <footer className="flex items-center justify-center gap-3 px-6 py-5">
        <button
          type="button"
          onClick={() => setIdx((i) => (i - 1 + variations.length) % variations.length)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex gap-1.5">
          {variations.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`h-2 rounded-full transition-all ${
                i === idx ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
              aria-label={`Ir para variação ${i + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIdx((i) => (i + 1) % variations.length)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <FreshLink
          href={current.url}
          download={`redecoracao-${idx + 1}.jpg`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-white/90"
        >
          <Download className="h-3.5 w-3.5" /> Baixar
        </FreshLink>
      </footer>
    </div>
  );
}
