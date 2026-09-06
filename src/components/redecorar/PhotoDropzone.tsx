import { useCallback, useRef, useState, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  file: File | null;
  previewUrl: string | null;
  onFile: (file: File | null) => void;
};

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function resizeIfHuge(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type.includes("heic") || file.type.includes("heif")) {
    return file;
  }
  // se já é menor que ~2MB, deixa
  if (file.size < 2 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 3072;
    if (bitmap.width <= maxDim && bitmap.height <= maxDim) return file;
    const scale = maxDim / Math.max(bitmap.width, bitmap.height);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<File>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.95,
      );
    });
  } catch {
    return file;
  }
}

export function PhotoDropzone({ file, previewUrl, onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const f = files[0];
      if (!ACCEPTED.includes(f.type) && !f.name.match(/\.(heic|heif)$/i)) {
        toast.error("Formato não suportado", {
          description: "Use JPG, PNG, WEBP ou HEIC.",
        });
        return;
      }
      if (f.size > MAX_BYTES) {
        toast.error("Arquivo muito grande", { description: "Máximo 20MB." });
        return;
      }
      const normalized = await resizeIfHuge(f);
      onFile(normalized);
    },
    [onFile],
  );

  if (file && previewUrl) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <img
          src={previewUrl}
          alt="Foto carregada"
          className="block max-h-[70vh] w-full object-contain"
        />
        <button
          type="button"
          onClick={() => onFile(null)}
          className="absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-background/95 px-3 text-[11px] font-black uppercase tracking-[0.1em] text-foreground shadow-md transition-colors hover:bg-background"
        >
          <X className="h-3.5 w-3.5" /> Trocar foto
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex h-[60vh] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
        dragging
          ? "border-accent bg-accent/5"
          : "border-border bg-card hover:border-accent/40 hover:bg-muted/40"
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <ImagePlus className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-5 text-base font-bold text-foreground">
        Solte a foto do ambiente aqui
      </p>
      <p className="mt-1 text-sm font-light text-muted-foreground">
        ou clique para escolher · JPG, PNG, HEIC · até 20MB
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
