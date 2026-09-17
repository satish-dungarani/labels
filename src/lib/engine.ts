import { PDFDocument, degrees, rgb } from "pdf-lib";
import { pdfjs } from "./pdfjs";
import {
  buildInvoiceGroups,
  extractAddressTokensNearPostcodes,
  extractPostcodes,
  findBestLabelForGroup,
  prettyPostcode,
  type InvoiceGroup,
  type PdfTextPage,
} from "./matching";

export type LogFn = (msg: string, type?: "info" | "success" | "error") => void;

export interface FileBundle {
  bytes: Uint8Array;
  fileCount: number;
  pageCount: number;
  totalSize: number;
  names: string[];
}

export type OutputMode = "interleaved" | "overlay";

export type PageSizeId = "a4" | "4x6";

/** Fixed output page sizes (PDF points). Applied to every page in stacked mode. */
export const PAGE_SIZES: Record<
  PageSizeId,
  { label: string; width: number; height: number }
> = {
  a4: { label: "A4 (210 × 297 mm)", width: 595.28, height: 841.89 },
  "4x6": { label: "4×6 in label (101 × 152 mm)", width: 288, height: 432 },
};

export interface OverlaySettings {
  posX: number;
  posY: number;
  labelWidth: number;
  labelHeight: number;
  rotation: number;
  drawBorder: boolean;
}

/** One entry per page of the generated document — drives the sequence strip + preview badges. */
export interface OutputPage {
  role: "invoice" | "label";
  orderNumber: number;
  postcode: string;
}

export interface ProcessStats {
  invoices: number;
  labels: number;
  matches: number;
  unmatched: number;
  unused: number;
}

export interface ProcessResult {
  matchedBytes: Uint8Array | null;
  failedBytes: Uint8Array | null;
  pages: OutputPage[];
  stats: ProcessStats;
}

/* ------------------------------------------------------------------ */
/*  File ingestion                                                     */
/* ------------------------------------------------------------------ */

export async function mergePdfFiles(files: File[]): Promise<FileBundle> {
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const names = files.map((f) => f.name);

  if (files.length === 1) {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    const doc = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
    return { bytes, fileCount: 1, pageCount: doc.getPageCount(), totalSize, names };
  }

  const merged = await PDFDocument.create();
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    copied.forEach((page) => merged.addPage(page));
  }
  const bytes = await merged.save();
  return {
    bytes,
    fileCount: files.length,
    pageCount: merged.getPageCount(),
    totalSize,
    names,
  };
}

/* ------------------------------------------------------------------ */
/*  Text + postcode extraction (pdf.js)                                */
/* ------------------------------------------------------------------ */

export async function extractTextAndPostcodes(
  bytes: Uint8Array,
  docName: string,
  log: LogFn,
): Promise<PdfTextPage[]> {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  const results: PdfTextPage[] = [];

  log(`Scanning ${docName} — ${pdf.numPages} page(s)…`);

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = (textContent.items as Array<{ str?: string }>)
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ");

    results.push({
      pageIndex: i - 1,
      pageNumber: i,
      text,
      postcodes: extractPostcodes(text),
      matchTokens: new Set<string>(),
    });
    page.cleanup();
  }

  await pdf.destroy();
  return results;
}

/* ------------------------------------------------------------------ */
/*  Main pipeline                                                      */
/*                                                                     */
/*  INTERLEAVED mode (default): for every matched order the generated  */
/*  PDF contains the invoice page(s) immediately followed by the       */
/*  matching label page as its own full-size page:                     */
/*  INV 1 → LABEL 1 → INV 2 → LABEL 2 → …                              */
/* ------------------------------------------------------------------ */

export async function processDocuments(
  invoices: FileBundle,
  labels: FileBundle,
  mode: OutputMode,
  pageSize: PageSizeId,
  overlay: OverlaySettings,
  log: LogFn,
): Promise<ProcessResult> {
  /* --- 1. Extract text --- */
  const invoicesData = await extractTextAndPostcodes(invoices.bytes, "invoice batch", log);
  const labelsData = await extractTextAndPostcodes(labels.bytes, "label batch", log);
  const groups: InvoiceGroup[] = buildInvoiceGroups(invoicesData);

  labelsData.forEach((lp) => {
    lp.matchTokens = extractAddressTokensNearPostcodes(lp.text, lp.postcodes);
  });
  groups.forEach((g) => {
    g.matchTokens = extractAddressTokensNearPostcodes(g.startPageText, g.postcodes);
  });

  log(
    `Extraction complete — ${invoicesData.length} invoice page(s) grouped into ${groups.length} order(s), ${labelsData.length} label(s).`,
  );

  /* --- 2. Index labels by postcode --- */
  const postcodeToLabelIndices = new Map<string, number[]>();
  const usedLabelPages = new Set<number>();
  const unusedLabels = new Set<number>();

  labelsData.forEach((lp) => {
    if (lp.postcodes.length > 0) {
      lp.postcodes.forEach((pc) => {
        if (!postcodeToLabelIndices.has(pc)) postcodeToLabelIndices.set(pc, []);
        postcodeToLabelIndices.get(pc)!.push(lp.pageIndex);
      });
      unusedLabels.add(lp.pageIndex);
    } else {
      log(`Warning: no postcode found on label page ${lp.pageNumber}.`, "error");
    }
  });

  /* --- 3. Load working documents --- */
  const invoiceDoc = await PDFDocument.load(invoices.bytes.slice());
  const labelDoc = await PDFDocument.load(labels.bytes.slice());

  if (mode === "overlay") {
    // Overlay mode needs labels normalized to A4 before embedding.
    log("Overlay mode: normalizing label pages to A4…");
    const A4W = 595.28;
    const A4H = 841.89;
    labelDoc.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      page.scale(A4W / width, A4H / height);
      page.setSize(A4W, A4H);
    });
  }

  /* --- 4. Match + assemble --- */
  const matchedDoc = await PDFDocument.create();
  const unmatchedDoc = await PDFDocument.create();
  const unusedLabelsDoc = await PDFDocument.create();
  const pages: OutputPage[] = [];

  let matchesCount = 0;
  let unmatchedCount = 0;

  for (const group of groups) {
    const match = findBestLabelForGroup(
      group,
      labelsData,
      postcodeToLabelIndices,
      usedLabelPages,
    );

    if (match) {
      matchesCount++;
      usedLabelPages.add(match.labelIndex);
      unusedLabels.delete(match.labelIndex);

      log(
        `Match: order ${group.orderNumber} (invoice p.${group.startPageNumber}) → label p.${
          match.labelIndex + 1
        } [${prettyPostcode(match.postcode)}] · evidence score ${match.score}`,
        "success",
      );
      if (match.ambiguousResolvedByOrder) {
        log(
          `Order ${group.orderNumber}: equal-score candidates — first label in file order was used.`,
        );
      }

      // Invoice page(s) first…
      const copiedInvoicePages = await matchedDoc.copyPages(invoiceDoc, group.pageIndices);
      copiedInvoicePages.forEach((page) => {
        matchedDoc.addPage(page);
        pages.push({
          role: "invoice",
          orderNumber: group.orderNumber,
          postcode: match.postcode,
        });
      });

      if (mode === "interleaved") {
        // …then the matched label as its very next full-size page. This is the
        // "invoice next to its label" layout requested.
        const copiedLabelPages = await matchedDoc.copyPages(labelDoc, [match.labelIndex]);
        copiedLabelPages.forEach((page) => {
          matchedDoc.addPage(page);
          pages.push({
            role: "label",
            orderNumber: group.orderNumber,
            postcode: match.postcode,
          });
        });
      } else {
        // Overlay mode: draw the label onto the first invoice page.
        const [embeddedLabelPage] = await matchedDoc.embedPdf(labelDoc, [match.labelIndex]);
        const firstPage = copiedInvoicePages[0];
        firstPage.drawPage(embeddedLabelPage, {
          x: overlay.posX,
          y: overlay.posY,
          width: overlay.labelWidth,
          height: overlay.labelHeight,
          rotate: degrees(overlay.rotation),
        });
        if (overlay.drawBorder) {
          firstPage.drawRectangle({
            x: overlay.posX,
            y: overlay.posY,
            width: overlay.labelWidth,
            height: overlay.labelHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
            rotate: degrees(overlay.rotation),
          });
        }
      }
    } else {
      unmatchedCount++;
      log(
        group.postcodes.length === 0
          ? `No match for order ${group.orderNumber} (starts p.${group.startPageNumber}) — no postcode found on its first page.`
          : `No match for order ${group.orderNumber} (starts p.${group.startPageNumber}).`,
        "error",
      );
      const copied = await unmatchedDoc.copyPages(invoiceDoc, group.pageIndices);
      copied.forEach((page) => unmatchedDoc.addPage(page));
    }
  }

  /* --- 5. Leftovers → failed report --- */
  const unusedIndices = [...unusedLabels].sort((a, b) => a - b);
  if (unusedIndices.length > 0) {
    const copied = await unusedLabelsDoc.copyPages(labelDoc, unusedIndices);
    copied.forEach((page) => unusedLabelsDoc.addPage(page));
  }

  const failedDoc = await PDFDocument.create();
  if (unmatchedDoc.getPageCount() > 0) {
    const copied = await failedDoc.copyPages(unmatchedDoc, unmatchedDoc.getPageIndices());
    copied.forEach((page) => failedDoc.addPage(page));
  }
  if (unusedLabelsDoc.getPageCount() > 0) {
    const copied = await failedDoc.copyPages(
      unusedLabelsDoc,
      unusedLabelsDoc.getPageIndices(),
    );
    copied.forEach((page) => failedDoc.addPage(page));
  }

  let matchedBytes: Uint8Array | null = null;
  if (matchedDoc.getPageCount() > 0) {
    if (mode === "interleaved") {
      const size = PAGE_SIZES[pageSize];
      log(
        `Normalizing all ${matchedDoc.getPageCount()} output page(s) to ${size.label} — scaled to fit, centered.`,
      );
      const normalizedDoc = await normalizeToPageSize(matchedDoc, size.width, size.height);
      matchedBytes = await normalizedDoc.save();
    } else {
      matchedBytes = await matchedDoc.save();
    }
  }
  const failedBytes = failedDoc.getPageCount() > 0 ? await failedDoc.save() : null;

  if (matchedBytes) {
    log(
      `Built combined document: ${matchedDoc.getPageCount()} pages (${matchesCount} order(s)${
        mode === "interleaved"
          ? `, invoice + label side by side @ ${PAGE_SIZES[pageSize].label}`
          : ", label overlaid"
      }).`,
      "success",
    );
  } else {
    log("No matches found — nothing to output.", "error");
  }

  return {
    matchedBytes,
    failedBytes,
    pages: mode === "interleaved" ? pages : pages.map((p) => ({ ...p })),
    stats: {
      invoices: groups.length,
      labels: labelsData.length,
      matches: matchesCount,
      unmatched: unmatchedCount,
      unused: unusedLabels.size,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Rebuilds a document so every page is exactly `targetWidth × targetHeight`.
 * Content is scaled uniformly to FIT and centered (letterboxed).
 *
 * Uses copyPages (preserves ALL fonts/images/resources), wraps content streams
 * in a transformation matrix on a new page. This is the most reliable approach
 * for pdf.js rendering.
 */
export async function normalizeToPageSize(
  src: PDFDocument,
  targetWidth: number,
  targetHeight: number,
): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  const indices = src.getPageIndices();
  if (indices.length === 0) return out;

  // Copy pages — preserves ALL content streams, fonts, images, resources
  const copied = await out.copyPages(src, indices);

  for (let i = 0; i < copied.length; i++) {
    const srcPage = copied[i];
    const srcW = srcPage.getWidth();
    const srcH = srcPage.getHeight();

    // Uniform scale to fit
    const scale = Math.min(targetWidth / srcW, targetHeight / srcH);
    const scaledW = srcW * scale;
    const scaledH = srcH * scale;
    const cx = (targetWidth - scaledW) / 2;
    const cy = (targetHeight - scaledH) / 2;

    // New page at target size
    const outPage = out.addPage([targetWidth, targetHeight]);

    // embedPage preserves all fonts/images/resources from the copied page
    const embedded = await out.embedPage(srcPage);

    // Draw scaled + centered
    outPage.drawPage(embedded, {
      x: cx,
      y: cy,
      width: scaledW,
      height: scaledH,
    });
  }

  return out;
}

export function dateStamp(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${d}-${m}-${now.getFullYear()}`;
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatKb(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(0)} KB`;
}
