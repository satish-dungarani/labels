import { useEffect, useRef } from "react";
import { TerminalSquare } from "lucide-react";
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

export function LogPanel({ logs }: { logs: LogEntry[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0c11]">
      <header className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <span className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <i className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
          <TerminalSquare className="h-3.5 w-3.5" />
          Activity log
        </span>
      </header>
      <div
        ref={bodyRef}
        className="h-56 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed"
      >
        {logs.map((entry) => (
          <div key={entry.id} className={cn("flex gap-2", COLORS[entry.type])}>
            <span className="shrink-0 text-zinc-600">[{entry.time}]</span>
            <span className="break-words">{entry.msg}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1 text-zinc-600">
          <span>›</span>
          <span className="inline-block h-3.5 w-1.5 animate-pulse-soft bg-zinc-500" />
        </div>
      </div>
    </section>
  );
}
