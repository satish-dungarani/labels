import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { pdfjs } from "../lib/pdfjs";
import type { OutputPage } from "../lib/engine";

interface PreviewProps {
  bytes: Uint8Array | null;
  pages: OutputPage[];
  currentPage: number;
  onPageChange: (n: number) => void;
}

export function Preview({ bytes, pages: _pages, currentPage, onPageChange }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*  Load document ── */
  useEffect(() => {
    let cancelled = false;
    let pdfDoc: PDFDocumentProxy | null = null;

    setDoc(null);
    setNumPages(0);
    setError(null);

    if (!bytes) return;

    (async () => {
      try {
        const task = pdfjs.getDocument({ data: bytes.slice() });
        const loaded = await task.promise;
        if (cancelled) { void loaded.destroy(); return; }
        pdfDoc = loaded;
        setDoc(loaded);
        setNumPages(loaded.numPages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => { cancelled = true; if (pdfDoc) void pdfDoc.destroy(); };
  }, [bytes]);

  /* ── Render page ─ */
  useEffect(() => {
    if (!doc || currentPage < 1 || currentPage > numPages) return;
    let cancelled = false;

    // Fixed container dimensions
    const CONTAINER_W = 520;
    const CONTAINER_H = 720;

    (async () => {
      setRendering(true);
      try {
        const page = await doc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // Compute scale so the page fits inside the fixed container
        const viewportRaw = page.getViewport({ scale: 1 });
        const fitScale = Math.min(CONTAINER_W / viewportRaw.width, CONTAINER_H / viewportRaw.height);
        const viewport = page.getViewport({ scale: fitScale * dpr });

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== "RenderingCancelled") {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => { cancelled = true; };
  }, [doc, currentPage, numPages]);

  if (!bytes) {
    return (
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <header className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <FileText className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-xs font-semibold text-zinc-200">Preview</h2>
        </header>
        <div className="flex min-h-[300px] items-center justify-center">
          <p className="text-xs text-zinc-600">Process PDFs to preview.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-zinc-500" />
          <h2 className="text-xs font-semibold text-zinc-200">Preview</h2>
          {numPages > 0 && (
            <span className="font-mono text-[10px] text-zinc-500">{numPages} pages</span>
          )}
        </div>

        {numPages > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-md border border-white/10 bg-white/[0.03] p-1 text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-12 text-center font-mono text-[10px] text-zinc-400">
              {currentPage} / {numPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= numPages}
              className="rounded-md border border-white/10 bg-white/[0.03] p-1 text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* Canvas */}
      <div className="flex h-[780px] items-center justify-center overflow-auto px-4 py-4">
        {error ? (
          <div className="text-center">
            <p className="font-mono text-xs text-rose-400">{error}</p>
          </div>
        ) : doc ? (
          <div className="relative">
            {rendering && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="rounded bg-white shadow-2xl ring-1 ring-white/10"
              style={{ maxWidth: "600px", maxHeight: "700px" }}
            />
          </div>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        )}
      </div>
    </section>
  );
}
