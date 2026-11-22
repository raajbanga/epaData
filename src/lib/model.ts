/**
 * Prediction without Python: the models ml/train.py registers carry their
 * preprocessing and parameters as JSON, and these functions reproduce scikit-learn's
 * predictions exactly (checked against ml/fixtures/parity.json by model.test.ts). Keep
 * `modelInputs` and `designRow` in step with `model_inputs` and `design_matrix` in ml/train.py.
 */
import { formatSigned } from "./analysis";
import { shortNumber } from "./utils";

/** A unit-year as ml/train.py's query reads it (snake_case, as stored). */
export interface ModelRaw {
  year: number;
  primary_fuel: string | null;
  unit_type: string | null;
  nameplate_capacity_mw: number | null;
  commercial_op_date: string | null;
  operating_hours: number | null;
  gross_generation_mwh: number | null;
  heat_input_mmbtu: number | null;
  nox_controls: string | null;
  prev_nox_mass_tons: number | null;
  prev_heat_input_mmbtu: number | null;
  prev_operating_hours: number | null;
}

/** NOₓ controls the models see, as on/off inputs (matched case-insensitively). */
const CONTROLS = {
  scr: { label: "SCR", pattern: /selective catalytic/ },
  sncr: { label: "SNCR", pattern: /non-catalytic/ },
  low_nox_burner: { label: "Low-NOₓ burners", pattern: /low nox/ },
  injection: {
    label: "Water/steam/ammonia injection",
    pattern: /water injection|steam injection|ammonia injection/,
  },
  overfire_air: { label: "Overfire air", pattern: /overfire|ofa/ },
} as const;
export type Control = keyof typeof CONTROLS;

/** The numeric inputs, with labels and units for the sensitivity controls. */
/**
 * The years the saved model was fit on. Tuning trains on `trainYears` and scores `validationYears`;
 * the registered model is then refit on both, so its fit years span the two.
 */
export const fitYears = (m: { trainYears: string; validationYears: string }) =>
  `${m.trainYears.split("-")[0]}-${m.validationYears.split("-").at(-1)}`;

/** Model colors: kept apart from the fuel colors (amber coal, green gas, blue hydro, rose oil). */
/** Each model's chart color (globals.css palette): the baseline stays neutral. */
export const MODEL_COLORS: Record<string, string> = {
  baseline: "var(--chart-sand)",
  ridge: "var(--chart-slate)",
  tree: "var(--chart-plum)",
};

/** The numeric inputs: labels and units for the controls, and the change in plain words. */
export const NUMERIC_INPUTS = {
  heat_input_mmbtu: {
    label: "Heat input",
    unit: "MMBtu",
    less: "less fuel burned",
    more: "more fuel burned",
  },
  gross_load_mwh: {
    label: "Gross load",
    unit: "MWh",
    less: "less power generated",
    more: "more power generated",
  },
  operating_hours: {
    label: "Operating time",
    unit: "hr",
    less: "fewer hours run",
    more: "more hours run",
  },
  nameplate_mw: {
    label: "Nameplate capacity",
    unit: "MW",
    less: "smaller units",
    more: "larger units",
  },
  unit_age: {
    label: "Unit age",
    unit: "years",
    less: "younger units",
    more: "older units",
  },
  prior_nox_rate: {
    label: "Prior-year NOₓ rate",
    unit: "lb/MMBtu",
    less: "lower NOₓ rates last year",
    more: "higher NOₓ rates last year",
  },
  prior_operating_hours: {
    label: "Prior-year operating time",
    unit: "hr",
    less: "fewer hours run last year",
    more: "more hours run last year",
  },
} as const;
export type NumericInput = keyof typeof NUMERIC_INPUTS;

type ModelInputs = Record<NumericInput, number | null> &
  Record<Control, number> & { primary_fuel: string; unit_type: string };

export function modelInputs(raw: ModelRaw): ModelInputs {
  const codYear = Number(raw.commercial_op_date?.slice(0, 4));
  const prevHeat = raw.prev_heat_input_mmbtu;
  const controls = (raw.nox_controls ?? "").toLowerCase();
  return {
    heat_input_mmbtu: raw.heat_input_mmbtu,
    gross_load_mwh: raw.gross_generation_mwh,
    operating_hours: raw.operating_hours,
    nameplate_mw: raw.nameplate_capacity_mw,
    unit_age:
      Number.isFinite(codYear) && raw.commercial_op_date
        ? Math.max(0, raw.year - codYear)
        : null,
    prior_nox_rate:
      prevHeat !== null && prevHeat > 0 && raw.prev_nox_mass_tons !== null
        ? (raw.prev_nox_mass_tons * 2000) / prevHeat
        : null,
    prior_operating_hours: raw.prev_operating_hours,
    primary_fuel: raw.primary_fuel ?? "Not reported",
    unit_type: raw.unit_type ?? "Not reported",
    ...(Object.fromEntries(
      Object.entries(CONTROLS).map(([k, c]) => [
        k,
        c.pattern.test(controls) ? 1 : 0,
      ]),
    ) as Record<Control, number>),
  };
}

interface Spec {
  numeric: {
    name: NumericInput;
    log: boolean;
    median: number;
    mean: number;
    scale: number;
  }[];
  categorical: { name: "primary_fuel" | "unit_type"; categories: string[] }[];
  binary: Control[];
}

export interface ModelArtifact {
  kind: "baseline" | "ridge" | "tree";
  spec: Spec;
  featureNames: string[];
  ranges: {
    numeric: Record<NumericInput, [number, number]>;
    categorical: Record<"primary_fuel" | "unit_type", string[]>;
  };
  importance: Record<string, number>;
  coef?: number[];
  intercept?: number;
  logTarget?: boolean;
  tree?: {
    left: number[];
    right: number[];
    feature: number[];
    threshold: number[];
    value: number[];
  };
  table?: Record<string, number>;
  overall?: number;
}

/** Impute, log, standardize, one-hot, and controls, in the training column order. */
function designRow(inputs: ModelInputs, spec: Spec) {
  const row: number[] = [];
  for (const f of spec.numeric) {
    let x = inputs[f.name] ?? f.median;
    if (f.log) x = Math.log1p(Math.max(0, x));
    row.push((x - f.mean) / f.scale);
  }
  for (const f of spec.categorical) {
    for (const c of f.categories) row.push(inputs[f.name] === c ? 1 : 0);
  }
  for (const name of spec.binary) row.push(inputs[name]);
  return row;
}

/** Predicted NOₓ (short tons) for one unit-year's inputs. */
export function predict(model: ModelArtifact, inputs: ModelInputs) {
  if (model.kind === "baseline") {
    return (
      model.table![`${inputs.primary_fuel}|${inputs.unit_type}`] ??
      model.overall!
    );
  }
  const x = designRow(inputs, model.spec);
  if (model.kind === "ridge") {
    const z = x.reduce(
      (s, xi, i) => s + xi * model.coef![i]!,
      model.intercept!,
    );
    return Math.max(0, model.logTarget ? Math.expm1(z) : z);
  }
  // scikit-learn trees compare float32 features against their thresholds.
  const t = model.tree!;
  let node = 0;
  while (t.left[node] !== -1) {
    node =
      Math.fround(x[t.feature[node]!]!) <= t.threshold[node]!
        ? t.left[node]!
        : t.right[node]!;
  }
  return t.value[node]!;
}

/** Inputs outside what the model saw in training: values past the min–max, or unseen categories. */
export function outOfRange(model: ModelArtifact, inputs: ModelInputs) {
  const warnings: string[] = [];
  for (const [name, [min, max]] of Object.entries(model.ranges.numeric) as [
    NumericInput,
    [number, number],
  ][]) {
    const v = inputs[name];
    if (v !== null && (v < min || v > max)) warnings.push(name);
  }
  for (const [name, seen] of Object.entries(model.ranges.categorical) as [
    "primary_fuel" | "unit_type",
    string[],
  ][]) {
    if (!seen.includes(inputs[name])) warnings.push(name);
  }
  return warnings;
}

const CATEGORY_LABELS: Record<string, string> = {
  primary_fuel: "Primary fuel",
  unit_type: "Unit type",
};

/** A model input or feature in words: "heat_input_mmbtu" → "Heat input", "primary_fuel=Coal" → "Primary fuel: Coal". */
export function featureLabel(name: string) {
  const [field = name, category] = name.split("=");
  const label =
    field in NUMERIC_INPUTS
      ? NUMERIC_INPUTS[field as NumericInput].label
      : field in CONTROLS
        ? CONTROLS[field as Control].label
        : (CATEGORY_LABELS[field] ?? field);
  return category ? `${label}: ${category}` : label;
}

/** Percentage change from `base`; null when the base is 0, where it is undefined. */
export const percentChange = (value: number, base: number) =>
  base ? (value / base - 1) * 100 : null;

const scaleBy = (v: number | null, pct: number) =>
  v === null ? null : v * (1 + pct / 100);

/** "26.4M", "7,839", "0.2266": an input value as the tooltips show it. */
const inputNumber = (v: number) =>
  shortNumber(v) ??
  v.toLocaleString("en-US", {
    maximumSignificantDigits: Math.abs(v) < 1 ? 4 : 6,
  });

/**
 * Scenario inputs: each input a scenario changes, with its value and the baseline's, e.g.
 * "Heat input 25.1M MMBtu (from 26.4M)", "SCR yes (from no)".
 */
export function changedInputs(base: ModelInputs, inputs: ModelInputs) {
  return (Object.keys(inputs) as (keyof ModelInputs)[]).flatMap((key) => {
    const [now, was] = [inputs[key], base[key]];
    if (now === was) return [];
    if (key in NUMERIC_INPUTS) {
      const unit = NUMERIC_INPUTS[key as NumericInput].unit;
      const show = (v: unknown) =>
        typeof v === "number" ? inputNumber(v) : "missing";
      return [`${featureLabel(key)} ${show(now)} ${unit} (from ${show(was)})`];
    }
    if (key in CONTROLS)
      return [
        `${featureLabel(key)} ${now ? "yes" : "no"} (from ${was ? "yes" : "no"})`,
      ];
    return [`${featureLabel(key)} ${String(now)} (from ${String(was)})`];
  });
}

/** Over a category: the non-numeric inputs a sensitivity can vary, one value at a time. */
export const CATEGORY_INPUTS = {
  primary_fuel: "Primary fuel",
  unit_type: "Unit type",
  ...(Object.fromEntries(
    Object.entries(CONTROLS).map(([k, c]) => [k, c.label]),
  ) as Record<Control, string>),
} as Record<"primary_fuel" | "unit_type" | Control, string>;
export type CategoryInput = keyof typeof CATEGORY_INPUTS;

export const isCategoryInput = (key: string): key is CategoryInput =>
  key in CATEGORY_INPUTS;

/**
 * Residuals by group (fuel class): how many test unit-years, the average signed error
 * (predicted − actual; above 0 the model over-predicts the group), and the mean absolute error.
 * Ordered by mean absolute error, largest first.
 */
export function residualsByGroup(
  points: { group: string; actual: number; predicted: number | null }[],
) {
  const groups = new Map<string, number[]>();
  for (const p of points) {
    if (p.predicted === null || !Number.isFinite(p.predicted)) continue;
    groups.set(p.group, [
      ...(groups.get(p.group) ?? []),
      p.predicted - p.actual,
    ]);
  }
  return [...groups]
    .map(([group, errors]) => ({
      group,
      n: errors.length,
      bias: errors.reduce((s, e) => s + e, 0) / errors.length,
      mae: errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length,
    }))
    .sort((a, b) => b.mae - a.mae);
}

/**
 * A what-if scenario, applied the same way to every unit in a scope: gross load and heat input
 * scaled by a percentage (−100 % at most: neither can go below zero), SCR kept, added, or removed,
 * and the primary fuel kept ("") or set.
 */
export interface ScenarioSpec {
  load: number;
  heat: number;
  scr: "" | "add" | "remove";
  fuel: string;
}
export const AS_REPORTED: ScenarioSpec = {
  load: 0,
  heat: 0,
  scr: "",
  fuel: "",
};

/**
 * The changes a what-if offers, as the question reads them ("What if … ran 10 % more?") and as a
 * short label for charts. Running more or less moves fuel burned and power together; burning less
 * fuel for the same power is efficiency.
 */
export const WHAT_IF_CHANGES: {
  key: string;
  label: string;
  phrase: string;
  /** What the change means, for someone who doesn't know the terms. */
  explain: string;
  spec: ScenarioSpec;
}[] = [
  {
    key: "scr",
    label: "Add SCR",
    phrase: "added SCR",
    explain: "Install SCR, a filter that removes most NOₓ from the exhaust.",
    spec: { ...AS_REPORTED, scr: "add" },
  },
  {
    key: "noscr",
    label: "Remove SCR",
    phrase: "removed SCR",
    explain: "Take out the SCR filter, if the unit has one.",
    spec: { ...AS_REPORTED, scr: "remove" },
  },
  {
    key: "more",
    label: "Run 10 % more",
    phrase: "ran 10 % more",
    explain: "Make 10 % more power, burning 10 % more fuel.",
    spec: { ...AS_REPORTED, load: 10, heat: 10 },
  },
  {
    key: "less",
    label: "Run 10 % less",
    phrase: "ran 10 % less",
    explain: "Make 10 % less power, burning 10 % less fuel.",
    spec: { ...AS_REPORTED, load: -10, heat: -10 },
  },
  {
    key: "load",
    label: "10 % more load",
    phrase: "made 10 % more power from the same fuel",
    explain:
      "Gross load up 10 %, heat input as reported: more power from the same fuel.",
    spec: { ...AS_REPORTED, load: 10 },
  },
  {
    key: "efficient",
    label: "5 % less fuel",
    phrase: "burned 5 % less fuel for the same power",
    explain: "Make the same power from 5 % less fuel (a more efficient unit).",
    spec: { ...AS_REPORTED, heat: -5 },
  },
  {
    key: "highefficiency",
    label: "5 % less fuel + SCR",
    phrase: "burned 5 % less fuel and added SCR",
    explain:
      "A combined high-efficiency upgrade: the same power from 5 % less fuel, plus SCR.",
    spec: { ...AS_REPORTED, heat: -5, scr: "add" },
  },
  {
    key: "gas",
    label: "Switch to gas",
    phrase: "switched to natural gas",
    explain: "Burn natural gas instead of its current fuel.",
    spec: { ...AS_REPORTED, fuel: "Pipeline Natural Gas" },
  },
  {
    key: "coal",
    label: "Switch to coal",
    phrase: "switched to coal",
    explain: "Burn coal instead of its current fuel.",
    spec: { ...AS_REPORTED, fuel: "Coal" },
  },
];

export const sameScenario = (a: ScenarioSpec, b: ScenarioSpec) =>
  a.load === b.load &&
  a.heat === b.heat &&
  a.scr === b.scr &&
  a.fuel === b.fuel;

/** One unit's inputs under a scenario. */
export function applyScenario(base: ModelInputs, s: ScenarioSpec): ModelInputs {
  return {
    ...base,
    gross_load_mwh: scaleBy(base.gross_load_mwh, Math.max(-100, s.load)),
    heat_input_mmbtu: scaleBy(base.heat_input_mmbtu, Math.max(-100, s.heat)),
    scr: s.scr === "add" ? 1 : s.scr === "remove" ? 0 : base.scr,
    primary_fuel: s.fuel || base.primary_fuel,
  };
}

/** The scenario in a few words: "Power output +10 %, add SCR". */
export function describeScenario(s: ScenarioSpec) {
  const signed = (p: number) => formatSigned(p, "%");
  const parts = [
    s.load && `power output ${signed(s.load)}`,
    s.heat && `fuel burned ${signed(s.heat)}`,
    s.scr === "add" && "add SCR",
    s.scr === "remove" && "remove SCR",
    s.fuel && `fuel: ${s.fuel}`,
  ].filter(Boolean) as string[];
  const text = parts.join(", ") || "as reported";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A unit-year in a what-if scope: who it is, its actual NOₓ, and its model inputs. */
export interface ScopeRow {
  facilityId: number;
  facilityName: string;
  stateCode: string;
  unitId: string;
  actual: number;
  inputs: ModelInputs;
}

/**
 * One model over a scope, as reported and under a scenario: predicted NOₓ (short tons) summed over
 * the units, the NOₓ rates (lb/MMBtu, lb/MWh) from the summed heat input and gross load, how many
 * units the scenario takes outside the training data, and each unit's change (largest first).
 */
export function scopeTotals(
  model: ModelArtifact,
  rows: readonly ScopeRow[],
  spec: ScenarioSpec,
) {
  let base = 0;
  let scenario = 0;
  let heat = 0;
  let load = 0;
  let baseHeat = 0;
  let baseLoad = 0;
  let outside = 0;
  const units = rows.map((r) => {
    const x = applyScenario(r.inputs, spec);
    const p0 = predict(model, r.inputs);
    const p1 = predict(model, x);
    base += p0;
    scenario += p1;
    heat += x.heat_input_mmbtu ?? 0;
    load += x.gross_load_mwh ?? 0;
    baseHeat += r.inputs.heat_input_mmbtu ?? 0;
    baseLoad += r.inputs.gross_load_mwh ?? 0;
    if (outOfRange(model, x).length) outside++;
    return { row: r, base: p0, scenario: p1, diff: p1 - p0 };
  });
  /** lb per unit of `denominator`; null without one. */
  const rate = (tons: number, denominator: number) =>
    denominator > 0 ? (tons * 2000) / denominator : null;
  return {
    base,
    scenario,
    diff: scenario - base,
    diffPct: percentChange(scenario, base),
    rate: { base: rate(base, baseHeat), scenario: rate(scenario, heat) },
    perMWh: { base: rate(base, baseLoad), scenario: rate(scenario, load) },
    outside,
    units: units.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
  };
}
export type ScopeTotals = ReturnType<typeof scopeTotals>;

/**
 * The values a sensitivity steps through, from `from` to `to` by `step`, with `include` (the
 * baseline) added. Inputs it can't use are corrected and said in `notes`: a range entered high to
 * low is read low to high, a missing or non-positive step becomes a twentieth of the range, and a
 * step too small for `limit` points is widened.
 */
export function sensitivityGrid(
  from: number,
  to: number,
  step: number,
  { include, limit = 200 }: { include?: number; limit?: number } = {},
) {
  const notes: string[] = [];
  let [lo, hi] = [from, to];
  if (!Number.isFinite(lo) || !Number.isFinite(hi))
    return { values: include === undefined ? [] : [include], notes };
  if (lo > hi) {
    [lo, hi] = [hi, lo];
    notes.push("The range was entered high to low, so it is read low to high.");
  }
  const span = hi - lo;
  if (!(step > 0)) {
    step = span / 20 || 1;
    notes.push(
      `The step must be above zero, so it is ${Number(step.toPrecision(3))}.`,
    );
  }
  if (span / step > limit) {
    step = span / limit;
    notes.push(
      `That step would draw more than ${limit} points, so it is ${Number(step.toPrecision(3))}.`,
    );
  }
  const values = new Set<number>();
  const n = Math.floor(span / step + 1e-9);
  for (let i = 0; i <= n; i++)
    values.add(Number((lo + i * step).toPrecision(12)));
  values.add(hi);
  if (include !== undefined && Number.isFinite(include)) values.add(include);
  return { values: [...values].sort((a, b) => a - b), notes };
}

/** A scope's summed prediction with each unit's inputs changed by `change`. */
const scopePrediction = (
  model: ModelArtifact,
  rows: readonly ScopeRow[],
  change: (x: ModelInputs) => ModelInputs,
) => rows.reduce((s, r) => s + predict(model, change(r.inputs)), 0);

/**
 * A scope's summed prediction as one numeric input moves by each percentage of every unit's own
 * value (a group has no single value to set), everything else as reported. A unit missing the
 * input keeps the training median, unchanged.
 */
export function scopeSensitivity(
  model: ModelArtifact,
  rows: readonly ScopeRow[],
  input: NumericInput,
  percents: readonly number[],
) {
  const base = scopePrediction(model, rows, (x) => x);
  const [min, max] = model.ranges.numeric[input];
  return percents.map((pct) => {
    const prediction = scopePrediction(model, rows, (x) => ({
      ...x,
      [input]: scaleBy(x[input], pct),
    }));
    const outside = rows.filter((r) => {
      const v = scaleBy(r.inputs[input], pct);
      return v !== null && (v < min || v > max);
    }).length;
    return {
      pct,
      prediction,
      diff: prediction - base,
      diffPct: percentChange(prediction, base),
      outside,
    };
  });
}

/**
 * A scope's summed prediction with every unit set to each value of a category input the training
 * data had (each fuel, each unit type, or a control off and on).
 */
export function scopeCategory(
  model: ModelArtifact,
  rows: readonly ScopeRow[],
  input: CategoryInput,
) {
  const base = scopePrediction(model, rows, (x) => x);
  const known: (string | number)[] =
    input === "primary_fuel" || input === "unit_type"
      ? [...model.ranges.categorical[input]]
      : [0, 1];
  return known.map((value) => {
    const prediction = scopePrediction(model, rows, (x) => ({
      ...x,
      [input]: value,
    }));
    return {
      value,
      prediction,
      diff: prediction - base,
      diffPct: percentChange(prediction, base),
      // Every unit already has this value: the bar is the scope as reported.
      reported: rows.every((r) => r.inputs[input] === value),
    };
  });
}

/** A standardized (and maybe logged) value back in the input's own unit. */
function rawValue(spec: Spec["numeric"][number], z: number) {
  const x = z * spec.scale + spec.mean;
  return spec.log ? Math.expm1(x) : x;
}

/**
 * Where a decision tree's prediction can change as one numeric input moves: the input's split
 * thresholds in its own unit, ascending. Between two of them the tree predicts one value, which is
 * why its curve is a staircase. Empty for a model without a tree.
 */
export function treeBreakpoints(model: ModelArtifact, input: NumericInput) {
  const t = model.tree;
  const index = model.spec.numeric.findIndex((f) => f.name === input);
  if (!t || index < 0) return [];
  const spec = model.spec.numeric[index]!;
  const out = new Set<number>();
  t.feature.forEach((f, node) => {
    if (t.left[node] !== -1 && f === index)
      out.add(rawValue(spec, t.threshold[node]!));
  });
  return [...out].filter((v) => v >= 0).sort((a, b) => a - b);
}

/**
 * The checks a decision tree makes for one unit-year, root to leaf, each in the input's own terms
 * ("Heat input above 20.1M MMBtu", "Primary fuel is not Coal", "SCR: no"), and the leaf's value.
 * Null for a model without a tree.
 */
export function treePath(model: ModelArtifact, inputs: ModelInputs) {
  const t = model.tree;
  if (!t) return null;
  const x = designRow(inputs, model.spec);
  const steps: { feature: string; text: string }[] = [];
  let node = 0;
  while (t.left[node] !== -1) {
    const f = t.feature[node]!;
    const name = model.featureNames[f]!;
    const below = Math.fround(x[f]!) <= t.threshold[node]!;
    const numeric = model.spec.numeric[f];
    let text: string;
    if (numeric) {
      const meta = NUMERIC_INPUTS[numeric.name];
      const v = inputNumber(rawValue(numeric, t.threshold[node]!));
      text = `${meta.label} ${below ? "at most" : "above"} ${v} ${meta.unit}`;
    } else {
      // One-hot and on/off columns split at 0.5: the low side means "not this".
      const [field = name, category] = name.split("=");
      text = category
        ? `${featureLabel(field)} ${below ? "is not" : "is"} ${category}`
        : `${featureLabel(field)}: ${below ? "no" : "yes"}`;
    }
    steps.push({ feature: name.split("=")[0]!, text });
    node = below ? t.left[node]! : t.right[node]!;
  }
  return { steps, value: t.value[node]! };
}

/** "Ridge", "Tree": a model's short name, for chart keys and bar labels. */
export const shortName = (m: { kind: string; name: string }) =>
  m.kind === "tree" ? "Tree" : m.kind === "ridge" ? "Ridge" : m.name;
