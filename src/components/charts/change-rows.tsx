import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * One arrow per row, from a starting value to an ending value on a shared axis zoomed to the values, with an
 * optional dashed reference line (e.g. what was actually reported). Reads as "it goes from here to
 * there", which a pair of bars doesn't.
 */
export function ArrowRows({
  rows,
  reference,
  format,
}: {
  rows: {
    label: string;
    from: number;
    to: number;
    color: string;
    /** Shown after the values, e.g. "+6 %". */
    note?: string;
  }[];
  reference?: { value: number; label: string };
  format: (v: number) => string;
}) {
  // Zoomed to the values (not from zero), so a 6 % change is a visible arrow.
  const values = [
    ...(reference ? [reference.value] : []),
    ...rows.flatMap((r) => [r.from, r.to]),
  ];
  const span =
    Math.max(...values) - Math.min(...values) || Math.max(...values) || 1;
  const min = Math.max(0, Math.min(...values) - span * 0.15);
  const max = Math.max(...values) + span * 0.15;
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const lo = Math.min(r.from, r.to);
        const hi = Math.max(r.from, r.to);
        const up = r.to >= r.from;
        return (
          <div
            key={r.label}
            className="grid grid-cols-[10.5rem_minmax(0,1fr)] items-center gap-4"
          >
            <div className="min-w-0">
              <p className="text-fg-2 truncate text-sm">{r.label}</p>
              <p className="text-fg text-sm whitespace-nowrap tabular-nums">
                {format(r.from)} →{" "}
                <strong className="font-semibold">{format(r.to)}</strong>
                {r.note && <span className="text-fg-muted"> ({r.note})</span>}
              </p>
            </div>
            <div className="relative h-11">
              {reference && (
                <span
                  aria-hidden
                  className="border-fg-muted absolute inset-y-0 border-l border-dashed"
                  style={{ left: at(reference.value) }}
                />
              )}
              <span
                aria-hidden
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-70"
                style={{
                  left: at(lo),
                  width: `calc(${at(hi)} - ${at(lo)})`,
                  background: r.color,
                }}
              />
              {/* Start: hollow dot. End: arrowhead. */}
              <span
                aria-hidden
                className="bg-canvas absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{ left: at(r.from), borderColor: r.color }}
              />
              <span
                aria-hidden
                className="absolute top-1/2 h-0 w-0 -translate-y-1/2 border-y-[7px] border-y-transparent"
                style={{
                  left: at(r.to),
                  ...(up
                    ? { borderLeft: `10px solid ${r.color}`, marginLeft: -4 }
                    : { borderRight: `10px solid ${r.color}`, marginLeft: -6 }),
                }}
              />
            </div>
          </div>
        );
      })}
      {reference && (
        <div className="grid grid-cols-[10.5rem_minmax(0,1fr)] gap-4">
          <span />
          <div className="text-fg-muted relative h-5 text-xs tabular-nums">
            <span
              className={cn(
                "text-fg-2 bg-canvas absolute top-0 px-1 whitespace-nowrap",
                // Near an edge, the label hangs inward so it isn't cut off.
                (reference.value - min) / (max - min) > 0.65
                  ? "-translate-x-full"
                  : (reference.value - min) / (max - min) < 0.35
                    ? ""
                    : "-translate-x-1/2",
              )}
              style={{ left: at(reference.value) }}
            >
              ┆ {reference.label}
            </span>
          </div>
        </div>
      )}
      <div className="text-fg-muted flex flex-wrap gap-x-5 gap-y-1 pt-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="border-fg-muted h-2.5 w-2.5 rounded-full border-2" />
          predicted now
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-l-fg-muted h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent" />
          predicted after the change
        </span>
        {reference && (
          <span className="flex items-center gap-1.5">
            <span className="border-fg-muted h-3 border-l border-dashed" />
            actually reported
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Rows of changes, each with a plain description and one bar per series around a center line:
 * left is less, right is more. The highlighted row stands out (e.g. the question asked). A bar
 * with no value (a percentage from 0) is a short hatched stub on the side of `sign`, labeled with
 * its `text`, so it reads as "a change with no percentage", never as "no change".
 */
export function DivergingRows({
  rows,
  less,
  more,
  format,
}: {
  rows: {
    label: string;
    description?: ReactNode;
    highlight?: boolean;
    bars: {
      key: string;
      value: number | null;
      /** A bar with no value: which way it moves (0: not at all) and what it says instead. */
      sign?: number;
      text?: string;
      color: string;
      title?: string;
    }[];
  }[];
  less: string;
  more: string;
  format: (v: number) => string;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((r) => r.bars.map((b) => Math.abs(b.value ?? 0))),
  );
  const width = (v: number) => `${(Math.abs(v) / max) * 50}%`;
  // A change too small to show in tenths of a percent still isn't "no change" unless it is 0.
  const label = (v: number) =>
    v === 0 ? "no change" : Math.abs(v) < 0.05 ? "< 0.1 %" : format(v);
  return (
    <div className="space-y-1">
      <div className="text-fg-muted grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 text-xs">
        <span />
        <div className="flex justify-between">
          <span>← {less}</span>
          <span>{more} →</span>
        </div>
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className={cn(
            "-mx-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 rounded-sm px-2 py-2",
            r.highlight && "bg-primary/[0.07] ring-primary/30 ring-1",
          )}
        >
          <div className="min-w-0">
            <p
              className={cn("text-fg text-sm", r.highlight && "font-semibold")}
            >
              {r.label}
              {r.highlight && (
                <span className="text-primary font-normal">
                  {" "}
                  · your question
                </span>
              )}
            </p>
            {r.description && (
              <p className="text-fg-muted text-sm">{r.description}</p>
            )}
          </div>
          <div className="relative space-y-1">
            <span
              aria-hidden
              className="bg-fg-muted/50 absolute inset-y-0 left-1/2 w-px"
            />
            {r.bars.map((b) => {
              const empty = b.value === null;
              const left = empty ? (b.sign ?? 0) < 0 : b.value! < 0;
              // No percentage: a fixed stub, hatched, unless nothing moves at all.
              const w = empty ? (b.sign ? "6%" : "0%") : width(b.value!);
              return (
                <div key={b.key} className="relative h-4" title={b.title}>
                  <span
                    className="absolute inset-y-0.5 rounded-[2px]"
                    style={{
                      width: w,
                      ...(left ? { right: "50%" } : { left: "50%" }),
                      background: empty
                        ? `repeating-linear-gradient(45deg, ${b.color} 0 3px, transparent 3px 6px)`
                        : b.color,
                      ...(empty && { boxShadow: `inset 0 0 0 1px ${b.color}` }),
                    }}
                  />
                  <span
                    className="text-fg-2 absolute top-1/2 -translate-y-1/2 text-[11px] whitespace-nowrap tabular-nums"
                    style={
                      left
                        ? { right: `calc(50% + ${w} + 4px)` }
                        : { left: `calc(50% + ${w} + 4px)` }
                    }
                  >
                    {empty ? b.text : label(b.value!)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
