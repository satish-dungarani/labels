import { useEffect, useRef, useState } from "react";
import { Check, Copy, TerminalSquare, Trash2 } from "lucide-react";
import { cn } from "../utils/cn";

export type LogType = "info" | "success" | "error";

export interface LogEntry {
  id: number;
  time: string;
  msg: string;
  type: LogType;
}

const COLORS: Record<LogType, string> = {
  info: "text-zinc-400",
  success: "text-emerald-300",
  error: "text-rose-400",
};

const PREFIX: Record<LogType, string> = {
  info: "  ",
  success: "✓ ",
  error: "✗ ",
};

interface LogPanelProps {
  logs: LogEntry[];
  onClear?: () => void;
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const copyLogs = async () => {
    try {
      const text = logs.map((e) => `[${e.time}] ${e.msg}`).join("\n");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <section className="diamond-card overflow-hidden rounded-xl">
      <header className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
            <i className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
            <TerminalSquare className="h-3.5 w-3.5" />
            activity log
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyLogs}
            title="Copy log"
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              title="Clear log"
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>
      <div
        ref={bodyRef}
        className="h-56 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed"
      >
        {logs.map((entry) => (
          <div key={entry.id} className={cn("flex gap-2", COLORS[entry.type])}>
            <span className="shrink-0 text-zinc-600">[{entry.time}]</span>
            <span className="shrink-0 text-zinc-600">{PREFIX[entry.type]}</span>
            <span className="break-words">{entry.msg}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1 text-zinc-600">
          <span className="text-orange-400/80">➜</span>
          <span className="text-emerald-400/80">~/satish-label</span>
          <span className="inline-block h-3.5 w-1.5 animate-pulse-glow bg-orange-400/50" />
        </div>
      </div>
    </section>
  );
}
