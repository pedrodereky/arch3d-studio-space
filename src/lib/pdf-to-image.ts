// Converte a primeira página de um PDF em JPEG (DataURL + File) usando pdfjs-dist.
// Reusa o mesmo padrão de `gerar.planta.tsx`, mas só extrai a primeira página.

export async function pdfFirstPageToJpeg(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  const workerMod = (await import(
    /* @vite-ignore */ "pdfjs-dist/build/pdf.worker.mjs?url"
  )) as { default: string };
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("toBlob falhou"))),
      "image/jpeg",
      0.85,
    ),
  );
  const base = file.name.replace(/\.pdf$/i, "");
  return new File([blob], `${base}-p1.jpg`, { type: "image/jpeg" });
}
