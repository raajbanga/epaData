"use client";

import { BarList } from "~/components/charts/bars";
import { ChartGrid, ChartFrame, queryStatus } from "~/components/ui/chart";
import { BLANK, QuestionSentence } from "~/components/ui/question-sentence";
import { Select } from "~/components/ui/select";
import { Takeaways } from "~/components/ui/takeaways";
import { getFuelTheme } from "~/lib/map-utils";
import { leadersSentence } from "~/lib/takeaways";
import { InlineLoading, QueryError } from "~/components/ui/empty-state";
import { ExportButton } from "~/components/ui/export-button";
import { Disclosure, ReportTable, Section } from "~/components/ui/report";
import { formatStat, type DimensionKey } from "~/lib/analysis";
import { METRICS } from "~/lib/metrics";
import { IMPACT_DISCLAIMER, SHORT_TON_KG } from "~/lib/traci";
import { chemUnit, formatNumber, inSentence } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
  asDimension,
  bind,
  DimensionField,
  dimensionLabel,
  valueColumn,
  type TabProps,
  shownOf,
} from "./shared";

const TOP = 15;

/** CAMPD emissions × TRACI factors, one result per impact category in its own unit. */
export function ImpactsTab(props: TabProps) {
  const { filters, view, catalog, setView } = props;
  const perMWh = view.perMWh === "1";
  const by = asDimension(view.impactBy) ?? "state";
  const impacts = catalog.variables.filter(
    (v) => v.group === "TRACI impact" && v.key.endsWith("PerMWh") === perMWh,
  );
  // Each category ranks its own largest groups: the top 15 for acidification are not the top 15
  // for global warming.
  const tops = api.useQueries((t) =>
    impacts.map((v) =>
      t.analysis.aggregate({
        filters,
        variables: [v.key],
        by,
        limit: TOP,
        order: by === "year" ? "desc" : undefined, // years default to time order
      }),
    ),
  );
  const version = catalog.factors[0]?.traciVersion;
  const groupName = inSentence(dimensionLabel(catalog, by));
  const traciMeta = {
    variables: impacts,
    traciFactors: catalog.factors,
    shortTonKg: SHORT_TON_KG,
    note: IMPACT_DISCLAIMER,
  };

  return (
    <div className="space-y-6">
      <p className="border-warn text-fg-2 border-l-2 pl-4 text-sm">
        {IMPACT_DISCLAIMER}
      </p>

      <QuestionSentence label="Impact question">
        <span>Which</span>
        <DimensionField {...bind(props, "impactBy")} label="Group by" />
        <span>carries the most potential impact</span>
        <Select
          aria-label="Result"
          value={perMWh ? "1" : "0"}
          onValueChange={(v) => setView({ perMWh: v === "1" ? "1" : "" })}
          options={[
            { value: "0", label: "in total" },
            { value: "1", label: "per MWh of power" },
          ]}
          className={BLANK}
        />
        <span className="-ml-1.5">?</span>
      </QuestionSentence>

      <Takeaways
        items={[
          leadersSentence(
            impacts.flatMap((v, i) => {
              const top = tops[i]?.data?.rows.find(
                (r) => r.values[v.key] != null,
              );
              return top ? [{ category: v.label, group: top.group }] : [];
            }),
          ),
          perMWh
            ? "**Per MWh of power made**: how much harm each unit of electricity carries, so small but dirty plants rise and large clean ones fall."
            : "Each kind of harm is measured in its own unit: **kg CO₂ eq** for warming the climate, **SO₂ eq** for acid rain, **PM2.5 eq** for fine particles that harm breathing, **O₃ eq** for smog. Each one means “as much harm as this many kg of that pollutant”, so the four **can't be added together**.",
        ]}
      />

      <ChartGrid>
        {impacts.map((v, i) => {
          const q = tops[i]!;
          const rows = (q.data?.rows ?? []).filter(
            (r) => r.values[v.key] != null,
          );
          return (
            <ChartFrame
              key={v.key}
              title={`${v.label} by ${groupName}`}
              subtitle={`In ${v.unit}${shownOf(TOP, q.data?.total)}.`}
              note={v.definition}
              filename={`impact-${v.key}-by-${by}`}
              meta={traciMeta}
              height={TOP * 26}
              {...queryStatus(q)}
              table={{
                head: [by, valueColumn(v), "unit_years"],
                rows: rows.map((r) => [r.group, r.values[v.key], r.n]),
              }}
            >
              <BarList
                unit={v.unit}
                rows={rows.map((r) => ({
                  label: r.group,
                  value: r.values[v.key] ?? null,
                  color:
                    by === "fuelClass"
                      ? getFuelTheme(r.group).color
                      : undefined,
                  details: [{ label: "Unit-years", value: formatNumber(r.n) }],
                }))}
              />
            </ChartFrame>
          );
        })}
      </ChartGrid>

      <Disclosure
        title={`All results by ${groupName}`}
        hint="every category side by side, with a CSV download"
      >
        <ResultsTable
          {...props}
          {...{ impacts, traciMeta, perMWh, by, version }}
        />
      </Disclosure>

      <Disclosure
        title={`TRACI ${version} factors used`}
        hint="which EPA pollutant counts toward which impact, and by how much"
      >
        <p className="text-fg-muted text-sm">
          Matched by exact TRACI substance and the air medium; masses converted
          with 1 short ton = {SHORT_TON_KG} kg. Impact = Σ mass (kg) × factor
          over the pollutants in a category.
        </p>
        <ReportTable
          head={[
            "EPA pollutant",
            "TRACI substance",
            "CAS",
            "Impact category",
            "Factor",
            "Unit per kg",
          ]}
          rows={catalog.factors.map((f) => [
            METRICS[`${f.pollutant as "co2" | "so2" | "nox"}MassTons`].short,
            f.substance,
            f.cas,
            f.impactCategory,
            String(Number(f.factor.toPrecision(6))),
            chemUnit(f.factorUnit),
          ])}
        />
        <div className="text-fg-muted space-y-1 text-xs">
          {impacts.map((v) => (
            <p key={v.key}>
              <span className="text-fg-2 font-medium">{v.label}:</span>{" "}
              {v.definition}
            </p>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

/** Every category per group (up to 100 groups), loaded only when opened. */
function ResultsTable({
  filters,
  catalog,
  impacts,
  traciMeta,
  perMWh,
  by,
  version,
}: TabProps & {
  impacts: TabProps["catalog"]["variables"];
  traciMeta: Record<string, unknown>;
  perMWh: boolean;
  by: DimensionKey;
  version?: string;
}) {
  const q = api.analysis.aggregate.useQuery({
    filters,
    variables: impacts.map((v) => v.key),
    by,
    limit: 100,
  });
  if (q.error)
    return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <InlineLoading title="Loading results…" />;
  const head = [
    dimensionLabel(catalog, by),
    "Unit-years",
    ...impacts.map((v) => `${v.label} (${v.unit})`),
  ];
  const table = q.data.rows.map((r) => [
    r.group,
    r.n,
    ...impacts.map((v) => r.values[v.key] ?? null),
  ]);
  return (
    <Section
      title={`${formatNumber(q.data.rows.length)} of ${formatNumber(q.data.total)} groups`}
      note={`Each category is summed only over its own pollutants and keeps its own unit; categories are never added together. A unit-year is left out of a category when one of its pollutants was not reported. ${by === "year" ? "In order of year" : `Largest ${inSentence(impacts[0]?.label ?? "")} first`}; click a column to sort. The download has full precision.`}
      actions={
        <ExportButton
          name={`traci-${version}-impacts-by-${by}${perMWh ? "-per-mwh" : ""}`}
          title={`TRACI ${version} impacts by ${inSentence(dimensionLabel(catalog, by))}`}
          table={{ head, rows: table }}
          meta={traciMeta}
        />
      }
    >
      <ReportTable
        sortable
        head={head}
        rows={table.map(([group, n, ...values]) => [
          group,
          formatNumber(n as number),
          ...values.map((x) => formatStat(x as number | null)),
        ])}
        sortKeys={table}
      />
    </Section>
  );
}
