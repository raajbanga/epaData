"use client";

import { Lines } from "~/components/charts/lines";
import { ChartFrame } from "~/components/ui/chart";
import type { emissionsStory } from "~/lib/emissions-story";
import { formatStat } from "~/lib/analysis";
import { Swatch } from "~/components/ui/swatch";

type Story = NonNullable<ReturnType<typeof emissionsStory>>;

/** One color per pollutant, shared by the chart's lines and the explainers beside it. */
const POLLUTANT_COLORS = {
  so2: "var(--chart-ochre)",
  nox: "var(--chart-plum)",
  co2: "var(--chart-slate)",
} as const;

/**
 * The home page's chart: each pollutant as a share of its first-year amount, so three very
 * different tonnages can share one axis. 100 % is "the same as in 2015".
 */
export function HomeTrend({ story }: { story: Story }) {
  return (
    <ChartFrame
      title={`Each pollutant compared with ${story.from}`}
      subtitle={`The ${story.from} amount is 100 %. A line at 50 % means half as much as in ${story.from}.${story.partial ? ` ${story.partial} is still being reported, so it is left out.` : ""}`}
      filename="emissions-since-first-year"
      height={300}
      table={{
        head: [
          "year",
          ...story.pollutants.map((p) => `${p.key}_pct_of_${story.from}`),
        ],
        rows: story.rows.map((r) => [
          r.x,
          ...story.pollutants.map((p) => r[p.key]),
        ]),
      }}
    >
      <Lines
        data={story.rows}
        series={story.pollutants.map((p) => ({
          key: p.key,
          label: p.label,
          color: POLLUTANT_COLORS[p.key],
        }))}
        height={300}
        integerX
        xFormat={String}
        unit="%"
        refLines={[{ axis: "y", value: 100 }]}
      />
    </ChartFrame>
  );
}

/** What each pollutant is and does, in plain words, with its latest total and change. */
export function PollutantList({ story }: { story: Story }) {
  return (
    <ul className="divide-edge/70 divide-y">
      {story.pollutants.map((p) => (
        <li key={p.key} className="flex gap-3 py-4 first:pt-0">
          <Swatch color={POLLUTANT_COLORS[p.key]} className="mt-1.5 h-3 w-3" />
          <div className="min-w-0 space-y-1">
            <p className="text-fg font-medium">
              {p.label}{" "}
              <span className="text-fg-muted font-normal">({p.name})</span>
            </p>
            <p className="text-fg-2 text-[15px]">{p.what}</p>
            <p className="text-fg text-[15px] tabular-nums">
              {formatStat(p.last)} tons in {story.to},{" "}
              <strong className="font-semibold">
                {Math.round(Math.abs(p.pct))} % {p.pct < 0 ? "less" : "more"}
              </strong>{" "}
              than in {story.from}.
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
