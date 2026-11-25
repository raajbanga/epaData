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
  scenarioSummary,
  scopeTotals,
  treeGroupSummary,
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
  treeGroupReading,
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
 * The answer, then the detail: a headline with what it means, the same units under the other
 * changes, where a group's change comes from, how the tree decided (one unit's path, or a group's
 * most common paths), and how the prediction responds to one input.
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
  // One unit: each input the change sets. A group, or a unit it leaves alone, gets the summary.
  const changed =
    unit && rows[0]
      ? changedInputs(rows[0].inputs, applyScenario(rows[0].inputs, spec))
      : [];
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
      {!unit && <GroupTreePanel {...props} />}

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
            Smog, acidification, and fine-particle potential are TRACI
            indicators: NOₓ (kg) × a fixed factor per category, so from NOₓ
            alone they change by the same percentage. {IMPACT_DISCLAIMER}
          </p>
        </div>
        {rows[0] && !sameScenario(spec, AS_REPORTED) && (
          <div className="space-y-1">
            <p className="text-fg-2 text-sm font-medium">
              Inputs the change sets for {unit ? "this unit" : "these units"}
            </p>
            <ul className="text-fg-2 list-disc space-y-0.5 pl-5 text-sm">
              {(changed.length ? changed : scenarioSummary(rows, spec)).map(
                (c) => (
                  <li key={c}>{c}</li>
                ),
              )}
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
        head: ["bar", "nox_tons", "change_tons", "change_pct"],
        rows: [
          [`reported ${view.year}`, actual, null, null],
          ...totals.flatMap((t) => [
            [`${t.model.id} as reported`, t.base, null, null],
            [`${t.model.id} with the change`, t.scenario, t.diff, t.diffPct],
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
          color: MODEL_COLORS[t.model.kind],
          note: zeroNote(t) ?? formatPct(t.diffPct),
        }))}
      />
    </ChartFrame>
  );
}

/** From a prediction of 0 there is no percentage, so the change is read in tons. */
function zeroNote(t: { diff: number; diffPct: number | null }) {
  if (t.diffPct !== null) return undefined;
  return Math.abs(t.diff) < 0.05
    ? "no change (0 t)"
    : `from 0 t: ${formatSigned(Number(t.diff.toPrecision(3)), "t")}, no %`;
}

/** A group: the plants (or, within one plant, the units) the change comes from. */
function Breakdown({ totals }: { totals: Totals[] }) {
  const units = totals[0]?.units ?? [];
  const plants = new Set(units.map((u) => u.row.facilityId)).size;
  const onePlant = plants === 1;
  const by = onePlant ? "unit" : "plant";
  const TOP = 8;
  const lists = useMemo(
    () =>
      totals.map((t) => {
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
      }),
    [totals, onePlant],
  );

  return (
    <ChartFrame
      title="Where the change comes from"
      subtitle={`The ${by}s whose predicted NOₓ changes the most, in short tons a year. Each model has its own list.`}
      reading={breakdownReading(
        lists.map((l) => ({
          model: modelName(l.model),
          tree: l.model.kind === "tree",
          rows: l.rows,
        })),
        by,
        onePlant ? units.length : plants,
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
              · {plural(l.rows.length, by)} with a change
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
  const same = before.leaf === after.leaf;
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
      table={{
        head: ["step", "as_reported", "with_the_change"],
        rows: [
          ...Array.from(
            { length: Math.max(before.steps.length, after.steps.length) },
            (_, i) => [
              i + 1,
              before.steps[i]?.text ?? null,
              after.steps[i]?.text ?? null,
            ],
          ),
          ["predicted_nox_tons", before.value, after.value],
        ],
      }}
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
        )}; bars show how much that would go down (left) or up (right), one per model. ⚠ marks a change that takes units outside the training data; a hatched bar is a change from a prediction of 0, which has no percentage.`}
      reading={otherChangesReading(
        results.map((r) => ({
          label: r.change.label,
          results: chosen.map((m) => ({
            model: modelName(m),
            pct: r.byModel[m.kind]!.diffPct,
            tons: r.byModel[m.kind]!.diff,
          })),
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
        format={formatPct}
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
            const fromZero = t.diffPct === null;
            return {
              key: m.kind,
              value: t.diffPct,
              sign: Math.abs(t.diff) < 0.05 ? 0 : Math.sign(t.diff),
              text: zeroNote(t),
              color: MODEL_COLORS[m.kind],
              title: `${shortName(m)} model: ${formatStat(t.base)} → ${formatStat(t.scenario)} t a year (${formatSigned(t.diff, "t")}, ${fromZero ? "no percentage from 0" : formatPct(t.diffPct)})`,
            };
          }),
        }))}
      />
    </ChartFrame>
  );
}

/**
 * A group: the tree's most common paths (the answers its units give), with how many units and how
 * much predicted NOₓ end in each, the answers the change flips, and the checks that split the group.
 */
function GroupTreePanel({ chosen, scope, spec }: WhatIfProps) {
  const tree = chosen.find((m) => m.kind === "tree");
  const g = useMemo(
    () => (tree ? treeGroupSummary(tree.artifact, scope.rows, spec) : null),
    [tree, scope.rows, spec],
  );
  if (!tree || !g) return null;
  const TOP = 5;
  const used = g.paths.filter((p) => p.before.units);
  const total = used.reduce((s, p) => s + p.before.tons, 0);
  const changed = !sameScenario(spec, AS_REPORTED);
  const tons = (v: number) => `${formatStat(v)} t`;
  return (
    <ChartFrame
      title="Why the tree predicts what it does"
      subtitle={`The tree model works like a flowchart: it asks each unit **a few yes/no questions**, then predicts the average NOₓ of past units that gave the same answers. Each set of answers is a path; the ${plural(Math.min(TOP, used.length), "path")} with the most predicted NOₓ ${used.length === 1 ? "is" : "are"} shown.`}
      reading={treeGroupReading(g, scope.rows.length)}
      note="Each path is one leaf of the tree: every unit on it gets the same prediction, the leaf's value. The download lists every leaf any unit reaches, as reported and with the change."
      filename="whatif-tree-paths"
      height={TOP * 80}
      table={{
        head: [
          "leaf",
          "path",
          "leaf_nox_tons",
          "units_as_reported",
          "nox_as_reported_tons",
          "units_with_the_change",
          "nox_with_the_change_tons",
        ],
        rows: g.paths.map((p) => [
          p.leaf,
          p.steps.join("; "),
          p.value,
          p.before.units,
          p.before.tons,
          p.after.units,
          p.after.tons,
        ]),
      }}
    >
      <ChartGrid>
        <div className="min-w-0 space-y-2">
          <p className="text-fg-2 text-sm font-medium">
            Paths with the most predicted NOₓ
          </p>
          {used.slice(0, TOP).map((p, i) => (
            <details
              key={p.leaf}
              open={i === 0}
              className="border-edge rounded-sm border px-3 py-2"
            >
              <summary className="text-fg cursor-pointer text-sm tabular-nums">
                <span className="font-medium">
                  {plural(p.before.units, "unit")}
                </span>
                ,{" "}
                {p.before.units === 1
                  ? tons(p.value)
                  : `${tons(p.value)} each: ${tons(p.before.tons)}`}
                {total > 0 &&
                  ` (${Math.round((p.before.tons / total) * 100)} % of the tree's total)`}
                {changed &&
                  p.after.units !== p.before.units &&
                  ` · with the change, ${plural(p.after.units, "unit")}`}
              </summary>
              <ol className="text-fg-2 marker:text-fg-muted mt-2 list-decimal space-y-0.5 pl-5 text-sm">
                {p.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <p className="text-fg-2 text-sm font-medium">
              Checks that split these units
            </p>
            {g.splits.length ? (
              <ul className="text-fg-2 space-y-1.5 text-sm">
                {g.splits.slice(0, TOP).map((s, i) => (
                  <li key={i}>
                    {s.question}?{" "}
                    <span className="text-fg-muted tabular-nums">
                      Yes: {plural(s.yes.units, "unit")}, {tons(s.yes.tons)};
                      no: {formatNumber(s.no.units)}, {tons(s.no.tons)}
                      {s.yes.units + s.no.units < scope.rows.length &&
                        ` (of the ${formatNumber(s.yes.units + s.no.units)} that reach it)`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted text-sm">
                Every unit answers every check the same way.
              </p>
            )}
          </div>
          {changed && (
            <div className="space-y-2">
              <p className="text-fg-2 text-sm font-medium">
                Answers the change flips, by tons moved
              </p>
              {g.flips.length ? (
                <ul className="text-fg-2 space-y-1.5 text-sm">
                  {g.flips.slice(0, TOP).map((f) => (
                    <li key={f.text}>
                      To “{f.text}”{" "}
                      <span className="text-fg-muted tabular-nums">
                        {plural(f.units, "unit")}, {formatSigned(f.diff, "t")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-fg-muted text-sm">
                  None: every unit keeps its answers, so the tree&apos;s
                  prediction doesn&apos;t move.
                </p>
              )}
            </div>
          )}
        </div>
      </ChartGrid>
    </ChartFrame>
  );
}
