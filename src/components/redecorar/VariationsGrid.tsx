import { useState } from "react";
import { Download, Workflow, FolderPlus, Maximize2, RefreshCw } from "lucide-react";
import { BeforeAfterLightbox } from "./BeforeAfterLightbox";
import { FreshImg, FreshLink } from "@/components/library/FreshMedia";

export type RedecorateVariation = {
  url: string;
  seed: number;
};

type Props = {
  sourceUrl: string;
  variations: RedecorateVariation[];
  segImageUrl?: string | null;
  generationId: string;
  onAddToProject?: (variation: RedecorateVariation) => void;
  onSendToStudio?: (variation: RedecorateVariation) => void;
  onIterate?: () => void;
  onChangeStyle?: () => void;
  iterating?: boolean;
};

export function VariationsGrid({
  sourceUrl,
  variations,
  segImageUrl,
  onAddToProject,
  onSendToStudio,
  onIterate,
  onChangeStyle,
  iterating,
}: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [showSeg, setShowSeg] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          {variations.length} variações
        </p>
        {segImageUrl && (
          <button
            type="button"
            onClick={() => setShowSeg((v) => !v)}
            className="text-[11px] font-light text-muted-foreground transition-colors hover:text-foreground"
          >
            {showSeg ? "Ocultar" : "Ver"} mapa de segmentação
          </button>
        )}
      </div>

      {showSeg && segImageUrl && (
        <div className="mb-4 overflow-hidden rounded-xl border border-border">
          <FreshImg src={segImageUrl} alt="Segmentação" className="block w-full" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {variations.map((v, i) => (
          <div
            key={i}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
          >
            <FreshImg
              src={v.url}
              alt={`Variação ${i + 1}`}
              title={`seed ${v.seed}`}
              className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-3 opacity-0 transition-opacity group-hover:opacity-100">
              <div className="flex gap-1.5">
                <IconAction
                  title="Abrir antes/depois"
                  onClick={() => setOpenIdx(i)}
                  Icon={Maximize2}
                />
                {onAddToProject && (
                  <IconAction
                    title="Adicionar a projeto"
                    onClick={() => onAddToProject(v)}
                    Icon={FolderPlus}
                  />
                )}
                {onSendToStudio && (
                  <IconAction
                    title="Mandar pro Studio"
                    onClick={() => onSendToStudio(v)}
                    Icon={Workflow}
                  />
                )}
                <FreshLink
                  href={v.url}
                  download={`redecoracao-${i + 1}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Baixar JPG"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-background/95 text-foreground transition-colors hover:bg-background"
                >
                  <Download className="h-4 w-4" strokeWidth={1.75} />
                </FreshLink>
              </div>
              <span className="rounded-full bg-background/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-foreground">
                {i + 1}/{variations.length}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {onIterate && (
          <button
            type="button"
            onClick={onIterate}
            disabled={iterating}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${iterating ? "animate-spin" : ""}`} />
            {iterating ? "Iterando" : "Iterar este estilo"}
          </button>
        )}
        {onChangeStyle && (
          <button
            type="button"
            onClick={onChangeStyle}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted"
          >
            Tentar outro estilo
          </button>
        )}
      </div>

      {openIdx != null && (
        <BeforeAfterLightbox
          beforeUrl={sourceUrl}
          variations={variations}
          startIndex={openIdx}
          onClose={() => setOpenIdx(null)}
        />
      )}
    </div>
  );
}

function IconAction({
  title,
  onClick,
  Icon,
}: {
  title: string;
  onClick: () => void;
  Icon: typeof Maximize2;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-background/95 text-foreground transition-colors hover:bg-background"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
