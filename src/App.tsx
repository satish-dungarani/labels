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
import { cn } from "./utils/cn";
import { Dropzone } from "./components/Dropzone";
import { LogPanel, type LogEntry, type LogType } from "./components/LogPanel";
import { Preview } from "./components/Preview";
import {
  dateStamp,
  downloadBytes,
  mergePdfFiles,
  PAGE_SIZES,
  processDocuments,
  type FileBundle,
  type OutputMode,
  type OverlaySettings,
  type PageSizeId,
  type ProcessResult,
} from "./lib/engine";

const INITIAL_LOGS: LogEntry[] = [
  {
    id: 0,
    time: new Date().toLocaleTimeString(),
    msg: "Ready — upload invoice & label PDFs.",
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

export default function App() {
  const [invoices, setInvoices] = useState<FileBundle | null>(null);
  const [labels, setLabels] = useState<FileBundle | null>(null);
  const [busy, setBusy] = useState({ invoices: false, labels: false });
  const [mode, setMode] = useState<OutputMode>("interleaved");
  const [pageSize, setPageSize] = useState<PageSizeId>("a4");
  const [overlay, setOverlay] = useState<OverlaySettings>(DEFAULT_OVERLAY);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [currentPage, setCurrentPage] = useState(1);
  const logId = useRef(1);

  const log = useCallback((msg: string, type: LogType = "info") => {
    setLogs((prev) => [
      ...prev.slice(-199),
      { id: logId.current++, time: new Date().toLocaleTimeString(), msg, type },
    ]);
  }, []);

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

  useEffect(() => {
    setResult(null);
    setCurrentPage(1);
  }, [invoices, labels, mode, pageSize]);

  const runProcess = async () => {
    if (!invoices || !labels || processing) return;
    setProcessing(true);
    log("Starting match…");
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
  const goToPage = useCallback((n: number) => setCurrentPage(Math.max(1, Math.min(totalPages || 1, n))), [totalPages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!result?.matchedBytes) return;
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") goToPage(currentPage - 1);
      if (e.key === "ArrowRight") goToPage(currentPage + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, currentPage, goToPage]);

  const stats = result?.stats;

  return (
    <div className="relative min-h-screen">
      {/* Ambient bg */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,rgba(56,189,248,0.09),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(50%_45%_at_90%_10%,rgba(52,211,153,0.07),transparent_70%)]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07080c]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-2.5 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/25 to-emerald-400/25 ring-1 ring-white/15">
              <Layers className="h-4 w-4 text-sky-300" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold tracking-tight text-white">MatchMerge</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-zinc-400 md:flex">
              <ShieldCheck className="h-3 w-3 text-emerald-400" /> 100% local
            </span>
            {(invoices || labels || result) && (
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-zinc-300 transition-colors hover:bg-white/10"
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
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.06] font-mono text-[10px] font-bold text-zinc-400 ring-1 ring-white/10">1</span>
                Upload PDFs
              </h2>
              <div className="space-y-2">
                <Dropzone
                  accent="sky"
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
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.06] font-mono text-[10px] font-bold text-zinc-400 ring-1 ring-white/10">2</span>
                Layout
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("interleaved")}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-all",
                    mode === "interleaved"
                      ? "border-sky-400/50 bg-sky-400/[0.08] ring-1 ring-sky-400/25"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20",
                  )}
                >
                  <Layers className={cn("mb-1 h-3.5 w-3.5", mode === "interleaved" ? "text-sky-300" : "text-zinc-500")} />
                  <p className="text-xs font-bold text-zinc-100">Stacked pages</p>
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-500">INV → LBL → INV → LBL</p>
                </button>
                <button
                  type="button"
                  disabled
                  className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-3 py-2.5 text-left opacity-35 cursor-not-allowed"
                >
                  <Stamp className="mb-1 h-3.5 w-3.5 text-zinc-600" />
                  <p className="text-xs font-bold text-zinc-500">Overlay</p>
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-600">Coming soon</p>
                </button>
              </div>

              {mode === "interleaved" && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-[9px] font-semibold tracking-wider text-zinc-500 uppercase">Size — all output pages</span>
                  <div className="relative">
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value as PageSizeId)}
                      className="w-full appearance-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-sky-400/50"
                    >
                      {(Object.keys(PAGE_SIZES) as PageSizeId[]).map((id) => (
                        <option key={id} value={id}>{PAGE_SIZES[id].label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                  </div>
                </label>
              )}

              {mode === "overlay" && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["posX", "X"],
                      ["posY", "Y"],
                      ["labelWidth", "W"],
                      ["labelHeight", "H"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <span className="mb-0.5 block text-[9px] font-semibold text-zinc-500 uppercase">{label}</span>
                      <input
                        type="number"
                        value={overlay[key]}
                        onChange={(e) => setOverlay((o) => ({ ...o, [key]: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-emerald-400/50"
                      />
                    </label>
                  ))}
                  <label className="col-span-2 mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={overlay.drawBorder}
                      onChange={(e) => setOverlay((o) => ({ ...o, drawBorder: e.target.checked }))}
                      className="h-3 w-3 accent-emerald-400"
                    />
                    <span className="text-xs text-zinc-300">Draw border</span>
                  </label>
                  <label className="col-span-2">
                    <span className="mb-0.5 block text-[9px] font-semibold text-zinc-500 uppercase">Rotation</span>
                    <select
                      value={overlay.rotation}
                      onChange={(e) => setOverlay((o) => ({ ...o, rotation: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-emerald-400/50"
                    >
                      {[0, 90, 180, 270].map((r) => (<option key={r} value={r}>{r}°</option>))}
                    </select>
                  </label>
                </div>
              )}
            </section>

            {/* Process */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.06] font-mono text-[10px] font-bold text-zinc-400 ring-1 ring-white/10">3</span>
                Process
              </h2>
              <button
                type="button"
                onClick={runProcess}
                disabled={!ready || processing}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all",
                  ready && !processing
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "cursor-not-allowed bg-white/[0.06] text-zinc-500",
                )}
              >
                {processing ? (<><Loader2 className="h-4 w-4 animate-spin" /> Matching…</>) : (<><Play className="h-4 w-4" /> Match & Generate</>)}
              </button>
              {processing && (
                <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="absolute top-0 bottom-0 left-0 w-1/5 animate-scan-line rounded-full bg-gradient-to-r from-transparent via-sky-400 to-transparent" />
                </div>
              )}
            </section>

            {/* Results */}
            {stats && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] px-2.5 py-2">
                    <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-emerald-300/80 uppercase"><CheckCircle2 className="h-3 w-3" /> Matched</p>
                    <p className="font-display text-xl font-bold text-emerald-300">{stats.matches}</p>
                  </div>
                  <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-2.5 py-2">
                    <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-rose-300/70 uppercase"><XCircle className="h-3 w-3" /> Unmatched</p>
                    <p className="font-display text-xl font-bold text-rose-300">{stats.unmatched}</p>
                  </div>
                  <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-2.5 py-2">
                    <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-amber-300/70 uppercase"><Archive className="h-3 w-3" /> Unused</p>
                    <p className="font-display text-xl font-bold text-amber-300">{stats.unused}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <button
                    type="button"
                    disabled={!result?.matchedBytes}
                    onClick={() => result?.matchedBytes && downloadBytes(result.matchedBytes, `Combined_${dateStamp()}.pdf`)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-950 transition-all hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" /> Download ({stats.matches} orders)
                  </button>
                  <button
                    type="button"
                    disabled={!result?.failedBytes}
                    onClick={() => result?.failedBytes && downloadBytes(result.failedBytes, `Failed_${dateStamp()}.pdf`)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/[0.08] px-4 py-2 text-xs font-bold text-rose-300 transition-all hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Failed files
                  </button>
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
            <LogPanel logs={logs} />
          </div>
        </div>
      </main>
    </div>
  );
}
