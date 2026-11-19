"use client";

import { useMemo } from "react";
import { BarList } from "~/components/charts/bars";
import { Lines } from "~/components/charts/lines";
import { ChartGrid, ChartFrame } from "~/components/ui/chart";
import { Section } from "~/components/ui/report";
import { Select } from "~/components/ui/select";
import { BLANK, QuestionSentence } from "~/components/ui/question-sentence";
import { Takeaways } from "~/components/ui/takeaways";
import { sensitivitySentences } from "~/lib/takeaways";
import { capitalize, inSentence } from "~/lib/utils";
import { formatPct, formatStat } from "~/lib/analysis";
import {
  CATEGORY_INPUTS,
  isCategoryInput,
  MODEL_COLORS,
  NUMERIC_INPUTS,
  predict,
  scopeCategory,
  scopeSensitivity,
  treeBreakpoints,
  type CategoryInput,
  type NumericInput,
  shortName,
} from "~/lib/model";
import { shortNumber } from "~/lib/utils";
import {
  modelName,
  modelSeries,
  type Model,
  type WhatIfProps,
} from "./predict-view";

const RANGES = ["10", "25", "50", "100"];
/** Points across the range (plus the tree's own cut points for one unit). */
const STEPS = 20;

/** The input a sensitivity varies, and for a number, how far. */
function VaryControls({
  view,
  setView,
  numeric,
}: Pick<WhatIfProps, "view" | "setView"> & { numeric: boolean }) {
  return (
    <QuestionSentence label="Sensitivity question">
      <span>How does the prediction change if</span>
      <Select
        aria-label="Input to vary"
        value={view.input}
        onValueChange={(input) => setView({ input })}
        className={BLANK}
        options={[
          ...Object.entries(NUMERIC_INPUTS).map(([value, m]) => ({
            value,
            label: inSentence(m.label),
            group: "Amounts",
          })),
          ...Object.entries(CATEGORY_INPUTS).map(([value, label]) => ({
            value,
            label: inSentence(label),
            group: "Fuel, type, and controls",
          })),
        ]}
      />
      {numeric ? (
        <>
          <span>moves by up to</span>
          <Select
            aria-label="Range"
            value={RANGES.includes(view.range) ? view.range : "50"}
            onValueChange={(range) => setView({ range })}
            className={BLANK}
            options={RANGES.map((r) => ({ value: r, label: `± ${r} %` }))}
          />
        </>
      ) : (
        <span>changes</span>
      )}
      <span className="-ml-1.5">?</span>
    </QuestionSentence>
  );
}

/**
 * One input changed on every unit in the scope, everything else as reported (the scenario aside):
 * a curve for a number, bars for a fuel, unit type, or control.
 */
export function SensitivitySection(props: WhatIfProps) {
  const input = isCategoryInput(props.view.input)
    ? props.view.input
    : props.view.input in NUMERIC_INPUTS
      ? (props.view.input as NumericInput)
      : "heat_input_mmbtu";
  const numeric = !isCategoryInput(input);
  return (
    <Section
      title="How the prediction responds to one input"
      note="Everything else stays as reported."
    >
      <VaryControls {...props} numeric={numeric} />
      {numeric ? (
        props.unit ? (
          <UnitCurve {...props} input={input} />
        ) : (
          <GroupCurve {...props} input={input} />
        )
      ) : (
        <CategoryBars {...props} input={input} />
      )}
    </Section>
  );
}

/** A value as the axis shows it: "26.4M", "0.231". */
const axisValue = (v: number) =>
  shortNumber(v) ?? Number(v.toPrecision(3)).toLocaleString();

/**
 * One unit: predictions at evenly spaced values, plus, for the tree, at each of its cut points, so
 * its staircase steps exactly where the tree's thresholds are.
 */
function UnitCurve({
  view,
  chosen,
  scope,
  place,
  input,
}: WhatIfProps & { input: NumericInput }) {
  const meta = NUMERIC_INPUTS[input];
  const base = scope.rows[0]!.inputs;
  const first = chosen[0]!.artifact;
  const [min, max] = first.ranges.numeric[input];
  const median = first.spec.numeric.find((f) => f.name === input)?.median ?? 0;
  const value0 = base[input] ?? median;
  const range = Number(view.range) || 50;
  const tree = chosen.find((m) => m.kind === "tree");

  const { rows, jumps, lo, hi } = useMemo(() => {
    const lo = Math.max(0, value0 * (1 - range / 100));
    const hi = value0 * (1 + range / 100);
    const xs = new Set([value0]);
    for (let i = 0; i <= STEPS; i++) xs.add(lo + ((hi - lo) * i) / STEPS);
    // Just past each cut point, so the step lands on it.
    const cuts = tree
      ? treeBreakpoints(tree.artifact, input).filter((c) => c > lo && c < hi)
      : [];
    for (const c of cuts) xs.add(c * (1 + 1e-9) + 1e-12);
    const rows = [...xs]
      .sort((a, b) => a - b)
      .map((x): { x: number } & Record<string, number> => ({
        x,
        ...Object.fromEntries(
          chosen.map((m) => [
            m.kind,
            predict(m.artifact, { ...base, [input]: x }),
          ]),
        ),
      }));
    // Where the tree's prediction actually changes (most cut points don't apply to this unit).
    const jumps = tree
      ? rows
          .filter((r, i) => i > 0 && r.tree !== rows[i - 1]!.tree)
          .map((r) => r.x)
      : [];
    return { rows, jumps, lo, hi };
  }, [chosen, base, input, value0, range, tree]);

  const at0 = (m: Model) => predict(m.artifact, base);
  const pctFrom = (v: number | null | undefined, base: number) =>
    v == null || !base ? null : (v / base - 1) * 100;
  const reading = [
    ...sensitivitySentences({
      range,
      less: meta.less,
      more: meta.more,
      results: chosen.map((m) => ({
        model: modelName(m),
        low: pctFrom(rows[0]![m.kind], at0(m)),
        high: pctFrom(rows.at(-1)![m.kind], at0(m)),
      })),
    }),
    tree &&
      (jumps.length
        ? `The tree's line is a staircase: it only changes when ${meta.label.toLowerCase()} crosses ${jumps.length === 1 ? "one threshold" : `one of ${jumps.length} thresholds`} (such as ${jumps.slice(0, 2).map(axisValue).join(" or ")} ${meta.unit}), and stays flat in between.`
        : `The tree's line is flat: none of its thresholds for ${meta.label.toLowerCase()} falls in this range for this unit.`),
  ];

  return (
    <>
      <Takeaways items={reading} />
      <ChartFrame
        title={`Predicted NOₓ as ${meta.label.toLowerCase()} changes`}
        subtitle={`${capitalize(place)}, short tons. **The dot is how it is now.** Shaded areas are values the models never saw, so treat them as guesses.`}
        note={`Training data range: ${formatStat(min)}–${formatStat(max)} ${meta.unit}. The tree's line is drawn as steps because it only predicts a handful of values: the average NOₓ of the training unit-years that answer its yes/no questions the same way.`}
        legend={modelSeries(chosen)}
        filename={`sensitivity-${input}`}
        height={340}
        table={{
          head: [
            `${input} (${meta.unit})`,
            ...chosen.map((m) => `${m.kind}_predicted_nox_tons`),
          ],
          rows: rows.map((r) => [r.x, ...chosen.map((m) => r[m.kind] ?? null)]),
        }}
      >
        <Lines
          height={340}
          xTitle={`${meta.label} (${meta.unit})`}
          unit="t"
          data={rows}
          series={modelSeries(chosen)}
          stepped={["tree"]}
          refLines={[{ axis: "x", value: value0 }]}
          bands={[
            ...(lo < min ? [{ from: lo, to: min }] : []),
            ...(hi > max ? [{ from: max, to: hi }] : []),
          ]}
          markers={chosen.map((m) => ({
            x: value0,
            y: at0(m),
            color: MODEL_COLORS[m.kind]!,
          }))}
          tooltipRows={(row, s) => {
            const m = chosen.find((c) => c.kind === s.key);
            const v = row[s.key];
            if (!m || v == null) return [];
            const d = v - at0(m);
            return Math.abs(d) < 1e-9
              ? []
              : [
                  {
                    label: "vs. as reported",
                    value: `${d > 0 ? "+" : ""}${formatStat(d)} t (${formatPct((d / at0(m)) * 100)})`,
                  },
                ];
          }}
        />
      </ChartFrame>
    </>
  );
}

/** A group: the summed prediction as the input moves by a share of each unit's own value. */
function GroupCurve({
  view,
  chosen,
  scope,
  place,
  input,
}: WhatIfProps & { input: NumericInput }) {
  const meta = NUMERIC_INPUTS[input];
  const range = Number(view.range) || 50;
  const percents = useMemo(
    () =>
      Array.from(
        { length: STEPS + 1 },
        (_, i) => -range + (2 * range * i) / STEPS,
      ),
    [range],
  );
  const curves = useMemo(
    () =>
      chosen.map((m) => ({
        model: m,
        points: scopeSensitivity(m.artifact, scope.rows, input, percents),
      })),
    [chosen, scope.rows, input, percents],
  );
  const signed = (p: number) => `${p > 0 ? "+" : ""}${Number(p.toFixed(1))} %`;
  const reading = sensitivitySentences({
    range,
    less: meta.less,
    more: meta.more,
    results: curves.map(({ model: m, points }) => ({
      model: modelName(m),
      low: points[0]!.diffPct,
      high: points.at(-1)!.diffPct,
    })),
  });

  return (
    <>
      <Takeaways items={reading} />
      <ChartFrame
        title={`Total predicted NOₓ as ${meta.label.toLowerCase()} changes on every unit`}
        subtitle={`${capitalize(place)}, short tons. Left to right: **every unit's value changed by the same percentage**.`}
        note="Each unit's value is scaled by the same percentage, so a big unit moves more than a small one. The tree's total looks smooth because it adds up many units' steps; pick one unit to see the steps themselves."
        legend={modelSeries(chosen)}
        filename={`sensitivity-${input}-scope`}
        height={340}
        table={{
          head: [
            `${input}_change_pct`,
            ...chosen.flatMap((m) => [
              `${m.kind}_predicted_nox_tons`,
              `${m.kind}_change_pct`,
            ]),
          ],
          rows: percents.map((p, i) => [
            p,
            ...curves.flatMap(({ points }) => [
              points[i]!.prediction,
              points[i]!.diffPct,
            ]),
          ]),
        }}
      >
        <Lines
          height={340}
          xTitle={`${meta.label}, change on every unit`}
          xFormat={signed}
          unit="t"
          data={percents.map((x, i) => ({
            x,
            ...Object.fromEntries(
              curves.map(({ model: m, points }) => [
                m.kind,
                points[i]!.prediction,
              ]),
            ),
          }))}
          series={modelSeries(chosen)}
          refLines={[{ axis: "x", value: 0 }]}
          markers={curves.map(({ model: m, points }) => ({
            x: 0,
            y: points[STEPS / 2]!.prediction,
            color: MODEL_COLORS[m.kind]!,
          }))}
          tooltipRows={(row, s) => {
            const p = curves
              .find((c) => c.model.kind === s.key)
              ?.points.find((q) => q.pct === row.x);
            return p && Math.abs(p.diff) > 1e-9
              ? [
                  {
                    label: "vs. as reported",
                    value: `${p.diff > 0 ? "+" : ""}${formatStat(p.diff)} t (${formatPct(p.diffPct)})`,
                  },
                ]
              : [];
          }}
        />
      </ChartFrame>
    </>
  );
}

/** A fuel, unit type, or control set on every unit: one bar per value, per model. */
function CategoryBars({
  chosen,
  scope,
  place,
  unit,
  input,
}: WhatIfProps & { input: CategoryInput }) {
  const label = CATEGORY_INPUTS[input];
  const lower = /^[A-Z]{2}/.test(label) ? label : label.toLowerCase();
  const control = input !== "primary_fuel" && input !== "unit_type";
  const curves = useMemo(
    () =>
      chosen.map((m) => ({
        model: m,
        points: scopeCategory(m.artifact, scope.rows, input),
      })),
    [chosen, scope.rows, input],
  );
  const name = (value: string | number) =>
    typeof value === "number"
      ? unit
        ? value
          ? "Yes"
          : "No"
        : value
          ? "All units"
          : "No units"
      : value;
  // Highest first, by the first model.
  const order = curves[0]!.points
    .map((q, i) => ({ q, i }))
    .sort((a, b) => b.q.prediction - a.q.prediction)
    .map(({ i }) => i);

  const reading = curves.map(({ model: m, points }) => {
    const who = capitalize(modelName(m));
    const sorted = [...points].sort((a, b) => b.prediction - a.prediction);
    const top = sorted[0]!;
    const bottom = sorted.at(-1)!;
    if (top.prediction - bottom.prediction < Math.abs(top.prediction) * 0.01)
      return `${who} barely responds to the ${lower}.`;
    if (control) {
      const on = points.find((q) => q.value === 1)!;
      const off = points.find((q) => q.value === 0)!;
      const pct = off.prediction
        ? (on.prediction / off.prediction - 1) * 100
        : 0;
      return `${who} predicts ${Math.abs(Math.round(pct))} % ${pct < 0 ? "less" : "more"} NOₓ ${unit ? `with ${label} than without it` : `with ${label} on every unit than on none`}.`;
    }
    return `${who} predicts the most NOₓ with ${top.value} and the least with ${bottom.value}.`;
  });

  return (
    <>
      <Takeaways items={reading} />
      <ChartFrame
        title={`Predicted NOₓ for each ${lower}${control ? " setting" : ""}`}
        subtitle={`${capitalize(place)}, short tons${unit ? "" : ", with every unit set the same way"}. "(reported)" marks how it is now.`}
        note="Each bar swaps only this input. A fuel or unit type changes what the model assumes about the whole unit, so read the bars as how the models respond, not what a real conversion would do."
        filename={`sensitivity-${input}`}
        height={order.length * 26}
        table={{
          head: [
            "model",
            input,
            "as_reported",
            "predicted_nox_tons",
            "change_pct",
          ],
          rows: curves.flatMap(({ model: m, points }) =>
            points.map((q) => [
              m.id,
              name(q.value),
              q.reported,
              q.prediction,
              q.diffPct,
            ]),
          ),
        }}
      >
        <ChartGrid>
          {curves.map(({ model: m, points }) => (
            <div key={m.kind} className="min-w-0 space-y-1">
              {chosen.length > 1 && (
                <p className="text-fg-muted text-sm font-medium">
                  {shortName(m)} model
                </p>
              )}
              <BarList
                unit="t"
                format={(v) => `${formatStat(v)} t`}
                rows={order.map((i) => {
                  const q = points[i]!;
                  return {
                    label: q.reported
                      ? `${name(q.value)} (reported)`
                      : String(name(q.value)),
                    value: q.prediction,
                    color: MODEL_COLORS[m.kind],
                    details: q.reported
                      ? []
                      : [
                          {
                            label: "vs. as reported",
                            value: `${q.diff > 0 ? "+" : ""}${formatStat(q.diff)} t (${formatPct(q.diffPct)})`,
                          },
                        ],
                  };
                })}
              />
            </div>
          ))}
        </ChartGrid>
      </ChartFrame>
    </>
  );
}
