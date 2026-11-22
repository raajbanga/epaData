"use client";

import { useMemo } from "react";
import { BarList } from "~/components/charts/bars";
import { ArrowRows, DivergingRows } from "~/components/charts/change-rows";
import { ChartGrid, ChartFrame } from "~/components/ui/chart";
import { Disclosure } from "~/components/ui/report";
import { Takeaways } from "~/components/ui/takeaways";
import { formatPct, formatSigned, formatStat } from "~/lib/analysis";
import {
  applyScenario,
  AS_REPORTED,
  changedInputs,
  MODEL_COLORS,
  sameScenario,
  scopeTotals,
  treePath,
  WHAT_IF_CHANGES,
  type ScopeTotals,
  shortName,
} from "~/lib/model";
import { stateName } from "~/lib/search-suggestions";
import {
  baselineReading,
  breakdownReading,
  otherChangesReading,
  treePathReading,
  whatIfAnswer,
} from "~/lib/takeaways";
import { IMPACT_DISCLAIMER } from "~/lib/traci";
import { capitalize, formatNumber, plural } from "~/lib/utils";
import {
  modelName,
  modelSeries,
  type Model,
  type WhatIfProps,
} from "./predict-view";
import { SensitivitySection } from "./sensitivity";

type Totals = { model: Model } & ScopeTotals;

/**
 * The answer, then the detail: a headline with what it means, where the change comes from (or,
 * for one unit, how the tree decided), the same units under the other changes, and how the
 * prediction responds to one input.
 */
export function WhatIfResults(props: WhatIfProps) {
  const { chosen, scope, spec, unit, view } = props;
  const { rows, totals: reported } = scope;

  const totals = useMemo<Totals[]>(
    () =>
      chosen.map((m) => ({
        model: m,
        ...scopeTotals(m.artifact, rows, spec),
      })),
    [chosen, rows, spec],
  );
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  // A state's change reads against the nation; anything inside one state, against that state.
  const share =
    view.scope !== "state" && reported.state && reported.inState
      ? { tons: reported.inState, of: stateName(reported.state) }
      : { tons: reported.nation, of: "the US" };
  const answer = whatIfAnswer({
    units: rows.length,
    share,
    results: totals.map((t) => ({
      model: modelName(t.model),
      base: t.base,
      diff: t.diff,
      diffPct: t.diffPct,
      outside: t.outside,
      mae: t.model.metrics.test?.mae ?? 0,
    })),
  });

  return (
    <>
      <Takeaways items={answer} />

      {/* For one unit, the tree's path fills the space under the short before/after chart. */}
      <ChartGrid>
        <div className="min-w-0 space-y-6">
          <BeforeAfter {...props} totals={totals} actual={actual} />
          {unit && <TreePathPanel {...props} />}
        </div>
        <OtherChanges {...props} />
      </ChartGrid>

      {!unit && <Breakdown totals={totals} />}

      <SensitivitySection {...props} />

      <Disclosure title="How these numbers are made">
        <div className="text-fg-2 space-y-2 text-[15px]">
          <p>
            Each unit&apos;s prediction uses its own reported inputs with the
            change applied; a group adds its units up. The change is measured
            against each model&apos;s own prediction for the unit as reported,
            so it shows how the model responds, not a measured effect. Last
            year&apos;s NOₓ rate, one of the strongest inputs, stays as it was.
          </p>
          <p>
            Typical error is each model&apos;s mean absolute error per unit-year
            on the test years (
            {chosen
              .map(
                (m) =>
                  `${shortName(m)} ±${formatStat(m.metrics.test?.mae ?? null)} t`,
              )
              .join(", ")}
            ). For a group it grows with the square root of the number of
            unit-years, since independent errors partly cancel.
          </p>
          <p>
            Smog, acidification, and fine-particle potential are TRACI 2.2
            indicators: NOₓ (kg) × a fixed factor per category, so from NOₓ
            alone they change by the same percentage. {IMPACT_DISCLAIMER}
          </p>
        </div>
        {unit && rows[0] && !sameScenario(spec, AS_REPORTED) && (
          <div className="space-y-1">
            <p className="text-fg-2 text-sm font-medium">
              Inputs the change sets for this unit
            </p>
            <ul className="text-fg-2 list-disc space-y-0.5 pl-5 text-sm">
              {changedInputs(
                rows[0].inputs,
                applyScenario(rows[0].inputs, spec),
              ).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </Disclosure>
    </>
  );
}

/** Reported NOₓ, then each model as reported and with the change. */
function BeforeAfter({
  place,
  view,
  changeLabel,
  totals,
  actual,
}: WhatIfProps & { totals: Totals[]; actual: number }) {
  return (
    <ChartFrame
      title="What the change does to NOₓ"
      subtitle={`${capitalize(place)}, tons of NOₓ a year. Each arrow is one model: it starts at the model's prediction as things are and ends at its prediction after “${changeLabel}”.`}
      reading={baselineReading(
        actual,
        totals.map((t) => ({ model: modelName(t.model), base: t.base })),
      )}
      filename="whatif-before-after"
      height={totals.length * 40 + 60}
      table={{
        head: ["bar", "nox_tons", "change_pct"],
        rows: [
          [`reported ${view.year}`, actual, null],
          ...totals.flatMap((t) => [
            [`${t.model.id} as reported`, t.base, null],
            [`${t.model.id} with the change`, t.scenario, t.diffPct],
          ]),
        ],
      }}
    >
      <ArrowRows
        format={(v) => `${formatStat(v)} t`}
        reference={{
          value: actual,
          label: `Reported in ${view.year}: ${formatStat(actual)} t`,
        }}
        rows={totals.map((t) => ({
          label: `${shortName(t.model)} model`,
          from: t.base,
          to: t.scenario,
          color: MODEL_COLORS[t.model.kind] ?? "var(--chart-slate)",
          note: formatPct(t.diffPct),
        }))}
      />
    </ChartFrame>
  );
}

/** A group: the plants (or, within one plant, the units) the change comes from. */
function Breakdown({ totals }: { totals: Totals[] }) {
  const placeCount = (t: Totals) =>
    new Set(t.units.map((u) => (onePlant ? u.row.unitId : u.row.facilityId)))
      .size;
  const onePlant =
    new Set(totals[0]?.units.map((u) => u.row.facilityId)).size === 1;
  const by = onePlant ? "unit" : "plant";
  const TOP = 8;
  const lists = totals.map((t) => {
    const groups = new Map<string, number>();
    for (const u of t.units) {
      const key = onePlant
        ? `Unit ${u.row.unitId}`
        : `${u.row.facilityName} (${u.row.stateCode})`;
      groups.set(key, (groups.get(key) ?? 0) + u.diff);
    }
    return {
      model: t.model,
      rows: [...groups]
        .filter(([, d]) => Math.abs(d) >= 0.05)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])),
    };
  });

  return (
    <ChartFrame
      title={`Where the change comes from`}
      subtitle={`The ${by}s whose predicted NOₓ changes the most, in short tons a year. Each model has its own list.`}
      reading={breakdownReading(
        lists.map((l) => ({
          model: modelName(l.model),
          tree: l.model.kind === "tree",
          rows: l.rows,
        })),
        by,
        totals[0] ? placeCount(totals[0]) : 0,
      )}
      filename={`whatif-change-by-${by}`}
      height={TOP * 26}
      table={{
        head: ["model", by, "change_tons"],
        rows: lists.flatMap((l) =>
          l.rows.map(([name, d]) => [l.model.id, name, d]),
        ),
      }}
    >
      <ChartGrid className="md:grid-cols-2">
        {lists.map((l) => (
          <div key={l.model.id} className="min-w-0 space-y-1">
            <p className="text-fg-muted text-sm">
              <span className="text-fg-2 font-medium">
                {shortName(l.model)}
              </span>{" "}
              · {formatNumber(l.rows.length)} {by}s change
            </p>
            {l.rows.length ? (
              <BarList
                unit="t"
                format={(v) => formatSigned(v, "t")}
                rows={l.rows.slice(0, TOP).map(([label, value]) => ({
                  label,
                  value,
                  color: MODEL_COLORS[l.model.kind],
                }))}
              />
            ) : (
              <p className="text-fg-muted text-sm">
                This model doesn&apos;t change its prediction for any {by}.
              </p>
            )}
          </div>
        ))}
      </ChartGrid>
    </ChartFrame>
  );
}

/** One unit: the yes/no checks the tree made, as is and with the change. */
function TreePathPanel({ chosen, scope, spec }: WhatIfProps) {
  const tree = chosen.find((m) => m.kind === "tree");
  const row = scope.rows[0];
  if (!tree || !row) return null;
  const before = treePath(tree.artifact, row.inputs)!;
  const after = treePath(tree.artifact, applyScenario(row.inputs, spec))!;
  const same =
    before.steps.length === after.steps.length &&
    before.steps.every((s, i) => s.text === after.steps[i]!.text);
  const path = (p: typeof before, title: string) => (
    <div className="min-w-0 space-y-2">
      <p className="text-fg-2 text-sm font-medium">{title}</p>
      <ol className="text-fg-2 marker:text-fg-muted list-decimal space-y-1 pl-5 text-sm">
        {p.steps.map((s, i) => (
          <li key={i}>{s.text}</li>
        ))}
      </ol>
      <p className="text-fg text-sm font-semibold tabular-nums">
        Predicts {formatStat(p.value)} t
      </p>
    </div>
  );
  return (
    <ChartFrame
      title="Why the tree predicts what it does"
      subtitle="The tree model works like a flowchart: it asks **a few yes/no questions** about the unit, then predicts the average NOₓ of past units that gave the same answers."
      filename="whatif-tree-path"
      height={260}
      reading={treePathReading(before, after)}
    >
      {same ? (
        <div className="space-y-3">
          {path(before, "As is, and with the change")}
          <p className="text-fg-muted text-sm">
            That&apos;s why it can disagree with Ridge, which gives every input
            some weight.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {path(before, "As is")}
          {path(after, "With the change")}
        </div>
      )}
    </ChartFrame>
  );
}

/** The same units under every other change, so this one can be read against them. */
function OtherChanges({ chosen, scope, spec, changeLabel }: WhatIfProps) {
  const list = useMemo(() => {
    const known = WHAT_IF_CHANGES.some((c) => sameScenario(c.spec, spec));
    return known
      ? WHAT_IF_CHANGES
      : [
          ...WHAT_IF_CHANGES,
          {
            key: "custom",
            label: changeLabel,
            phrase: "",
            explain: "Your own change.",
            spec,
          },
        ];
  }, [spec, changeLabel]);
  const results = useMemo(
    () =>
      list.map((c) => ({
        change: c,
        byModel: Object.fromEntries(
          chosen.map((m) => [
            m.kind,
            scopeTotals(m.artifact, scope.rows, c.spec),
          ]),
        ),
      })),
    [list, chosen, scope.rows],
  );

  return (
    <ChartFrame
      title="What if they made a different change?"
      subtitle={`The same units under each change the models can test. As reported, ${chosen
        .map(
          (m, i) =>
            `${i ? modelName(m) : capitalize(modelName(m))} predicts ${formatStat(results[0]?.byModel[m.kind]?.base ?? null)} t`,
        )
        .join(
          " and ",
        )}; bars show how much that would go down (left) or up (right), one per model. ⚠ marks a change that takes units outside the training data.`}
      reading={otherChangesReading(
        results.map((r) => ({
          label: r.change.label,
          pcts: chosen.map((m) => r.byModel[m.kind]!.diffPct ?? 0),
        })),
        results.find((r) => sameScenario(r.change.spec, spec))?.change.label,
      )}
      legend={modelSeries(chosen)}
      filename="whatif-other-changes"
      height={list.length * 56}
      table={{
        head: [
          "change",
          ...chosen.flatMap((m) => [
            `${m.kind}_baseline_nox_tons`,
            `${m.kind}_nox_tons`,
            `${m.kind}_change_tons`,
            `${m.kind}_change_pct`,
            `${m.kind}_units_outside_training_range`,
          ]),
        ],
        rows: results.map((r) => [
          r.change.label,
          ...chosen.flatMap((m) => {
            const t = r.byModel[m.kind]!;
            return [t.base, t.scenario, t.diff, t.diffPct, t.outside];
          }),
        ]),
      }}
    >
      <DivergingRows
        less="less NOₓ"
        more="more NOₓ"
        format={(v) => formatPct(v)}
        rows={results.map((r) => ({
          label: r.change.label,
          description: (() => {
            const out = Math.max(
              ...chosen.map((m) => r.byModel[m.kind]!.outside),
            );
            return out
              ? `${r.change.explain} ⚠ ${plural(out, "unit")} outside the training data: treat as extrapolation.`
              : r.change.explain;
          })(),
          highlight: sameScenario(r.change.spec, spec),
          bars: chosen.map((m) => {
            const t = r.byModel[m.kind]!;
            return {
              key: m.kind,
              value: t.diffPct ?? 0,
              color: MODEL_COLORS[m.kind] ?? "var(--chart-slate)",
              title: `${shortName(m)} model: ${formatStat(t.base)} → ${formatStat(t.scenario)} t a year (${formatSigned(t.diff, "t")}, ${formatPct(t.diffPct)})`,
            };
          }),
        }))}
      />
    </ChartFrame>
  );
}
