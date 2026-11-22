"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { quadtree } from "d3";
import { useTheme } from "next-themes";
import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisProps,
  ChartContainer,
  formatValue,
  gridProps,
  still,
  TooltipCard,
} from "~/components/ui/chart";
import { HoverCard, powersOfTen } from "./svg";
import { useZoom, ZoomHint, type Zoom } from "./zoom";

interface PointGroup {
  label: string;
  color: string;
  points: { x: number; y: number; label: string }[];
}

const xTitle = (value: string) => ({
  value,
  position: "insideBottom" as const,
  offset: -12,
  fill: "var(--fg-muted)",
});

/**
 * Points colored by group, small and translucent so dense areas read as density. Log scales for
 * values spanning orders of magnitude; `diagonal` draws y = x (predicted = actual).
 */
export function ScatterPlot({
  groups,
  x,
  y,
  log,
  diagonal,
  height = 420,
}: {
  groups: PointGroup[];
  x: { title: string; unit: string };
  y: { title: string; unit: string };
  log?: boolean;
  diagonal?: [number, number];
  height?: number;
}) {
  const scale = log ? ("log" as const) : ("auto" as const);
  // Log axes span whole powers of ten, ticked at each one (Recharts' own log ticks are arbitrary).
  const all = useMemo(() => groups.flatMap((g) => g.points), [groups]);
  const decades = (vs: number[]) => {
    const pos = vs.filter((v) => v > 0);
    const lo = 10 ** Math.floor(Math.log10(Math.min(...pos)));
    const hi = 10 ** Math.ceil(Math.log10(Math.max(...pos)));
    return { domain: [lo, hi] as [number, number], ticks: powersOfTen(lo, hi) };
  };
  const linear = [(min: number) => Math.min(0, min), "auto"] as const;
  const xs = log && all.length ? decades(all.map((p) => p.x)) : undefined;
  const ys = log && all.length ? decades(all.map((p) => p.y)) : undefined;
  const { zoom, reset, handlers, layer } = useZoom("xy");
  const find = useRef<Finder | null>(null);
  const [hover, setHover] = useState<Hit | null>(null);
  // Recharts only needs the data's extent to lay out "auto" axes: two corner points stand in for
  // the thousands drawn on the canvas.
  const extent = useMemo(() => {
    if (!all.length) return [];
    const xsAll = all.map((p) => p.x);
    const ysAll = all.map((p) => p.y);
    return [
      { x: Math.min(...xsAll), y: Math.min(...ysAll) },
      { x: Math.max(...xsAll), y: Math.max(...ysAll) },
    ];
  }, [all]);
  // Zoomed: the dragged box, keeping the power-of-ten ticks inside it (or Recharts' own when
  // fewer than two fit).
  const axis = (
    range: Zoom["x"] | undefined,
    d: ReturnType<typeof decades> | undefined,
  ) => {
    if (!range) return { domain: d?.domain ?? linear, ticks: d?.ticks };
    const inside = d?.ticks.filter((t) => t >= range[0] && t <= range[1]);
    return {
      domain: range,
      ticks: inside && inside.length >= 2 ? inside : undefined,
      allowDataOverflow: true,
    };
  };
  return (
    <div>
      {/* The y title reads across, above its axis, instead of rotated beside the ticks. */}
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-fg-muted text-xs">↑ {y.title}</p>
        <ZoomHint zoomed={zoom !== null} reset={reset} />
      </div>
      <div
        {...handlers}
        onPointerMove={(e) => {
          handlers.onPointerMove(e);
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            find.current?.(e.clientX - r.left, e.clientY - r.top) ?? null,
          );
        }}
        onPointerLeave={() => {
          handlers.onPointerLeave();
          setHover(null);
        }}
        className="relative select-none"
      >
        <ChartContainer height={height - 20}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
            <CartesianGrid vertical={false} {...gridProps} />
            <XAxis
              type="number"
              dataKey="x"
              scale={scale}
              {...axis(zoom?.x, xs)}
              {...axisProps}
              label={xTitle(x.title)}
            />
            <YAxis
              type="number"
              dataKey="y"
              scale={scale}
              {...axis(zoom?.y, ys)}
              width={56}
              {...axisProps}
            />
            {diagonal && (
              <ReferenceLine
                segment={[
                  { x: diagonal[0], y: diagonal[0] },
                  { x: diagonal[1], y: diagonal[1] },
                ]}
                stroke="var(--fg-muted)"
                strokeDasharray="4 4"
                ifOverflow="hidden"
              />
            )}
            <Scatter data={extent} shape={() => <g />} {...still} />
            <PointsLayer groups={groups} find={find} hover={hover} />
            {layer}
          </ScatterChart>
        </ChartContainer>
        <HoverCard at={hover} width={Infinity}>
          {hover && (
            <TooltipCard
              title={hover.point.label}
              rows={[
                {
                  label: x.title,
                  value: `${formatValue(hover.point.x)} ${x.unit}`,
                },
                {
                  label: y.title,
                  value: `${formatValue(hover.point.y)} ${y.unit}`,
                },
              ]}
              footer={hover.group}
            />
          )}
        </HoverCard>
      </div>
    </div>
  );
}

type Hit = {
  point: PointGroup["points"][number];
  group: string;
  color: string;
  x: number;
  y: number;
};
type Finder = (px: number, py: number) => Hit | null;

/** "var(--chart-teal)" → its color, since a canvas can't read CSS variables. */
function resolveColor(color: string) {
  const m = /^var\((--[^)]+)\)$/.exec(color);
  return m
    ? getComputedStyle(document.documentElement).getPropertyValue(m[1]!).trim()
    : color;
}

/**
 * The points, drawn on one canvas over the plot area instead of thousands of SVG elements (which
 * took over half a second to build). Hover finds the nearest point through a quadtree.
 */
function PointsLayer({
  groups,
  find,
  hover,
}: {
  groups: PointGroup[];
  find: RefObject<Finder | null>;
  hover: Hit | null;
}) {
  const xs = useXAxisScale();
  const ys = useYAxisScale();
  const area = usePlotArea();
  const canvas = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  // Every point in pixels, kept to the plot area (a zoom leaves the rest outside).
  const placed = useMemo(() => {
    if (!xs || !ys || !area) return [];
    const out: Hit[] = [];
    for (const g of groups)
      for (const p of g.points) {
        const x = Number(xs(p.x));
        const y = Number(ys(p.y));
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          x >= area.x - 1 &&
          x <= area.x + area.width + 1 &&
          y >= area.y - 1 &&
          y <= area.y + area.height + 1
        )
          out.push({ point: p, group: g.label, color: g.color, x, y });
      }
    return out;
  }, [groups, xs, ys, area]);

  useEffect(() => {
    const tree = quadtree<Hit>()
      .x((h) => h.x)
      .y((h) => h.y)
      .addAll(placed);
    find.current = (px, py) => tree.find(px, py, 8) ?? null;
  }, [placed, find]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !area) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(area.width * dpr);
    el.height = Math.round(area.height * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, -area.x * dpr, -area.y * dpr);
    ctx.clearRect(area.x, area.y, area.width, area.height);
    ctx.globalAlpha = 0.55;
    const colors = new Map<string, string>();
    for (const h of placed) {
      let c = colors.get(h.color);
      if (!c) colors.set(h.color, (c = resolveColor(h.color)));
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [placed, area, resolvedTheme]);

  if (!area) return null;
  return (
    <g pointerEvents="none">
      <foreignObject
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
      >
        <canvas
          ref={canvas}
          style={{ width: area.width, height: area.height, display: "block" }}
        />
      </foreignObject>
      {hover && (
        <circle
          cx={hover.x}
          cy={hover.y}
          r={5}
          fill={hover.color}
          stroke="var(--fg)"
          strokeWidth={1.5}
        />
      )}
    </g>
  );
}
