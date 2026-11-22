"use client";

import { useMemo } from "react";
import { BarList } from "~/components/charts/bars";
import { Lines } from "~/components/charts/lines";
import { ChartGrid, ChartFrame } from "~/components/ui/chart";
import { Section } from "~/components/ui/report";
import { Input } from "~/components/ui/input";
import { Select } from "~/components/ui/select";
import { BLANK, QuestionSentence } from "~/components/ui/question-sentence";
import { Takeaways } from "~/components/ui/takeaways";
import { sensitivitySentences } from "~/lib/takeaways";
import { capitalize, inSentence, plural } from "~/lib/utils";
import { formatPct, formatSigned, formatStat } from "~/lib/analysis";
import {
  CATEGORY_INPUTS,
  isCategoryInput,
  MODEL_COLORS,
  NUMERIC_INPUTS,
  percentChange,
  predict,
  scopeCategory,
  scopeSensitivity,
  sensitivityGrid,
  treeBreakpoints,
  type CategoryInput,
  type NumericInput,
  shortName,
} from "~/lib/model";
import {
  modelName,
  modelSeries,
  type Model,
  type WhatIfProps,
} from "./predict-view";

/** The range a sensitivity opens on, and the one any new input starts from. */
const DEFAULT_RANGE = { by: "pct", from: "-50", to: "50", step: "5" };

/** A value as the axis and inputs show it: "26.4M", "0.231". */
const axisValue = (v: number) => formatStat(Number(v.toPrecision(3)));
/** A number for an input field: three significant digits, no grouping. */
const fieldValue = (v: number) => String(Number(v.toPrecision(3)));

/**
 * The varied input's range as the user set it: by percent of each unit's value, or (one unit) in
 * the input's own unit. A group always uses percent, since its units have no single value.
 */
function rangeOf(view: WhatIfProps["view"], unit: boolean) {
  const own = unit && view.by === "unit";
  // A unit-valued range left from a one-unit question means nothing for a group.
  const r = !unit && view.by === "unit" ? DEFAULT_RANGE : view;
  return {
    own,
    from: Number(r.from),
    to: Number(r.to),
    step: Number(r.step),
  };
}

/**
 * The question: which input, from what to what, in which steps. Switching between percent and the
 * input's own unit converts the range at the unit's current value.
 */
function VaryControls({
  view,
  setView,
  unit,
  numeric,
  meta,
  value0,
}: Pick<WhatIfProps, "view" | "setView" | "unit"> & {
  numeric: boolean;
  meta: (typeof NUMERIC_INPUTS)[NumericInput] | undefined;
  /** The unit's current value of the input (one unit only). */
  value0: number | null;
}) {
  const own = unit && view.by === "unit";
  // A group reads a unit-valued range as the default; editing it starts from that default.
  const stale = !unit && view.by === "unit";
  const field = (key: "from" | "to" | "step", label: string) => (
    <Input
      type="number"
      aria-label={label}
      value={stale ? DEFAULT_RANGE[key] : view[key]}
      onChange={(e) =>
        setView({
          ...(stale ? DEFAULT_RANGE : {}),
          [key]: e.target.value,
        })
      }
      className="h-9 w-24"
    />
  );
  const convert = (by: string) => {
    if (by === view.by || !value0) return setView({ by });
    const toUnit = by === "unit";
    const map = (v: string) =>
      fieldValue(
        toUnit
          ? value0 * (1 + Number(v) / 100)
          : (Number(v) / value0 - 1) * 100,
      );
    setView({
      by,
      from: map(view.from),
      to: map(view.to),
      step: fieldValue(
        toUnit
          ? (value0 * Number(view.step)) / 100
          : (Number(view.step) / value0) * 100,
      ),
    });
  };
  return (
    <QuestionSentence label="Sensitivity question">
      <span>How does the prediction change if</span>
      <Select
        aria-label="Input to vary"
        value={view.input}
        // A new input starts from the default range: another input's values mean nothing here.
        onValueChange={(input) => setView({ input, ...DEFAULT_RANGE })}
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
      {numeric && meta ? (
        <>
          <span>goes from</span>
          {field("from", "Minimum")}
          <span>to</span>
          {field("to", "Maximum")}
          {unit ? (
            <Select
              aria-label="Range in"
              value={own ? "unit" : "pct"}
              onValueChange={convert}
              className={BLANK}
              options={[
                { value: "pct", label: "% of its value" },
                { value: "unit", label: meta.unit },
              ]}
            />
          ) : (
            <span>% of each unit&apos;s value</span>
          )}
          <span>in steps of</span>
          {field("step", "Step")}
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
  const value0 =
    props.unit && numeric
      ? (props.scope.rows[0]?.inputs[input] ??
        props.chosen[0]!.artifact.spec.numeric.find((f) => f.name === input)
          ?.median ??
        null)
      : null;
  return (
    <Section
      title="How the prediction responds to one input"
      note="Everything else stays as reported."
    >
      <VaryControls
        {...props}
        numeric={numeric}
        meta={numeric ? NUMERIC_INPUTS[input] : undefined}
        value0={value0}
      />
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

/** Corrections to the range, under the question. */
function RangeNotes({ notes }: { notes: string[] }) {
  return notes.length ? (
    <ul className="text-fg-muted space-y-0.5 text-sm">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  ) : null;
}

/** "50 % less fuel burned", "heat input at 39.6M MMBtu": one end of the range in words. */
function endPhrase(
  meta: (typeof NUMERIC_INPUTS)[NumericInput],
  own: boolean,
  value: number,
  value0: number,
) {
  // The unit's value as it is: not an end worth a sentence.
  if (Math.abs(value - value0) < 1e-9 * Math.max(1, Math.abs(value0)))
    return null;
  if (own)
    return `${inSentence(meta.label)} at ${axisValue(value)} ${meta.unit}`;
  const pct = percentChange(value, value0);
  if (pct === null) return null;
  return `${Number(Math.abs(pct).toPrecision(3))} % ${pct < 0 ? meta.less : meta.more}`;
}

/** "+12 t (+3.4 %)": a model's change from its prediction as reported. */
const changeText = (diff: number, base: number) =>
  `${formatSigned(diff, "t")} (${formatPct(percentChange(base + diff, base))})`;

/**
 * One unit: the prediction at each step of the range, plus, for the tree, at each of its cut
 * points, so its staircase steps exactly where the tree's thresholds are.
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
  const range = rangeOf(view, true);
  const tree = chosen.find((m) => m.kind === "tree");

  const { grid, rows, jumps, lo, hi, notes } = useMemo(() => {
    const toValue = (v: number) => (range.own ? v : value0 * (1 + v / 100));
    const g = sensitivityGrid(range.from, range.to, range.step, {
      include: range.own ? value0 : 0,
    });
    // A physical input can't go below zero: those steps are left out, and said.
    const all = g.values.map(toValue);
    const grid = all.filter((x) => x >= 0);
    const notes = [...g.notes];
    if (!range.own && value0 === 0)
      notes.push(
        `This unit's ${inSentence(meta.label)} is 0, and a percentage of 0 is still 0: choose ${meta.unit} to vary it.`,
      );
    if (grid.length < all.length)
      notes.push(
        `${plural(all.length - grid.length, "value")} below zero ${all.length - grid.length === 1 ? "was" : "were"} left out: ${inSentence(meta.label)} can't be negative.`,
      );
    const lo = grid[0] ?? value0;
    const hi = grid.at(-1) ?? value0;
    // Just past each cut point, so the step lands on it.
    const cuts = tree
      ? treeBreakpoints(tree.artifact, input).filter((c) => c > lo && c < hi)
      : [];
    const xs = new Set([...grid, value0]);
    for (const c of cuts) xs.add(c * (1 + 1e-9) + 1e-12);
    const at = (x: number): { x: number } & Record<string, number> => ({
      x,
      ...Object.fromEntries(
        chosen.map((m) => [
          m.kind,
          predict(m.artifact, { ...base, [input]: x }),
        ]),
      ),
    });
    const rows = [...xs].sort((a, b) => a - b).map(at);
    // Where the tree's prediction actually changes (most cut points don't apply to this unit).
    const jumps = tree
      ? rows
          .filter((r, i) => i > 0 && r.tree !== rows[i - 1]!.tree)
          .map((r) => r.x)
      : [];
    return { grid: grid.map(at), rows, jumps, lo, hi, notes };
  }, [
    chosen,
    base,
    input,
    value0,
    range.own,
    range.from,
    range.to,
    range.step,
    tree,
    meta.label,
    meta.unit,
  ]);

  const at0 = (m: Model) => predict(m.artifact, base);
  // Null (no percentage) when the unit's value is 0.
  const pctOf = (x: number) => percentChange(x, value0);
  const reading = [
    ...sensitivitySentences({
      low: endPhrase(meta, range.own, lo, value0),
      high: endPhrase(meta, range.own, hi, value0),
      results: chosen.map((m) => ({
        model: modelName(m),
        low: percentChange(rows[0]![m.kind]!, at0(m)),
        high: percentChange(rows.at(-1)![m.kind]!, at0(m)),
        lowTons: rows[0]![m.kind]! - at0(m),
        highTons: rows.at(-1)![m.kind]! - at0(m),
      })),
    }),
    (lo < min || hi > max) &&
      `Part of this range is **outside the training data** (${formatStat(min)}–${formatStat(max)} ${meta.unit}), shaded on the chart: treat those predictions as extrapolations.`,
    tree &&
      (jumps.length
        ? `The tree's line is a staircase: it only changes when ${inSentence(meta.label)} crosses ${jumps.length === 1 ? "one threshold" : `one of ${jumps.length} thresholds`} (such as ${jumps.slice(0, 2).map(axisValue).join(" or ")} ${meta.unit}), and stays flat in between.`
        : `The tree's line is flat: none of its thresholds for ${inSentence(meta.label)} falls in this range for this unit.`),
  ];

  return (
    <>
      <RangeNotes notes={notes} />
      <Takeaways items={reading} />
      <ChartFrame
        title={`Predicted NOₓ as ${inSentence(meta.label)} changes`}
        subtitle={`${capitalize(place)}, short tons. **The dot and dashed lines mark how it is now.** Shaded areas are values the models never saw, so treat them as guesses.`}
        note={`Training data range: ${formatStat(min)}–${formatStat(max)} ${meta.unit}. The tree's line is drawn as steps because it only predicts a handful of values: the average NOₓ of the training unit-years that answer its yes/no questions the same way.`}
        legend={modelSeries(chosen)}
        filename={`sensitivity-${input}`}
        height={340}
        table={{
          head: [
            `${input} (${meta.unit})`,
            `${input}_change_pct`,
            "outside_training_range",
            ...chosen.flatMap((m) => [
              `${m.kind}_predicted_nox_tons`,
              `${m.kind}_change_tons`,
              `${m.kind}_change_pct`,
            ]),
          ],
          rows: grid.map((r) => [
            r.x,
            pctOf(r.x),
            r.x < min || r.x > max ? "yes" : "no",
            ...chosen.flatMap((m) => [
              r[m.kind]!,
              r[m.kind]! - at0(m),
              percentChange(r[m.kind]!, at0(m)),
            ]),
          ]),
        }}
      >
        <Lines
          height={340}
          xTitle={`${meta.label} (${meta.unit})`}
          unit="t"
          data={rows}
          series={modelSeries(chosen)}
          stepped={["tree"]}
          refLines={[
            { axis: "x", value: value0 },
            ...chosen.map((m) => ({
              axis: "y" as const,
              value: at0(m),
              color: MODEL_COLORS[m.kind],
            })),
          ]}
          bands={[
            ...(lo < min ? [{ from: lo, to: Math.min(min, hi) }] : []),
            ...(hi > max ? [{ from: Math.max(max, lo), to: hi }] : []),
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
            return [
              ...(Math.abs(d) < 1e-9
                ? []
                : [{ label: "vs. as reported", value: changeText(d, at0(m)) }]),
              ...(row.x < min || row.x > max
                ? [{ label: "Range", value: "outside the training data" }]
                : []),
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
  const range = rangeOf(view, false);
  const { percents, notes } = useMemo(() => {
    const g = sensitivityGrid(range.from, range.to, range.step, { include: 0 });
    const percents = g.values.filter((p) => p >= -100);
    const notes = [...g.notes];
    if (percents.length < g.values.length)
      notes.push(
        `Changes below −100 % were left out: ${inSentence(meta.label)} can't be negative.`,
      );
    return { percents, notes };
  }, [range.from, range.to, range.step, meta.label]);
  const curves = useMemo(
    () =>
      chosen.map((m) => ({
        model: m,
        points: scopeSensitivity(m.artifact, scope.rows, input, percents),
      })),
    [chosen, scope.rows, input, percents],
  );
  const zero = Math.max(0, percents.indexOf(0));
  const [min, max] = chosen[0]!.artifact.ranges.numeric[input];
  const outside = curves[0]?.points.map((p) => p.outside) ?? [];
  const reading = [
    ...sensitivitySentences({
      // Percent of each unit's value: 100 is the value as it is.
      low: endPhrase(meta, false, 100 + (percents[0] ?? 0), 100),
      high: endPhrase(meta, false, 100 + (percents.at(-1) ?? 0), 100),
      results: curves.map(({ model: m, points }) => ({
        model: modelName(m),
        low: points[0]?.diffPct ?? null,
        high: points.at(-1)?.diffPct ?? null,
        lowTons: points[0]?.diff,
        highTons: points.at(-1)?.diff,
      })),
    }),
    outside.some((n) => n > 0) &&
      `Where the chart is shaded, up to ${plural(Math.max(...outside), "unit")} of ${scope.rows.length} ${Math.max(...outside) === 1 ? "has" : "have"} ${inSentence(meta.label)} **outside the training data** (${formatStat(min)}–${formatStat(max)} ${meta.unit}): treat those totals as extrapolations.`,
  ];
  // Shade each stretch of steps where some unit leaves the training range.
  const bands: { from: number; to: number }[] = [];
  percents.forEach((p, i) => {
    if (!outside[i]) return;
    const last = bands.at(-1);
    const from = i > 0 && !outside[i - 1] ? (percents[i - 1]! + p) / 2 : p;
    const to =
      i + 1 < percents.length && !outside[i + 1]
        ? (p + percents[i + 1]!) / 2
        : p;
    if (last && i > 0 && outside[i - 1]) last.to = to;
    else bands.push({ from, to });
  });

  return (
    <>
      <RangeNotes notes={notes} />
      <Takeaways items={reading} />
      <ChartFrame
        title={`Total predicted NOₓ as ${inSentence(meta.label)} changes on every unit`}
        subtitle={`${capitalize(place)}, short tons. Left to right: **every unit's value changed by the same percentage**. The dot and dashed lines mark how it is now.`}
        note="Each unit's value is scaled by the same percentage, so a big unit moves more than a small one. The tree's total looks smooth because it adds up many units' steps; pick one unit to see the steps themselves."
        legend={modelSeries(chosen)}
        filename={`sensitivity-${input}-scope`}
        height={340}
        table={{
          head: [
            `${input}_change_pct`,
            "units_outside_training_range",
            ...chosen.flatMap((m) => [
              `${m.kind}_predicted_nox_tons`,
              `${m.kind}_change_tons`,
              `${m.kind}_change_pct`,
            ]),
          ],
          rows: percents.map((p, i) => [
            p,
            outside[i] ?? 0,
            ...curves.flatMap(({ points }) => [
              points[i]!.prediction,
              points[i]!.diff,
              points[i]!.diffPct,
            ]),
          ]),
        }}
      >
        <Lines
          height={340}
          xTitle={`${meta.label}, change on every unit`}
          xFormat={(p) => formatSigned(Number(p.toFixed(1)), "%")}
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
          refLines={[
            { axis: "x", value: 0 },
            ...curves.map(({ model: m, points }) => ({
              axis: "y" as const,
              value: points[zero]!.prediction,
              color: MODEL_COLORS[m.kind],
            })),
          ]}
          bands={bands}
          markers={curves.map(({ model: m, points }) => ({
            x: 0,
            y: points[zero]!.prediction,
            color: MODEL_COLORS[m.kind]!,
          }))}
          tooltipRows={(row, s) => {
            const c = curves.find((c) => c.model.kind === s.key);
            const p = c?.points.find((q) => q.pct === row.x);
            return p && Math.abs(p.diff) > 1e-9
              ? [
                  {
                    label: "vs. as reported",
                    value: changeText(p.diff, p.prediction - p.diff),
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
      const pct = percentChange(on.prediction, off.prediction);
      if (pct === null)
        return `${who} predicts ${formatStat(on.prediction)} t of NOₓ ${unit ? `with ${label}` : `with ${label} on every unit`}, and none without it.`;
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
            "change_tons",
            "change_pct",
          ],
          rows: curves.flatMap(({ model: m, points }) =>
            points.map((q) => [
              m.id,
              name(q.value),
              q.reported,
              q.prediction,
              q.diff,
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
                            value: changeText(q.diff, q.prediction - q.diff),
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
