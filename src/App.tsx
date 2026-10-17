import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Stamp,
  Tag,
  XCircle,
} from "lucide-react";
import { Dropzone } from "./components/Dropzone";
import { LogPanel, type LogEntry, type LogType } from "./components/LogPanel";
import { OverlayControls } from "./components/OverlayControls";
import { Preview } from "./components/Preview";
import {
  dateStamp,
  downloadBytes,
  extractSkuBucket,
  mergePdfFiles,
  PAGE_SIZES,
  processDocuments,
  type FileBundle,
  type OutputMode,
  type OverlaySettings,
  type PageSizeId,
  type ProcessResult,
} from "./lib/engine";
import { cn } from "./utils/cn";

const INITIAL_LOGS: LogEntry[] = [
  {
    id: 0,
    time: new Date().toLocaleTimeString(),
    msg: "Ready — upload invoice & label PDFs to begin.",
    type: "info",
  },
];

const DEFAULT_OVERLAY: OverlaySettings = {
  posX: 420,
  posY: 50,
  labelWidth: 260,
  labelHeight: 380,
  rotation: 90,
  drawBorder: true,
};

// Keep the implementation available while preventing production use.
// Change to true when overlay mode is ready to be enabled again.
const OVERLAY_ENABLED = false;

export default function App() {
  const [invoices, setInvoices] = useState<FileBundle | null>(null);
  const [labels, setLabels] = useState<FileBundle | null>(null);
  const [busy, setBusy] = useState({ invoices: false, labels: false });
  const [mode, setMode] = useState<OutputMode>("interleaved");
  const [pageSize, setPageSize] = useState<PageSizeId>("4x6");
  const [overlay, setOverlay] = useState<OverlaySettings>(DEFAULT_OVERLAY);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [currentPage, setCurrentPage] = useState(1);
  const [skuLoading, setSkuLoading] = useState<string | null>(null);
  const logId = useRef(1);

  const log = useCallback((msg: string, type: LogType = "info") => {
    setLogs((prev) => [
      ...prev.slice(-199),
      { id: logId.current++, time: new Date().toLocaleTimeString(), msg, type },
    ]);
  }, []);

  const patchOverlay = useCallback(
    (patch: Partial<OverlaySettings>) =>
      setOverlay((prev) => ({ ...prev, ...patch })),
    [],
  );

  const loadBundle = useCallback(
    async (kind: "invoices" | "labels", files: File[]) => {
      setBusy((b) => ({ ...b, [kind]: true }));
      try {
        const bundle = await mergePdfFiles(files);
        if (kind === "invoices") setInvoices(bundle);
        else setLabels(bundle);
        log(
          `${kind === "invoices" ? "Invoices" : "Labels"} — ${files.length} file(s), ${bundle.pageCount} page(s).`,
          "success",
        );
      } catch (err) {
        log(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
      } finally {
        setBusy((b) => ({ ...b, [kind]: false }));
      }
    },
    [log],
  );

  const clearBundle = (kind: "invoices" | "labels") => {
    if (kind === "invoices") setInvoices(null);
    else setLabels(null);
  };

  const resetAll = () => {
    setInvoices(null);
    setLabels(null);
    setResult(null);
    setCurrentPage(1);
    setLogs(INITIAL_LOGS);
    logId.current = 1;
  };

  const clearLogs = () => {
    setLogs([]);
    logId.current = 1;
  };

  useEffect(() => {
    setResult(null);
    setCurrentPage(1);
  }, [invoices, labels, mode, pageSize]);

  const runProcess = async () => {
    if (!invoices || !labels || processing) return;
    setProcessing(true);
    log(`Starting match (${mode === "overlay" ? "overlay" : "stacked"} mode)…`);
    try {
      const res = await processDocuments(invoices, labels, mode, pageSize, overlay, log);
      setResult(res);
      setCurrentPage(1);
      log("Done.", "success");
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setProcessing(false);
    }
  };

  const ready = invoices !== null && labels !== null && !busy.invoices && !busy.labels;
  const totalPages = result?.pages.length ?? 0;
  const goToPage = useCallback(
    (n: number) => setCurrentPage(Math.max(1, Math.min(totalPages || 1, n))),
    [totalPages],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!result?.matchedBytes) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") goToPage(currentPage - 1);
      if (e.key === "ArrowRight") goToPage(currentPage + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, currentPage, goToPage]);

  const stats = result?.stats;

  /** Orders per SKU bucket (unique order numbers — not raw page count). */
  const bucketOrderCount = useCallback(
    (bucket: string) => {
      if (!result) return 0;
      return new Set(
        result.pages.filter((p) => p.skuBucket === bucket).map((p) => p.orderNumber),
      ).size;
    },
    [result],
  );

  return (
    <div className="relative min-h-screen bg-diamond-pattern">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(50%_40%_at_20%_10%,rgba(249,115,22,0.10),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_35%_at_85%_5%,rgba(6,182,212,0.09),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(35%_30%_at_50%_95%,rgba(16,185,129,0.06),transparent_70%)]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0b0f16]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/30 to-red-500/20 ring-1 ring-orange-400/25 glow-orange">
              <Layers className="h-5 w-5 text-orange-300" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold tracking-tight text-white">
                SATISH<span className="text-orange-400">-</span>LABEL
              </h1>
              <p className="hidden font-mono text-[9px] text-zinc-500 sm:block">
                invoice ↔ shipping-label combiner
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[10px] text-zinc-500 lg:flex">
              v2.0
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-medium text-emerald-300 md:flex">
              <ShieldCheck className="h-3 w-3" /> 100% local — files never leave this tab
            </span>
            {(invoices || labels || result) && (
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-zinc-300 transition-colors hover:bg-white/10"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-5 lg:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
          {/* ── Left column ── */}
          <div className="space-y-4">
            {/* Uploads */}
            <section className="diamond-card animate-fade-up rounded-xl p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500/15 font-mono text-[10px] font-bold text-orange-300 ring-1 ring-orange-400/20">1</span>
                Upload PDFs
              </h2>
              <div className="space-y-2">
                <Dropzone
                  accent="cyan"
                  icon={FileText}
                  title="Invoices"
                  hint="Drop or browse PDF files"
                  bundle={invoices}
                  busy={busy.invoices}
                  onSelect={(f) => loadBundle("invoices", f)}
                  onClear={() => clearBundle("invoices")}
                />
                <Dropzone
                  accent="emerald"
                  icon={Tag}
                  title="Labels"
                  hint="Drop or browse PDF files"
                  bundle={labels}
                  busy={busy.labels}
                  onSelect={(f) => loadBundle("labels", f)}
                  onClear={() => clearBundle("labels")}
                />
              </div>
            </section>

            {/* Layout */}
            <section className="diamond-card animate-fade-up rounded-xl p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500/15 font-mono text-[10px] font-bold text-orange-300 ring-1 ring-orange-400/20">2</span>
                Layout
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("interleaved")}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-all",
                    mode === "interleaved"
                      ? "border-orange-400/30 bg-orange-400/[0.12] ring-1 ring-orange-400/20 glow-orange"
                      : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]",
                  )}
                >
                  <Layers
                    className={cn(
                      "mb-1 h-3.5 w-3.5",
                      mode === "interleaved" ? "text-orange-300" : "text-zinc-500",
                    )}
                  />
                  <p className="text-xs font-bold text-zinc-100">Stacked pages</p>
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-500">INV → LBL → INV → LBL</p>
                </button>
                <button
                  type="button"
                  disabled={!OVERLAY_ENABLED}
                  onClick={() => OVERLAY_ENABLED && setMode("overlay")}
                  className={cn(
                    "relative rounded-xl border px-3 py-2.5 text-left transition-all",
                    OVERLAY_ENABLED && mode === "overlay"
                      ? "border-orange-400/30 bg-orange-400/[0.12] ring-1 ring-orange-400/20 glow-orange"
                      : OVERLAY_ENABLED
                        ? "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]"
                        : "cursor-not-allowed border-white/[0.06] bg-white/[0.01] opacity-40",
                  )}
                >
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-white/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-bold text-zinc-500 ring-1 ring-white/[0.08]">
                    DISABLED
                  </span>
                  <Stamp
                    className={cn(
                      "mb-1 h-3.5 w-3.5",
                      OVERLAY_ENABLED && mode === "overlay" ? "text-orange-300" : "text-zinc-500",
                    )}
                  />
                  <p className="text-xs font-bold text-zinc-100">Overlay</p>
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-500">Temporarily unavailable</p>
                </button>
              </div>

              {mode === "interleaved" && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-[9px] font-semibold tracking-wider text-zinc-500 uppercase">
                    Size — all output pages
                  </span>
                  <div className="relative">
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value as PageSizeId)}
                      className="diamond-input w-full appearance-none rounded-lg px-2.5 py-2 font-mono text-xs text-zinc-200"
                    >
                      {(Object.keys(PAGE_SIZES) as PageSizeId[]).map((id) => (
                        <option key={id} value={id} className="bg-slate-900">
                          {PAGE_SIZES[id].label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                  </div>
                </label>
              )}

              {OVERLAY_ENABLED && mode === "overlay" && (
                <OverlayControls value={overlay} onChange={patchOverlay} />
              )}
            </section>

            {/* Process */}
            <section className="diamond-card animate-fade-up rounded-xl p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500/15 font-mono text-[10px] font-bold text-orange-300 ring-1 ring-orange-400/20">3</span>
                Process
              </h2>
              <button
                type="button"
                onClick={runProcess}
                disabled={!ready || processing}
                className={
                  ready && !processing
                    ? "diamond-btn-primary w-full rounded-xl px-4 py-3 text-sm"
                    : "w-full cursor-not-allowed rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-zinc-500"
                }
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Matching…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Play className="h-4 w-4" />
                    {mode === "overlay" ? "Match & Stamp" : "Match & Generate"}
                  </span>
                )}
              </button>
              {processing && (
                <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="absolute top-0 bottom-0 left-0 w-1/5 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-orange-400 to-transparent" />
                </div>
              )}
              {!ready && !processing && (
                <p className="mt-2 text-center font-mono text-[9px] text-zinc-600">
                  {invoices ? "✓ invoices" : "· invoices"}  {labels ? "✓ labels" : "· labels"}
                </p>
              )}
            </section>

            {/* Results */}
            {stats && (
              <section className="diamond-card animate-fade-up rounded-xl p-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-2.5 py-2 glow-emerald">
                    <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-emerald-300 uppercase">
                      <CheckCircle2 className="h-3 w-3" /> Matched
                    </p>
                    <p className="font-display text-xl font-bold text-emerald-300">{stats.matches}</p>
                  </div>
                  <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.08] px-2.5 py-2">
                    <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-rose-300 uppercase">
                      <XCircle className="h-3 w-3" /> Unmatched
                    </p>
                    <p className="font-display text-xl font-bold text-rose-300">{stats.unmatched}</p>
                  </div>
                  <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.08] px-2.5 py-2">
                    <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-amber-300 uppercase">
                      <Archive className="h-3 w-3" /> Unused
                    </p>
                    <p className="font-display text-xl font-bold text-amber-300">{stats.unused}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <button
                    type="button"
                    disabled={!result?.matchedBytes}
                    onClick={() =>
                      result?.matchedBytes &&
                      downloadBytes(result.matchedBytes, `Combined_${dateStamp()}.pdf`)
                    }
                    className="diamond-btn-success w-full rounded-xl px-4 py-2.5 text-sm disabled:opacity-40"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Download className="h-4 w-4" /> Download ({stats.matches} orders)
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!result?.failedBytes}
                    onClick={() =>
                      result?.failedBytes &&
                      downloadBytes(result.failedBytes, `Failed_${dateStamp()}.pdf`)
                    }
                    className="diamond-btn-danger w-full rounded-xl border-none px-4 py-2 text-xs disabled:opacity-40"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5" /> Failed files
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* Section 4 — SKU Split */}
            {stats && result?.matchedBytes && result.skuBuckets.length > 0 && (
              <section className="diamond-card animate-fade-up rounded-xl p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500/15 font-mono text-[10px] font-bold text-orange-300 ring-1 ring-orange-400/20">4</span>
                  Split by SKU
                </h2>
                <p className="mb-3 text-[10px] text-zinc-500">
                  Download orders grouped by the first letter of their SKU prefix.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.skuBuckets.map((bucket) => {
                    const count = bucketOrderCount(bucket);
                    const isMixed = bucket === "Mixed";
                    const isLoading = skuLoading === bucket;
                    return (
                      <button
                        key={bucket}
                        type="button"
                        disabled={isLoading}
                        onClick={async () => {
                          if (!result?.matchedBytes) return;
                          setSkuLoading(bucket);
                          try {
                            const bytes = await extractSkuBucket(
                              result.matchedBytes,
                              result.pages,
                              bucket,
                            );
                            if (bytes) {
                              downloadBytes(bytes, `SKU_${bucket}_${dateStamp()}.pdf`);
                              log(
                                `SKU bucket ${bucket}: ${count} order(s) downloaded — sorted A→Z by SKU.`,
                                "success",
                              );
                            }
                          } catch {
                            log(`Failed to extract ${bucket} bucket.`, "error");
                          } finally {
                            setSkuLoading(null);
                          }
                        }}
                        className={
                          isMixed
                            ? "diamond-btn-mixed flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-50"
                            : "diamond-btn-primary flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-50"
                        }
                      >
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        {bucket}
                        <span className="font-mono text-[9px] opacity-60">({count} orders)</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="space-y-4">
            <Preview
              bytes={result?.matchedBytes ?? null}
              pages={result?.pages ?? []}
              currentPage={currentPage}
              onPageChange={goToPage}
            />
            <LogPanel logs={logs} onClear={clearLogs} />
          </div>
        </div>
      </main>

    </div>
  );
}
