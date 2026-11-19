"use client";

import { useState } from "react";
import { cn } from "~/lib/utils";

import {
  formatTick,
  formatValue,
  TooltipCard,
  type TooltipRow,
} from "~/components/ui/chart";

/** One bar of a BarList: its name, value, and optionally an interval, color, and tooltip extras. */
export interface BarRow {
  label: string;
  value: number | null;
  low?: number | null;
  high?: number | null;
  color?: string;
  /** Lighter: e.g. inputs outside the training data. */
  faded?: boolean;
  details?: TooltipRow[];
}

const ROW = 26;

/** Rough rendered width of the longest name, so the name column fits it (capped). */
const CHAR = 6.6;
/** Glyphs run wider than CHAR; `fit` cuts names by this wider measure, so the column uses it too. */
const NAME_CHAR = CHAR * 1.12;
const labelWidth = (rows: BarRow[], cap: number) =>
  Math.min(
    cap,
    Math.max(48, ...rows.map((r) => r.label.length * NAME_CHAR + 16)),
  );

/**
 * Horizontal bars in the given order, names on the left and values written at the bar ends, so
 * no value axis is needed. Negative values (coefficients) grow left from a zero line; intervals
 * draw as whiskers. Plain HTML sized in percent, so the bars arrive drawn with the page instead of
 * waiting for the browser to measure a chart.
 */
export function BarList({
  rows,
  color = "var(--chart-slate)",
  unit = "",
  format = formatTick,
}: {
  rows: BarRow[];
  color?: string;
  /** For the hover card; the chart's subtitle names it, so bar labels leave it out. */
  unit?: string;
  /** Bar-end labels: compact by default ("232M"); the hover card gives the full value. */
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const finite = rows
    .flatMap((r) => [r.value, r.high ?? null, r.low ?? null])
    .filter((v): v is number => v != null && Number.isFinite(v));
  const max = Math.max(0, ...finite);
  const min = Math.min(0, ...finite);
  const diverging = min < 0;
  const span = Math.max(max, -min) || 1;
  // Negative labels sit inside the 35 % of room left of zero; positive ones use a fixed margin
  // past the longest bar, so they fit however narrow the chart is.
  const lo = diverging ? -span * 1.35 : 0;
  const hi = diverging ? span : max || 1;
  const labelRoom =
    Math.max(...finite.map((v) => format(v).length), 1) * CHAR + 12;
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const full = (v: number) => `${formatValue(v)}${unit ? ` ${unit}` : ""}`;
  const nameColumn = `min(${labelWidth(rows, 300)}px, 46%)`;
  const shown = hover === null ? null : rows[hover];

  return (
    <div
      className="relative grid gap-x-2 text-[13px]"
      style={{ gridTemplateColumns: `${nameColumn} minmax(0, 1fr)` }}
      onPointerLeave={() => setHover(null)}
    >
      {rows.map((r, i) => {
        const v = r.value;
        const reach = Math.max(v ?? 0, r.high ?? v ?? 0);
        return (
          <div
            key={`${r.label}-${i}`}
            className={cn("contents", hover === i && "[&>*]:bg-surface-2/60")}
            onPointerEnter={() => setHover(i)}
          >
            <span
              className="text-fg-muted flex items-center justify-end truncate rounded-l-sm pr-2"
              style={{ height: ROW }}
              title={r.label}
            >
              <span className="truncate">{r.label}</span>
            </span>
            <div
              className="relative rounded-r-sm"
              style={{ height: ROW }}
              role="img"
              aria-label={`${r.label}: ${v == null ? "no value" : full(v)}`}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{ right: labelRoom }}
              >
                {diverging && (
                  <span
                    aria-hidden
                    className="bg-fg-muted/60 absolute inset-y-0 w-px"
                    style={{ left: `${at(0)}%` }}
                  />
                )}
                {v != null && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 h-[18px] -translate-y-1/2 rounded-[3px]"
                    style={{
                      left: `${at(Math.min(0, v))}%`,
                      width: `${at(Math.max(0, v)) - at(Math.min(0, v))}%`,
                      background: r.color ?? color,
                      opacity: r.faded ? 0.35 : 0.9,
                    }}
                  />
                )}
                {r.low != null && r.high != null && (
                  <span
                    aria-hidden
                    className="border-fg-2 absolute top-1/2 h-1.5 -translate-y-1/2 border-x-[1.25px]"
                    style={{
                      left: `${at(r.low)}%`,
                      width: `${at(r.high) - at(r.low)}%`,
                      background:
                        "linear-gradient(var(--fg-2), var(--fg-2)) center / 100% 1.25px no-repeat",
                    }}
                  />
                )}
                {v != null && (
                  <span
                    className="text-fg-2 absolute top-1/2 -translate-y-1/2 whitespace-nowrap tabular-nums"
                    style={
                      v < 0
                        ? { right: `calc(${100 - at(v)}% + 6px)` }
                        : { left: `calc(${at(reach)}% + 6px)` }
                    }
                  >
                    {format(v)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {shown && hover !== null && (
        <div
          className="pointer-events-none absolute z-10"
          style={{ top: (hover + 1) * ROW + 4, left: nameColumn }}
        >
          <TooltipCard
            title={shown.label}
            rows={[
              {
                label: "Value",
                value: shown.value == null ? "—" : full(shown.value),
                color: shown.color ?? color,
              },
              ...(shown.low != null && shown.high != null
                ? [
                    {
                      label: "95 % interval",
                      value: `${formatValue(shown.low)}–${formatValue(shown.high)}`,
                    },
                  ]
                : []),
              ...(shown.details ?? []),
            ]}
          />
        </div>
      )}
    </div>
  );
}
