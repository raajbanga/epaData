"use client";

import { useEffect, useMemo, useState } from "react";
import {
  geoAlbersUsa,
  geoPath,
  scaleSequential,
  type GeoPermissibleObjects,
} from "d3";
import * as topojson from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { formatTick, formatValue, TooltipCard } from "~/components/ui/chart";
import { STATE_NAMES } from "~/lib/describe-search";
import { colorRamp, HoverCard, useTokens, useWidth } from "./svg";

type StateShape = GeoPermissibleObjects & {
  properties: { name: string };
};

/** The U.S. state outlines (the Map page's file), loaded once per session. */
let shapes: Promise<StateShape[]> | undefined;
const loadShapes = () =>
  (shapes ??= fetch("/geo/us-states-10m.json")
    .then((r) => {
      if (!r.ok) throw new Error(`State outlines: HTTP ${r.status}`);
      return r.json() as Promise<
        Topology<{ states: GeometryCollection<{ name: string }> }>
      >;
    })
    .then(
      (topo) =>
        topojson.feature(topo, topo.objects.states)
          .features as unknown as StateShape[],
    )
    .catch((e: unknown) => {
      shapes = undefined; // the next map tries again
      throw e;
    }));

const TOKENS = ["surface-2", "chart-ochre", "chart-rust"] as const;
const RATIO = 0.62;

/**
 * A state choropleth: a warm ramp from the panel color through ochre to rust, states without a
 * value left as outlines, and a gradient key under the map.
 */
export function StateMap({
  values,
  unit,
  details,
}: {
  /** Postal code → value. */
  values: Record<string, number | null>;
  unit: string;
  /** Extra hover lines per state, e.g. its unit-year count. */
  details?: (code: string) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [states, setStates] = useState<StateShape[]>([]);
  const [hover, setHover] = useState<{
    code: string;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const t = useTokens(TOKENS);
  useEffect(() => {
    loadShapes().then(setStates, () => undefined); // no outlines: the values stay in the table
  }, []);
  const height = Math.round(width * RATIO);

  // The outlines are the expensive part (detailed shapes through a projection): computed once per
  // size, not on every pointer move.
  const outlines = useMemo(() => {
    if (!width || !states.length) return [];
    const path = geoPath(
      geoAlbersUsa().fitSize([width, height], {
        type: "FeatureCollection",
        features: states,
      } as GeoPermissibleObjects),
    );
    return states.map((s) => ({
      name: s.properties.name,
      code: STATE_NAMES[s.properties.name.toLowerCase()] ?? "",
      d: path(s) ?? "",
    }));
  }, [states, width, height]);

  // From 0, or from the lowest value of a variable that can be negative (a change).
  const [min, max] = useMemo(() => {
    const known = Object.values(values).filter((v): v is number => v != null);
    const lo = Math.min(0, ...known);
    const hi = Math.max(0, ...known);
    return [lo, hi === lo ? 1 : hi];
  }, [values]);
  const color = useMemo(
    () =>
      t &&
      scaleSequential(
        colorRamp([t["surface-2"], t["chart-ochre"], t["chart-rust"]]),
      ).domain([min, max]),
    [t, min, max],
  );

  // The filled states change only with the data, so hovering re-renders just the outline and card.
  const fills = useMemo(
    () =>
      color &&
      outlines.map((o) => {
        const v = values[o.code];
        return (
          <path
            key={o.name}
            d={o.d}
            data-code={o.code}
            data-name={o.name}
            fill={v == null ? "transparent" : color(v)}
            stroke="var(--edge)"
            strokeWidth={0.75}
          />
        );
      }),
    [outlines, values, color],
  );
  const hoveredOutline = hover && outlines.find((o) => o.name === hover.name);
  const hovered = hover && values[hover.code];
  return (
    <div className="space-y-2">
      <div
        ref={ref}
        className="relative w-full"
        style={{ height: height || 300 }}
      >
        {width > 0 && color && (
          <svg
            width={width}
            height={height}
            // One handler for the whole map: the state under the pointer names itself.
            onPointerMove={(e) => {
              const el = e.target as SVGElement;
              const code = el.dataset.code;
              const name = el.dataset.name;
              if (code === undefined || !name) return setHover(null);
              const box = e.currentTarget.getBoundingClientRect();
              setHover({
                code,
                name,
                x: e.clientX - box.left,
                y: e.clientY - box.top,
              });
            }}
            onPointerLeave={() => setHover(null)}
          >
            {fills}
            {hoveredOutline && (
              <path
                d={hoveredOutline.d}
                fill="none"
                stroke="var(--fg)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
          </svg>
        )}
        <HoverCard at={hover} width={width}>
          {hover && (
            <TooltipCard
              title={hover.name}
              rows={[
                {
                  label: unit,
                  value: hovered == null ? "No value" : formatValue(hovered),
                },
              ]}
              footer={details?.(hover.code)}
            />
          )}
        </HoverCard>
      </div>
      {color && (
        <div className="text-fg-muted flex items-center gap-2 text-xs">
          <span>{formatTick(min)}</span>
          <span
            className="h-2 w-40 rounded-full"
            style={{
              background: `linear-gradient(to right, ${color(min)}, ${color((min + max) / 2)}, ${color(max)})`,
            }}
          />
          <span>
            {formatTick(max)} {unit}
          </span>
        </div>
      )}
    </div>
  );
}
