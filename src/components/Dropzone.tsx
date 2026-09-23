import { useRef, useState } from "react";
import { Check, FileText, Loader2, UploadCloud, X, type LucideIcon } from "lucide-react";
import { cn } from "../utils/cn";
import { formatKb, type FileBundle } from "../lib/engine";

interface DropzoneProps {
  accent: "cyan" | "emerald" | "violet";
  icon: LucideIcon;
  title: string;
  hint: string;
  bundle: FileBundle | null;
  busy: boolean;
  onSelect: (files: File[]) => void;
  onClear: () => void;
}

const ACCENTS = {
  cyan: {
    iconTile: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/25",
    hover: "hover:border-cyan-400/40 hover:bg-cyan-400/[0.04]",
    drag: "border-cyan-400/60 bg-cyan-400/[0.07]",
    badge: "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/25",
    clearHover: "hover:text-cyan-300",
    ready: "border-cyan-400/30 bg-cyan-400/[0.08] glow-cyan",
  },
  emerald: {
    iconTile: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
    hover: "hover:border-emerald-400/40 hover:bg-emerald-400/[0.04]",
    drag: "border-emerald-400/60 bg-emerald-400/[0.07]",
    badge: "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/25",
    clearHover: "hover:text-emerald-300",
    ready: "border-emerald-400/30 bg-emerald-400/[0.08] glow-cyan",
  },
  violet: {
    iconTile: "bg-violet-400/10 text-violet-300 ring-violet-400/25",
    hover: "hover:border-violet-400/40 hover:bg-violet-400/[0.04]",
    drag: "border-violet-400/60 bg-violet-400/[0.07]",
    badge: "bg-violet-400/10 text-violet-300 ring-1 ring-violet-400/25",
    clearHover: "hover:text-violet-300",
    ready: "border-violet-400/30 bg-violet-400/[0.08] glow-violet",
  },
} as const;

export function Dropzone({
  accent,
  icon: Icon,
  title,
  hint,
  bundle,
  busy,
  onSelect,
  onClear,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const a = ACCENTS[accent];

  const pick = () => inputRef.current?.click();

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length > 0) onSelect(pdfs);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !bundle && !busy && pick()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !bundle && !busy) {
          e.preventDefault();
          pick();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!busy) handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "group relative rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3.5 transition-all duration-300 outline-none",
        !bundle && "cursor-pointer",
        !bundle && a.hover,
        dragging && a.drag,
        busy && "pointer-events-none opacity-70",
        bundle && a.ready,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {busy ? (
        <div className="flex items-center gap-3 py-0.5">
          <span className={cn("rounded-lg p-2 ring-1", a.iconTile)}>
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200">Merging PDFs…</p>
            <p className="text-xs text-zinc-500">Combining pages</p>
          </div>
        </div>
      ) : bundle ? (
        <div className="flex items-center gap-3 py-0.5">
          <span className={cn("rounded-lg p-2 ring-1", a.iconTile)}>
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-100">
              {bundle.fileCount === 1 ? bundle.names[0] : `${bundle.fileCount} files merged`}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
              {bundle.pageCount} page(s) · {formatKb(bundle.totalSize)}
            </p>
          </div>
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", a.badge)}>
            <Check className="h-3 w-3" /> READY
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className={cn(
              "rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5",
              a.clearHover,
            )}
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 py-0.5">
          <span
            className={cn(
              "rounded-lg p-2 ring-1 transition-transform duration-300 group-hover:scale-110",
              a.iconTile,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-200">{title}</p>
            <p className="text-xs text-zinc-500">{hint}</p>
          </div>
          <UploadCloud className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-400" />
        </div>
      )}
    </div>
  );
}
