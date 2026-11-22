"use client";

import { useState } from "react";
import { BarList } from "~/components/charts/bars";
import { ChartFrame } from "~/components/ui/chart";
import { QuestionSentence } from "~/components/ui/question-sentence";
import { Takeaways } from "~/components/ui/takeaways";
import { InlineLoading, QueryError } from "~/components/ui/empty-state";
import { Disclosure, ReportTable, Section } from "~/components/ui/report";
import { TryExamples } from "~/components/ui/try-examples";
import { formatPct, formatStat, GROUP_EXPLAIN } from "~/lib/analysis";
import { compareSentences } from "~/lib/takeaways";
import { cn, formatNumber } from "~/lib/utils";
import { api } from "~/trpc/react";
import { FacilitySearch } from "../facility-search";
import { BarsChart } from "./charts";
import {
  asDimension,
  bind,
  combinedLabel,
  DimensionField,
  dimensionLabel,
  findInfo,
  inSentence,
  VariableField,
  type TabProps,
} from "./shared";

const EXAMPLES = [
  {
    label: "SCR vs no NOₓ control",
    variable: "noxRate",
    compareBy: "noxControl",
    groups: "SCR|None",
  },
  {
    label: "2015 vs 2024 CO₂ intensity",
    variable: "co2Intensity",
    compareBy: "year",
    groups: "2015|2024",
  },
  {
    label: "coal vs gas heat rate",
    variable: "heatRate",
    compareBy: "fuelClass",
    groups: "Coal|Natural Gas",
  },
  {
    label: "KY, WV, OH SO₂ intensity",
    variable: "so2Intensity",
    compareBy: "state",
    groups: "KY|WV|OH",
  },
];

const formatP = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

/** Two or more groups along one dimension, with differences, confidence intervals, and tests. */
export function CompareTab(props: TabProps) {
  const { filters, view, setView, catalog } = props;
  const info = findInfo(catalog, view.variable);
  const by = asDimension(view.compareBy) ?? "noxControl";
  const groups = view.groups.split("|").filter(Boolean);
  // Facilities and units are too many to list: the search box adds a facility, or narrows the
  // unit list to one facility.
  const searchable = by === "facility" || by === "unit";
  const [text, setText] = useState("");
  const [unitsOf, setUnitsOf] = useState<{ id: number; name: string } | null>(
    null,
  );
  const options = api.analysis.aggregate.useQuery({
    filters:
      by === "unit" && unitsOf
        ? { ...filters, facilityId: String(unitsOf.id) }
        : filters,
    variables: [view.variable],
    by,
    order: "label",
    limit: 80,
  });
  const result = api.analysis.compare.useQuery(
    { filters, variable: view.variable, by, groups },
    { enabled: groups.length >= 2, placeholderData: (prev) => prev },
  );
  const toggleGroup = (g: string) =>
    setView({
      groups: (groups.includes(g)
        ? groups.filter((x) => x !== g)
        : [...groups, g].slice(-8)
      ).join("|"),
    });
  const combined = combinedLabel(info);
  const unit = info?.unit ?? "";
  const rows = result.data?.groups ?? [];
  // Rankings: 1 = the largest value among the compared groups.
  const ranked = rows
    .filter((g) => g.value !== null)
    .sort((a, b) => b.value! - a.value!);
  const rankOf = (g: (typeof rows)[number]) =>
    g.value === null ? "—" : String(ranked.indexOf(g) + 1);
  const t = result.data?.tests;

  return (
    <div className="space-y-6">
      <QuestionSentence label="Comparison question">
        <span>How does</span>
        <VariableField {...bind(props, "variable")} inline />
        <span>differ by</span>
        <DimensionField
          label="Compare"
          value={by}
          onChange={(compareBy) => setView({ compareBy, groups: "" })}
          catalog={catalog}
          inline
        />
        <span className="-ml-1.5">?</span>
      </QuestionSentence>
      <TryExamples
        examples={EXAMPLES.map(({ label, ...patch }) => ({
          label,
          onSelect: () => setView(patch),
        }))}
      />

      <BarsChart
        {...props}
        by={by}
        reading={
          info?.aggregation === "sum"
            ? "These are **totals**: a group with more or bigger units has a bigger total. To compare one unit with another, pick groups below and read the averages."
            : "Each bar is the group's rate with all its unit-years **pooled together**, so big units count for more. To compare a typical unit in each, pick groups below and read the averages."
        }
      />

      <Section
        title={`${dimensionLabel(catalog, by)} groups`}
        note={`Pick two to eight groups to compare; the others are compared with the first one you pick (numbered 1).${searchable ? (by === "facility" ? " Search to add any facility; the list shows the first 80 by name." : unitsOf ? ` Units of ${unitsOf.name}.` : " Search to add a unit (“Ghent 2”) and list the other units of its plant; the list shows the first 80 by name.") : ""}`}
      >
        {searchable && (
          <FacilitySearch
            className="max-w-md"
            inputClassName="h-9 text-sm"
            value={text}
            onValueChange={setText}
            onPick={
              by === "facility"
                ? (f) => {
                    setText("");
                    const label = `${f.name} (${f.id})`;
                    if (!groups.includes(label)) toggleGroup(label);
                  }
                : undefined
            }
            onPickUnit={
              by === "unit"
                ? (u) => {
                    setText("");
                    const plant = `${u.facilityName} (${u.facilityId})`;
                    setUnitsOf({ id: u.facilityId, name: plant });
                    const label = `${plant} unit ${u.unitId}`;
                    if (!groups.includes(label)) toggleGroup(label);
                  }
                : undefined
            }
            onClear={() => {
              setText("");
              setUnitsOf(null);
            }}
            placeholder={
              by === "unit"
                ? "Add a unit: “Ghent 2”, or a plant to list its units"
                : "Add a facility: name, operator, county, or ID"
            }
          />
        )}
        {options.isLoading && (
          <p className="text-fg-muted text-sm">Loading groups…</p>
        )}
        {options.error && (
          <QueryError
            error={options.error}
            onRetry={() => void options.refetch()}
          />
        )}
        <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
          {[
            // Picked groups outside the listed ones stay visible, so they can be removed.
            ...groups
              .filter((g) => !options.data?.rows.some((r) => r.group === g))
              .map((group) => ({ group, n: undefined as number | undefined })),
            ...(options.data?.rows ?? []),
          ].map((r) => {
            const on = groups.includes(r.group);
            return (
              <button
                key={r.group}
                type="button"
                aria-pressed={on}
                onClick={() => toggleGroup(r.group)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
                  on
                    ? "border-primary/50 bg-primary/10 text-fg font-medium"
                    : "border-edge bg-surface text-fg-2 hover:bg-surface-2",
                )}
              >
                {on && (
                  <span className="bg-primary text-canvas flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[11px] tabular-nums">
                    {groups.indexOf(r.group) + 1}
                  </span>
                )}
                {r.group}
                {r.n !== undefined && (
                  <span className="text-fg-muted text-xs tabular-nums">
                    {formatNumber(r.n)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {GROUP_EXPLAIN[by] && groups.some((g) => GROUP_EXPLAIN[by]![g]) && (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 pt-1 text-sm sm:grid-cols-2">
            {groups
              .filter((g) => GROUP_EXPLAIN[by]![g])
              .map((g) => (
                <div key={g}>
                  <dt className="text-fg inline font-medium">{g}: </dt>
                  <dd className="text-fg-2 inline">{GROUP_EXPLAIN[by]![g]}</dd>
                </div>
              ))}
          </dl>
        )}
      </Section>

      {groups.length < 2 ? (
        <p className="text-fg-muted text-sm">
          Pick at least two groups to compare.
        </p>
      ) : result.error ? (
        <QueryError
          error={result.error}
          onRetry={() => void result.refetch()}
        />
      ) : !result.data || !info ? (
        <InlineLoading title="Comparing groups…" />
      ) : (
        result.data &&
        info && (
          <>
            <Takeaways
              items={compareSentences({
                groups: rows,
                tests: result.data.tests,
                label: info.label,
                unit,
                dimension: dimensionLabel(catalog, by),
              })}
            />
            <ChartFrame
              title={`Average ${inSentence(info.label)} per unit-year`}
              subtitle={`In ${unit}. The bar is the average for one unit-year in the group. The thin whisker is the range the true average almost surely falls in; when two whiskers don't overlap, the gap is real.`}
              filename={`compare-${view.variable}-by-${by}`}
              meta={{ variables: [info], groups, tests: result.data.tests }}
              height={rows.length * 26}
              table={{
                head: [
                  "group",
                  "rank",
                  `${combined} (${unit})`,
                  "diff",
                  "diff_pct",
                  "count",
                  "mean",
                  "ci_low",
                  "ci_high",
                  "median",
                  "sd",
                ],
                rows: rows.map((g) => [
                  g.group,
                  rankOf(g),
                  g.value,
                  g.diff,
                  g.diffPct,
                  g.count,
                  g.mean,
                  g.ci?.low,
                  g.ci?.high,
                  g.median,
                  g.sd,
                ]),
              }}
            >
              <BarList
                unit={unit}
                rows={rows.map((g) => ({
                  label: g.group,
                  value: g.mean,
                  low: g.ci?.low,
                  high: g.ci?.high,
                  details: [
                    { label: "Unit-years", value: formatNumber(g.count) },
                  ],
                }))}
              />
            </ChartFrame>
            <Disclosure
              title="Numbers and tests"
              hint="Each group's total, mean, interval, and spread; the four significance tests"
            >
              <ReportTable
                sortable
                head={[
                  dimensionLabel(catalog, by),
                  "Rank",
                  `${combined} (${unit})`,
                  "Difference",
                  "% difference",
                  "Count",
                  "Mean",
                  "95 % CI of mean",
                  "Median",
                  "SD",
                ]}
                rows={rows.map((g, i) => [
                  g.group,
                  rankOf(g),
                  formatStat(g.value),
                  i === 0 ? "baseline" : formatStat(g.diff),
                  i === 0 ? "—" : formatPct(g.diffPct),
                  formatNumber(g.count),
                  formatStat(g.mean),
                  g.ci
                    ? `${formatStat(g.ci.low)} – ${formatStat(g.ci.high)}`
                    : "—",
                  formatStat(g.median),
                  formatStat(g.sd),
                ])}
              />
              <ReportTable
                head={["Test", "Question", "Statistic", "p-value"]}
                rows={[
                  t?.welch && [
                    "Welch t-test",
                    "Do the two means differ?",
                    `t = ${formatStat(t.welch.t)}, df = ${formatStat(t.welch.df)}`,
                    formatP(t.welch.p),
                  ],
                  t?.mannWhitney && [
                    "Mann–Whitney U",
                    "Does one group tend to have larger values?",
                    `U = ${formatStat(t.mannWhitney.u)}, z = ${formatStat(t.mannWhitney.z)}`,
                    formatP(t.mannWhitney.p),
                  ],
                  t?.anova && [
                    "One-way ANOVA",
                    "Does any group mean differ?",
                    `F = ${formatStat(t.anova.f)} (${t.anova.df1}, ${t.anova.df2})`,
                    formatP(t.anova.p),
                  ],
                  t?.kruskal && [
                    "Kruskal–Wallis H",
                    "Does any group's distribution differ?",
                    `H = ${formatStat(t.kruskal.h)}, df = ${t.kruskal.df}`,
                    formatP(t.kruskal.p),
                  ],
                ].filter((r): r is string[] => Boolean(r))}
              />
            </Disclosure>
          </>
        )
      )}
    </div>
  );
}
