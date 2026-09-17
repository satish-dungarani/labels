import * as pdfjs from "pdfjs-dist";

// @ts-ignore
import workerSrc from "pdfjs-dist/build/pdf.worker.min.js?raw";

// Inline worker as blob URL — works reliably in all environments including single-file builds.
try {
  const blob = new Blob([workerSrc as string], { type: "application/javascript" });
  pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
} catch {
  // Fallback: pdf.js uses main-thread "fake" worker
  pdfjs.GlobalWorkerOptions.workerSrc = "";
}

export { pdfjs };
