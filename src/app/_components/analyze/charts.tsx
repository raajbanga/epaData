"use client";

import { Swatch } from "~/components/ui/swatch";
import { BarList } from "~/components/charts/bars";
import { BoxKey, BoxPlot, Histogram } from "~/components/charts/distribution";
import { HeatGrid } from "~/components/charts/heat-grid";
import { Lines } from "~/components/charts/lines";
import { ScatterPlot } from "~/components/charts/scatter";
import { StateMap } from "~/components/charts/state-map";
import {
  ChartFrame,
  ChartGrid,
  queryStatus,
  seriesColor,
  type Series,
} from "~/components/ui/chart";
import { Section } from "~/components/ui/report";
import { Takeaways } from "~/components/ui/takeaways";
import { QuestionSentence } from "~/components/ui/question-sentence";
import { TryExamples } from "~/components/ui/try-examples";
import { SegmentedControl } from "~/components/ui/segmented-control";
import {
  correlationMethodsReading,
  correlationSentence,
  correlationStrength,
  strongestPairs,
} from "~/lib/takeaways";
import { getFuelTheme } from "~/lib/map-utils";
import { formatNumber } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
  asDimension,
  bind,
  combinedLabel,
  DimensionField,
  dimensionLabel,
  findInfo,
  inSentence,
  Toggle,
  valueColumn,
  variableLabel,
  VariableField,
  type TabProps,
} from "./shared";

/**
 * The Analyze charts. Each one draws the tab's selection; the variable picker sits at the top of the
 * tab (shared by its charts), and each chart keeps only its own controls.
 */

/** Variables in the correlation heat map: the measured values and the main rates. */
const CORRELATION_VARIABLES = [
  "grossGenerationMWh",
  "heatInputMMBtu",
  "operatingHours",
  "nameplateCapacityMW",
  "co2MassTons",
  "so2MassTons",
  "noxMassTons",
  "co2Intensity",
  "noxRate",
  "heatRate",
  "capacityFactor",
];

/** Fuel classes keep the colors they have on the Map page; other groups take the palette in order. */
const groupColor = (dimension: string | undefined, group: string, i: number) =>
  dimension === "fuelClass" ? getFuelTheme(group).color : seriesColor(i);

/** "; the 8 largest of 15 groups" when a chart shows only part of its groups. */
const shownOf = (shown: number, total = 0, noun = "groups") =>
  total > shown
    ? `; the ${shown} largest of ${formatNumber(total)} ${noun}`
    : "";

/** "Total per year, short tons." */
const per = (info: ReturnType<typeof findInfo>, what: string) =>
  `${combinedLabel(info)} ${what}, ${info?.unit}`;

/** Line chart of the variable per year, one line per group. */
export function TrendChart(props: TabProps) {
  const { filters, view, catalog } = props;
  const info = findInfo(catalog, view.variable);
  const seriesBy = asDimension(view.series);
  const q = api.analysis.aggregate.useQuery({
    filters,
    variables: [view.variable],
    by: "year",
    seriesBy,
    limit: 8,
  });
  const rows = q.data?.rows ?? [];
  const names = [...new Set(rows.map((r) => r.series ?? "All"))];
  const series: Series[] = names.map((name, i) => ({
    key: `s${i}`,
    label: name,
    color: seriesBy ? groupColor(seriesBy, name, i) : "var(--chart-slate)",
  }));
  const years = [...new Set(rows.map((r) => Number(r.group)))].sort();
  const data = years.map((x) => ({
    x,
    ...Object.fromEntries(
      names.map((name, i) => [
        `s${i}`,
        rows.find((r) => Number(r.group) === x && (r.series ?? "All") === name)
          ?.values[view.variable] ?? null,
      ]),
    ),
  }));
  return (
    <ChartFrame
      title={`${info?.label} by year${seriesBy ? ` and ${inSentence(dimensionLabel(catalog, seriesBy))}` : ""}`}
      subtitle={`${per(info, "per year")}${seriesBy ? shownOf(8, q.data?.total) : ""}.`}
      note={info?.definition}
      actions={
        <DimensionField
          {...bind(props, "series")}
          label=""
          none="One line"
          exclude={["year", "facility", "unit"]}
          className="h-8 w-40"
        />
      }
      legend={series}
      filename={`trend-${view.variable}`}
      meta={{ variables: [info] }}
      height={320}
      {...queryStatus(q)}
      table={{
        head: ["year", "group", valueColumn(info), "unit_years"],
        rows: rows.map((r) => [
          r.group,
          r.series ?? "All",
          r.values[view.variable],
          r.n,
        ]),
      }}
    >
      <Lines
        data={data}
        series={series}
        integerX
        xFormat={String}
        unit={info?.unit}
      />
    </ChartFrame>
  );
}

/** Bars of the variable for every group of `by` (largest first), names beside the bars. */
export function BarsChart({
  by,
  limit = 30,
  reading,
  ...props
}: TabProps & { by: string; limit?: number; reading?: string }) {
  const { filters, view, catalog } = props;
  const info = findInfo(catalog, view.variable);
  const dimension = asDimension(by) ?? "state";
  const q = api.analysis.aggregate.useQuery({
    filters,
    variables: [view.variable],
    by: dimension,
    limit,
  });
  const rows = q.data?.rows ?? [];
  return (
    <ChartFrame
      title={`${info?.label} by ${inSentence(dimensionLabel(catalog, dimension))}`}
      subtitle={`${per(info, "over the selected years")}${shownOf(limit, q.data?.total)}.`}
      reading={reading}
      note={info?.definition}
      filename={`bars-${view.variable}-by-${dimension}`}
      meta={{ variables: [info] }}
      height={240}
      {...queryStatus(q)}
      table={{
        head: ["rank", dimension, valueColumn(info), "unit_years"],
        rows: rows.map((r, i) => [
          i + 1,
          r.group,
          r.values[view.variable],
          r.n,
        ]),
      }}
    >
      <BarList
        unit={info?.unit}
        rows={rows.map((r, i) => ({
          label: r.group,
          value: r.values[view.variable] ?? null,
          color:
            dimension === "fuelClass"
              ? groupColor(dimension, r.group, i)
              : undefined,
          details: [{ label: "Unit-years", value: r.n.toLocaleString() }],
        }))}
      />
    </ChartFrame>
  );
}

/** Rankings: the highest or lowest facilities or units, names beside the bars. */
export function RankingChart({
  limit = 15,
  ...props
}: TabProps & { limit?: number }) {
  const { filters, view, setView, catalog } = props;
  const info = findInfo(catalog, view.variable);
  const by = view.rankBy === "unit" ? "unit" : "facility";
  const order = view.order === "asc" ? "asc" : "desc";
  const q = api.analysis.aggregate.useQuery({
    filters,
    variables: [view.variable],
    by,
    order,
    limit,
  });
  const rows = q.data?.rows ?? [];
  const noun = by === "unit" ? "units" : "facilities";
  return (
    <ChartFrame
      title={`${order === "desc" ? "Highest" : "Lowest"} ${limit} ${noun} by ${info?.label}`}
      subtitle={`${per(info, "over the selected years")}, of ${formatNumber(q.data?.total)} ${noun}.`}
      note={info?.definition}
      actions={
        <>
          <SegmentedControl
            value={by}
            onChange={(rankBy) => setView({ rankBy })}
            options={[
              { value: "facility", label: "Facilities" },
              { value: "unit", label: "Units" },
            ]}
          />
          <SegmentedControl
            value={order}
            onChange={(o) => setView({ order: o })}
            options={[
              { value: "desc", label: "Highest" },
              { value: "asc", label: "Lowest" },
            ]}
          />
        </>
      }
      filename={`ranking-${view.variable}-${by}-${order}`}
      meta={{ variables: [info] }}
      height={limit * 26}
      {...queryStatus(q)}
      table={{
        head: ["rank", by, valueColumn(info), "unit_years"],
        rows: rows.map((r, i) => [
          i + 1,
          r.group,
          r.values[view.variable],
          r.n,
        ]),
      }}
    >
      <BarList
        unit={info?.unit}
        rows={rows.map((r) => ({
          label: r.group,
          value: r.values[view.variable] ?? null,
          details: [{ label: "Unit-years", value: r.n.toLocaleString() }],
        }))}
      />
    </ChartFrame>
  );
}

/** Histogram (one line per group) or box plot of the unit-year values. */
export function DistributionChart(props: TabProps) {
  const { filters, view, setView, catalog } = props;
  const info = findInfo(catalog, view.variable);
  // Facilities and units are too many to draw one shape each.
  const by = /facility|unit/.test(view.by) ? undefined : asDimension(view.by);
  // Overlaid histograms of many groups are unreadable: grouped views default to box plots.
  const box = view.box === "1" || (view.box === "" && Boolean(by));
  const log = view.log === "1";
  const q = api.analysis.distribution.useQuery({
    filters,
    variable: view.variable,
    by,
  });
  const groups = (q.data?.groups ?? []).map((g, i) => ({
    label: g.group,
    values: g.values,
    // Boxes stand apart by position, so only fuel (which has its own colors) gets color.
    color:
      by && (!box || by === "fuelClass")
        ? groupColor(by, g.group, i)
        : "var(--chart-slate)",
  }));
  // A log axis can't show zero or negative values: they are left out and counted in the note.
  const dropped = log
    ? groups.reduce((n, g) => n + g.values.filter((x) => x <= 0).length, 0)
    : 0;
  return (
    <ChartFrame
      title={`Distribution of ${info?.label}${by ? ` by ${inSentence(dimensionLabel(catalog, by))}` : ""}`}
      subtitle={`${formatNumber(q.data?.total)} unit-years with a value, in ${info?.unit}${by ? "; the 12 groups with the most" : ""}. ${box ? "Each box shows how one group's unit-years spread out; the key below says how to read it." : "Each bar counts the unit-years whose value falls in that range, so tall bars are common values."}`}
      note={[
        q.data?.sampled && "An even sample of 20,000 unit-years is drawn.",
        dropped &&
          `${formatNumber(dropped)} values ≤ 0 are left out on the log scale.`,
        info?.definition,
      ]
        .filter(Boolean)
        .join(" ")}
      actions={
        <>
          <SegmentedControl
            value={box ? "box" : "histogram"}
            onChange={(v) => setView({ box: v === "box" ? "1" : "0" })}
            options={[
              {
                value: "histogram",
                label: "Histogram",
                title: "How many unit-years fall in each range of values.",
              },
              {
                value: "box",
                label: "Box plot",
                title:
                  "Per group: the box is the middle half of the values, the line the median, and the whiskers the usual range; dots beyond are unusual.",
              },
            ]}
          />
          <Toggle
            {...bind(props, "log")}
            label=""
            off="Linear"
            on="Log"
            titles={[
              "Equal steps on the axis are equal amounts.",
              "Each step is 10× the last, so small and very large values both show.",
            ]}
          />
        </>
      }
      legend={box ? undefined : groups.map((g) => ({ key: g.label, ...g }))}
      filename={`distribution-${view.variable}`}
      meta={{ variables: [info], sampled: q.data?.sampled }}
      height={340}
      {...queryStatus(q)}
      table={{
        head: ["group", valueColumn(info)],
        rows: groups.flatMap((g) => g.values.map((v) => [g.label, v])),
      }}
    >
      {box ? (
        <>
          <BoxKey />
          <BoxPlot groups={groups} log={log} unit={info?.unit} />
        </>
      ) : (
        <Histogram groups={groups} log={log} unit={info?.unit} />
      )}
    </ChartFrame>
  );
}

/** Scatter of two variables over unit-years, colored by a dimension. */
/** One-click scatter questions. */
const SCATTER_EXAMPLES = [
  {
    label: "NOₓ vs heat input by fuel",
    x: "heatInputMMBtu",
    y: "noxMassTons",
    color: "fuelClass",
    log: "1",
  },
  {
    label: "NOₓ rate vs capacity factor by NOₓ control",
    x: "capacityFactor",
    y: "noxRate",
    color: "noxControl",
    log: "",
  },
  {
    label: "CO₂ vs operating time by unit type",
    x: "operatingHours",
    y: "co2MassTons",
    color: "unitType",
    log: "1",
  },
];

export function ScatterChart(props: TabProps) {
  const { filters, view, setView, catalog } = props;
  const x = findInfo(catalog, view.x);
  const y = findInfo(catalog, view.y);
  const color = asDimension(view.color) ?? "fuelClass";
  const log = view.log === "1";
  const q = api.analysis.scatter.useQuery({
    filters,
    x: view.x,
    y: view.y,
    color,
  });
  const points = q.data?.points ?? [];
  const groups = [...new Set(points.map((p) => p.group))]
    .slice(0, 10)
    .map((group, i) => ({
      label: group,
      color: groupColor(color, group, i),
      points: points
        .filter((p) => p.group === group && (!log || (p.x > 0 && p.y > 0)))
        .map((p) => ({ x: p.x, y: p.y, label: p.label })),
    }));
  return (
    <div className="space-y-4">
      <QuestionSentence label="Relationship question">
        <span>How does</span>
        <VariableField {...bind(props, "y")} label="Y axis" inline />
        <span>move with</span>
        <VariableField {...bind(props, "x")} label="X axis" inline />
        <span className="-ml-1.5">, colored by</span>
        <DimensionField
          {...bind(props, "color")}
          label="Color by"
          exclude={["unit", "facility", "state"]}
          inline
        />
        <span className="-ml-1.5">?</span>
      </QuestionSentence>
      <TryExamples
        examples={SCATTER_EXAMPLES.map(({ label, ...patch }) => ({
          label,
          onSelect: () => setView(patch),
        }))}
      />
      <ChartFrame
        title={`${y?.label} against ${inSentence(x?.label ?? "")}`}
        subtitle={`${correlationSentence(q.data?.r, x?.label ?? "", y?.label ?? "") ?? ""} ${formatNumber(q.data?.total)} unit-years with both values.`}
        actions={
          <SegmentedControl
            value={view.log === "1" ? "1" : "0"}
            onChange={(v) => setView({ log: v === "1" ? "1" : "" })}
            options={[
              {
                value: "0",
                label: "Linear",
                title: "Equal steps on each axis are equal amounts.",
              },
              {
                value: "1",
                label: "Log–log",
                title:
                  "Each step on both axes is 10× the last, so small and large plants both show.",
              },
            ]}
          />
        }
        note={[
          q.data &&
            q.data.total > points.length &&
            `An even sample of ${formatNumber(points.length)} is drawn; r uses all of them.`,
          log &&
            "Values of 0 or less can't be drawn on log scales and are left out.",
          "Correlation is association, not cause.",
        ]
          .filter(Boolean)
          .join(" ")}
        legend={groups.map((g) => ({ key: g.label, ...g }))}
        filename={`scatter-${view.y}-vs-${view.x}`}
        meta={{ variables: [x, y], pearsonR: q.data?.r, pairs: q.data?.total }}
        height={440}
        {...queryStatus(q)}
        table={{
          head: ["unit_year", color, valueColumn(x), valueColumn(y)],
          rows: points.map((p) => [p.label, p.group, p.x, p.y]),
        }}
      >
        <ScatterPlot
          groups={groups}
          log={log}
          height={440}
          x={{ title: variableLabel(x), unit: x?.unit ?? "" }}
          y={{ title: variableLabel(y), unit: y?.unit ?? "" }}
        />
      </ChartFrame>
    </div>
  );
}

/**
 * How closely each pair of measurements moves together, measured two ways side by side: by
 * amount (Pearson) and by rank (Spearman), so the reader sees whether a few huge units drive it.
 */
export function CorrelationChart({ filters, catalog }: TabProps) {
  const byAmount = api.analysis.correlation.useQuery({
    filters,
    variables: CORRELATION_VARIABLES,
    method: "pearson",
  });
  const byRank = api.analysis.correlation.useQuery({
    filters,
    variables: CORRELATION_VARIABLES,
    method: "spearman",
  });
  const infos = CORRELATION_VARIABLES.map((k) => findInfo(catalog, k));
  const labels = infos.map((v, i) => v?.label ?? CORRELATION_VARIABLES[i]!);
  const pairs = strongestPairs(labels, byAmount.data?.matrix ?? []);
  const panels = [
    {
      q: byAmount,
      method: "pearson",
      title: "Measured by amount",
      subtitle:
        "Do bigger amounts of one come with bigger amounts of the other, in a straight line? (Pearson)",
    },
    {
      q: byRank,
      method: "spearman",
      title: "Measured by rank",
      subtitle:
        "Do units that rank higher on one also rank higher on the other? A few giant units count less. (Spearman)",
    },
  ] as const;
  return (
    <Section
      title="Which measurements move together?"
      note="Each square compares two measurements across all the unit-years picked above. Hover a square for the exact number and how many unit-years it uses. Moving together is not proof that one causes the other."
    >
      <div className="space-y-4">
        <div className="text-fg-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {[
            ["var(--chart-rust)", "+1: they rise together"],
            ["var(--surface-2)", "0: no link"],
            ["var(--chart-slate)", "−1: one rises as the other falls"],
          ].map(([color, label]) => (
            <span key={label} className="flex items-center gap-2">
              <Swatch
                color={color!}
                square
                className="border-edge h-4 w-4 rounded-sm border"
              />
              {label}
            </span>
          ))}
        </div>
        <Takeaways
          items={[
            pairs.strongest[0] &&
              `The closest pair is **${pairs.strongest[0].a}** and **${pairs.strongest[0].b}** (${pairs.strongest[0].r.toFixed(2)}): when one is high, the other almost always is too.`,
            pairs.negative &&
              `The most opposite pair is **${pairs.negative.a}** and **${pairs.negative.b}** (${pairs.negative.r.toFixed(2)}), and that link is ${correlationStrength(pairs.negative.r).replace(/^an? /, "")}.`,
            byAmount.data &&
              byRank.data &&
              correlationMethodsReading(
                labels,
                byAmount.data.matrix,
                byRank.data.matrix,
              ),
          ].filter((x): x is string => Boolean(x))}
        />
        <ChartGrid>
          {panels.map(({ q, method, title, subtitle }) => (
            <ChartFrame
              key={method}
              title={title}
              subtitle={subtitle}
              filename={`correlation-${method}`}
              meta={{ variables: infos, method, pairCounts: q.data?.n }}
              height={420}
              {...queryStatus(q)}
              table={{
                head: ["variable", ...CORRELATION_VARIABLES],
                rows: (q.data?.matrix ?? []).map((row, i) => [
                  CORRELATION_VARIABLES[i],
                  ...row,
                ]),
              }}
            >
              <HeatGrid
                labels={labels}
                matrix={q.data?.matrix ?? []}
                counts={q.data?.n}
              />
            </ChartFrame>
          ))}
        </ChartGrid>
      </div>
    </Section>
  );
}

/** State choropleth of the variable. */
export function MapChart(props: TabProps) {
  const { filters, view, catalog } = props;
  const info = findInfo(catalog, view.variable);
  const q = api.analysis.aggregate.useQuery({
    filters,
    variables: [view.variable],
    by: "state",
    limit: 60,
  });
  const rows = q.data?.rows ?? [];
  return (
    <ChartFrame
      title={`${info?.label} by state`}
      subtitle={`${per(info, "per state")}. **Darker means more**; states with only an outline have no data.`}
      note={<>{info?.definition} For facility locations, see the Map page.</>}
      filename={`map-${view.variable}`}
      meta={{ variables: [info] }}
      height={320}
      {...queryStatus(q)}
      table={{
        head: ["state", valueColumn(info), "unit_years"],
        rows: rows.map((r) => [r.group, r.values[view.variable], r.n]),
      }}
    >
      <StateMap
        unit={info?.unit ?? ""}
        values={Object.fromEntries(
          rows.map((r) => [r.group, r.values[view.variable] ?? null]),
        )}
        details={(code) => {
          const n = rows.find((r) => r.group === code)?.n;
          return n ? `${n.toLocaleString()} unit-years` : "";
        }}
      />
    </ChartFrame>
  );
}
