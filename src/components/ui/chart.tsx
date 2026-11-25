"use client";

import { GlossedText, renderRich } from "~/components/ui/glossed-text";
import { useRef, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { InlineLoading, QueryError } from "~/components/ui/empty-state";
import { ExportButton } from "~/components/ui/export-button";
import type { ExportMetadata, ExportTable } from "~/lib/export-bundle";
import { cn, compactNumber } from "~/lib/utils";
import { formatStat } from "~/lib/analysis";
import { Swatch } from "~/components/ui/swatch";

/**
 * The chart system (shadcn/ui charts on Recharts): one palette, one axis style, one tooltip, and
 * one frame around every chart. Charts are quiet by default: horizontal gridlines only, no axis
 * lines or tick marks, no point markers, and color only where it means something (fuel, model,
 * sign).
 */

/**
 * Charts side by side: two columns on wide screens, one below. Every pair of charts on the site
 * uses it, so pairs line up the same way on every page.
 */
export function ChartGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-8 gap-y-6 xl:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

const PALETTE = [
  "var(--chart-slate)",
  "var(--chart-ochre)",
  "var(--chart-teal)",
  "var(--chart-rust)",
  "var(--chart-plum)",
  "var(--chart-olive)",
  "var(--chart-clay)",
  "var(--chart-sand)",
] as const;

/** The color of series `i` when nothing more meaningful (a fuel, a model) applies. */
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length]!;

/** One series: its key in the data rows, its label, and its color. */
export interface Series {
  key: string;
  label: string;
  color: string;
}

const plain = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 });

/** Axis ticks: "1.4B", "250K", "0.05". */
export const formatTick = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.abs(v) >= 1e4
      ? compactNumber.format(v)
      : plain.format(v)
    : typeof v === "string"
      ? v
      : "";

/** Tooltip and label values, as the readings write them: "1.23M", "9,193", "0.0123". */
export const formatValue = (v: unknown) =>
  formatStat(typeof v === "number" ? v : null);

const TICK = { fill: "var(--fg-muted)", fontSize: 12 };

/** Shared axis look: no line, no tick marks, muted labels. */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: TICK,
  tickMargin: 8,
  tickFormatter: formatTick,
} as const;

/** Shared grid look: faint dashed lines along the value axis only. */
export const gridProps = {
  stroke: "var(--edge)",
  strokeDasharray: "3 3",
  strokeOpacity: 0.8,
} as const;

/** Recharts animates on every data change; the charts redraw often (filters), so don't. */
export const still = { isAnimationActive: false } as const;

/** A sized, responsive drawing area for a Recharts chart. */
export function ChartContainer({
  height,
  children,
}: {
  height: number;
  children: React.ReactElement;
}) {
  return (
    <div
      className="w-full text-xs [&_.recharts-surface]:outline-none"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** One tooltip row: swatch, label, value. */
export interface TooltipRow {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

/** The shadcn tooltip card: a title and aligned rows. */
export function TooltipCard({
  title,
  rows,
  footer,
}: {
  title?: ReactNode;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="border-edge bg-surface text-fg min-w-36 rounded-md border px-2.5 py-1.5 text-xs shadow-md shadow-black/10">
      {title && <p className="mb-1 font-medium">{title}</p>}
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {r.color && <Swatch color={r.color} square />}
            <span className="text-fg-muted flex-1">{r.label}</span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
      {footer && <div className="text-fg-muted mt-1">{footer}</div>}
    </div>
  );
}

/** Small color chips naming the series, above a chart with more than one. */
function SeriesLegend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="text-fg-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <Swatch color={s.color} square />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Every computed style of `el` as an inline style string, so a copy looks the same anywhere. */
function inlineStyle(el: Element) {
  const css = getComputedStyle(el);
  return Array.from(
    css,
    (prop) => `${prop}:${css.getPropertyValue(prop)};`,
  ).join("");
}

/**
 * The chart area as a PNG (2×), whatever draws it: SVG (Recharts, D3), plain HTML (bar lists,
 * arrows), or a canvas (scatter points). The area is copied with its computed styles inlined, since
 * CSS variables and classes don't travel with an image, canvases become images of their pixels,
 * and the copy is drawn through an SVG `foreignObject` on the panel color. Undefined when the
 * browser can't render it (the download then holds the data and metadata only).
 */
async function chartPng(root: HTMLElement | null) {
  if (!root) return undefined;
  try {
    const { width, height } = root.getBoundingClientRect();
    if (!width || !height) return undefined;
    const copy = root.cloneNode(true) as HTMLElement;
    const live = [root, ...root.querySelectorAll("*")];
    const cloned = [copy, ...copy.querySelectorAll("*")];
    live.forEach((el, i) => {
      const target = cloned[i]!;
      if (el instanceof HTMLCanvasElement) {
        const img = document.createElement("img");
        img.src = el.toDataURL("image/png");
        img.setAttribute("style", inlineStyle(el));
        target.replaceWith(img);
      } else {
        target.setAttribute("style", inlineStyle(el));
      }
    });
    copy.style.margin = "0";
    const surface = getComputedStyle(document.documentElement).getPropertyValue(
      "--surface",
    );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${surface}"/><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(copy)}</foreignObject></svg>`;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/png"),
    );
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  } catch {
    // A browser that refuses to export a foreignObject drawing (a tainted canvas) still gets
    // the data and metadata.
    return undefined;
  }
}

/** A query's state as ChartFrame props: loading, error, and retry. */
export const queryStatus = (q: {
  isLoading: boolean;
  error: { message: string } | null;
  refetch: () => unknown;
}) => ({
  isLoading: q.isLoading,
  error: q.error,
  onRetry: () => void q.refetch(),
});

/**
 * Every chart's frame: title and one-line subtitle, the chart's own controls, a
 * download (CSV + PNG + metadata in a ZIP), an optional legend, and "About this chart" for the
 * method and caveats. No box: a hairline above separates charts.
 */
export function ChartFrame({
  title,
  subtitle,
  reading,
  note,
  actions,
  legend,
  table,
  meta,
  filename,
  isLoading,
  error,
  onRetry,
  height,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  /**
   * What the chart says, in a sentence or two ("**Switch to gas** cuts the most …"), set in body
   * text under the title so the numbers come with their meaning. `**…**` is bold.
   */
  reading?: string | (string | null | false | undefined)[];
  /** Method, definitions, and caveats, under "About this chart". */
  note?: ReactNode;
  actions?: ReactNode;
  legend?: Series[];
  table?: ExportTable;
  /** Added to the export's metadata.json, e.g. the definitions of the variables shown. */
  meta?: ExportMetadata;
  filename: string;
  isLoading?: boolean;
  /** A failed query: shown in place of the chart, with a retry. */
  error?: { message: string } | null;
  onRetry?: () => void;
  /** Reserved while loading, so the page doesn't jump. */
  height: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <figure
      className={cn("border-edge min-w-0 space-y-3 border-t pt-4", className)}
    >
      {/* The buttons share the title's line; the subtitle runs the full width under both. */}
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h3 className="text-fg min-w-0 flex-[1_1_14rem] text-base font-semibold text-balance">
            {title}
          </h3>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {actions}
            {table && (
              <ExportButton
                variant="ghost"
                label="Download"
                name={filename}
                title={title}
                table={table}
                meta={meta}
                png={() => chartPng(ref.current)}
              />
            )}
          </div>
        </div>
        {subtitle && (
          <p className="text-fg-muted text-[15px] text-pretty">
            <GlossedText>{subtitle}</GlossedText>
          </p>
        )}
      </header>
      {reading &&
        [reading]
          .flat()
          .filter(Boolean)
          .map((r, i) => (
            <p key={i} className="text-fg text-[15px] text-pretty">
              {renderRich(r as string)}
            </p>
          ))}
      {legend && <SeriesLegend series={legend} />}
      {/* The height is held only while there's no chart yet; charts size themselves. */}
      <div
        ref={ref}
        style={{ minHeight: isLoading || error ? height : undefined }}
      >
        {error ? (
          <QueryError error={error} onRetry={onRetry} />
        ) : isLoading ? (
          <InlineLoading title="Loading…" />
        ) : (
          children
        )}
      </div>
      {note && (
        <details className="text-fg-muted text-xs">
          <summary className="hover:text-fg-2 w-fit cursor-pointer">
            About this chart
          </summary>
          <div className="mt-1 space-y-1 text-sm text-pretty">
            <GlossedText>{note}</GlossedText>
          </div>
        </details>
      )}
    </figure>
  );
}
