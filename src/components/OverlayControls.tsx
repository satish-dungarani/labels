import { BoxSelect, Expand, MoveVertical, RotateCw, SquareDashed } from "lucide-react";
import { cn } from "../utils/cn";
import type { OverlaySettings } from "../lib/engine";

/* A4 in PDF points — the invoice canvas overlay coordinates refer to. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;

interface OverlayControlsProps {
  value: OverlaySettings;
  onChange: (patch: Partial<OverlaySettings>) => void;
}

/** Row: label + range slider + numeric input. */
function SliderRow({
  icon: Icon,
  label,
  min,
  max,
  step = 1,
  value,
  unit,
  onChange,
}: {
  icon: typeof MoveVertical;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-zinc-500 uppercase">
          <Icon className="h-3 w-3 text-zinc-600" />
          {label}
        </span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            value={Math.round(value)}
            min={min}
            max={max}
            onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
            className="diamond-input w-16 rounded-md px-1.5 py-0.5 text-right font-mono text-[10px] text-zinc-200"
          />
          <span className="font-mono text-[9px] text-zinc-600">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        className="git-range w-full"
      />
    </div>
  );
}

/**
 * Renders an A4 page map with the label drawn at its exact rotated geometry.
 * PDF coordinates are y-up with rotation pivoting CCW around (posX, posY);
 * the SVG flips the Y axis so it looks like a real page.
 */
function PlacementMap({ value }: { value: OverlaySettings }) {
  const { posX, posY, labelWidth: w, labelHeight: h, rotation } = value;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
    .map(([dx, dy]) => {
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return [posX + rx, posY + ry];
    })
    .map(([x, y]) => `${x.toFixed(1)},${(PAGE_H - y).toFixed(1)}`)
    .join(" ");

  return (
    <div className="relative mx-auto w-full max-w-[150px]">
      <svg
        viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
        className="w-full rounded-md bg-white/[0.04] ring-1 ring-white/10"
      >
        {/* Page edge */}
        <rect
          x="1"
          y="1"
          width={PAGE_W - 2}
          height={PAGE_H - 2}
          fill="none"
          stroke="rgba(148,163,184,0.25)"
          strokeWidth="2"
          rx="6"
        />
        {/* Center guides */}
        <line x1={PAGE_W / 2} y1="0" x2={PAGE_W / 2} y2={PAGE_H} stroke="rgba(148,163,184,0.08)" strokeWidth="2" strokeDasharray="10 8" />
        <line x1="0" y1={PAGE_H / 2} x2={PAGE_W} y2={PAGE_H / 2} stroke="rgba(148,163,184,0.08)" strokeWidth="2" strokeDasharray="10 8" />
        {/* Label outline */}
        <polygon
          points={corners}
          fill="rgba(249,115,22,0.18)"
          stroke="#fb923c"
          strokeWidth="3"
          strokeDasharray={value.drawBorder ? "none" : "14 10"}
        />
        {/* Anchor dot (the rotation pivot) */}
        <circle cx={posX} cy={PAGE_H - posY} r="7" fill="#fb923c" stroke="#0b0f16" strokeWidth="3" />
      </svg>
      <span className="absolute right-1 bottom-1 rounded bg-black/50 px-1 py-0.5 font-mono text-[8px] text-zinc-400">
        A4 · {rotation}°
      </span>
    </div>
  );
}

export function OverlayControls({ value, onChange }: OverlayControlsProps) {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-orange-400/15 bg-orange-400/[0.04] p-3">
      <PlacementMap value={value} />

      <SliderRow
        icon={MoveVertical}
        label="X — from left"
        min={0}
        max={Math.round(PAGE_W)}
        value={value.posX}
        unit="pt"
        onChange={(n) => onChange({ posX: n })}
      />
      <SliderRow
        icon={MoveVertical}
        label="Y — from bottom"
        min={0}
        max={Math.round(PAGE_H)}
        value={value.posY}
        unit="pt"
        onChange={(n) => onChange({ posY: n })}
      />
      <SliderRow
        icon={Expand}
        label="Width"
        min={40}
        max={Math.round(PAGE_W)}
        value={value.labelWidth}
        unit="pt"
        onChange={(n) => onChange({ labelWidth: n })}
      />
      <SliderRow
        icon={BoxSelect}
        label="Height"
        min={40}
        max={Math.round(PAGE_H)}
        value={value.labelHeight}
        unit="pt"
        onChange={(n) => onChange({ labelHeight: n })}
      />

      {/* Rotation */}
      <div>
        <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-zinc-500 uppercase">
          <RotateCw className="h-3 w-3 text-zinc-600" />
          Rotation
        </span>
        <div className="grid grid-cols-4 gap-1">
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => onChange({ rotation: deg })}
              className={cn(
                "rounded-lg border px-1 py-1.5 font-mono text-[10px] font-bold transition-all",
                value.rotation === deg
                  ? "border-orange-400/40 bg-orange-400/[0.14] text-orange-300 glow-orange"
                  : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.15] hover:text-zinc-300",
              )}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>

      {/* Border toggle */}
      <button
        type="button"
        onClick={() => onChange({ drawBorder: !value.drawBorder })}
        className="flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 transition-colors hover:border-white/[0.15]"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300">
          <SquareDashed className="h-3.5 w-3.5 text-zinc-500" />
          Draw border around label
        </span>
        <span
          className={cn(
            "relative h-4.5 w-8 rounded-full transition-colors",
            value.drawBorder ? "bg-orange-500/80" : "bg-white/10",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all",
              value.drawBorder ? "left-4" : "left-0.5",
            )}
          />
        </span>
      </button>

      <p className="font-mono text-[9px] leading-relaxed text-zinc-600">
        The label is stamped onto the first invoice page. Coordinates are PDF
        points (1/72″) on A4; the dot on the map is the rotation pivot.
      </p>
    </div>
  );
}
