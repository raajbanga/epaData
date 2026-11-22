/**
 * Plain-language readings of the analysis results: the sentences each Analyze and Predict tab
 * opens with, so a reader gets the answer before the chart and the table. Pure functions over
 * numbers the tabs already have; every one returns null when there's nothing worth saying.
 */
import type { Aggregation } from "./analysis";
import { formatStat } from "./analysis";
import { capitalize, formatNumber, inSentence, plural } from "./utils";

/** "18 %", "0.4 %", "103 %". */
const pct = (share: number) => {
  const p = Math.abs(share * 100);
  return `${p >= 10 ? Math.round(p) : Number(p.toPrecision(2))} %`;
};

/** "5.6×", "103×": a ratio to a sensible precision. */
const times = (x: number) =>
  `${x >= 10 ? formatNumber(Math.round(x)) : x.toFixed(1)}×`;

/** "Total CO₂ mass", "The average heat rate", "The pooled NOₓ rate". */
function measureName(label: string, aggregation: Aggregation) {
  const lower = inSentence(label);
  return aggregation === "sum"
    ? `Total ${lower}`
    : aggregation === "mean"
      ? `The average ${lower}`
      : `The pooled ${lower}`;
}

/** "Total CO₂ mass fell 25 % from 2015 to 2025 (2.1B → 1.6B short tons)." */
export function trendSentence({
  label,
  unit,
  aggregation,
  points,
}: {
  label: string;
  unit: string;
  aggregation: Aggregation;
  points: { year: number; value: number | null }[];
}) {
  const known = points
    .filter((p): p is { year: number; value: number } => p.value !== null)
    .sort((a, b) => a.year - b.year);
  const first = known[0];
  const last = known.at(-1);
  if (!first || !last || first.year === last.year || first.value === 0)
    return null;
  const change = (last.value - first.value) / Math.abs(first.value);
  const span = `from ${first.year} to ${last.year} (${formatStat(first.value)} → ${formatStat(last.value)} ${unit})`;
  // Per year: "the yearly total", so it doesn't read as the overall total said just before.
  const what =
    aggregation === "sum"
      ? `The yearly total of ${inSentence(label)}`
      : measureName(label, aggregation);
  return Math.abs(change) < 0.02
    ? `${what} **stayed about the same** ${span}.`
    : `${what} **${change < 0 ? "fell" : "rose"} ${pct(change)}** ${span}.`;
}

/** "Coal made up 58 % of the total from 12 % of the unit-years." Totals only. */
export function shareSentence(
  groups: { group: string; value: number | null; n: number }[],
) {
  const total = groups.reduce((s, g) => s + (g.value ?? 0), 0);
  const count = groups.reduce((s, g) => s + g.n, 0);
  const top = [...groups].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  if (!top?.value || total <= 0 || groups.length < 2 || !count) return null;
  const share = top.value / total;
  const ofRows = top.n / count;
  return `**${top.group}** units put out **${pct(share)} of the total**${
    Math.abs(share - ofRows) > 0.1
      ? `, though they are only ${pct(ofRows)} of the unit-years`
      : ""
  }.`;
}

/** "The largest, James H Miller Jr (6002), was 1.2 % of it on its own." Totals only. */
export function leaderSentence(
  top: { group: string; value: number | null } | undefined,
  total: number,
  noun = "facility",
) {
  if (!top?.value || total <= 0) return null;
  return `The biggest ${noun}, **${top.group}**, accounts for **${pct(top.value / total)}** of it on its own (${formatStat(top.value)}).`;
}

interface Spread {
  count: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
}

/**
 * "Half of the unit-years fall between 13K and 626K short tons; the typical one is 89K." Plus,
 * when the mean is far from the median, why: a few large values pull it.
 */
export function spreadSentences(s: Spread, unit: string) {
  const out: string[] = [];
  if (s.q1 === null || s.q3 === null || s.median === null || !s.count)
    return out;
  out.push(
    `A typical unit-year has **${formatStat(s.median)} ${unit}** (the median: half have more, half less). The middle half fall between ${formatStat(s.q1)} and ${formatStat(s.q3)}.`,
  );
  if (s.mean !== null && s.median > 0 && s.mean / s.median >= 2)
    out.push(
      `The average is much higher (${formatStat(s.mean)}, **${times(s.mean / s.median)} the typical one**) because a few huge unit-years pull it up, so the typical value describes most units better.`,
    );
  return out;
}

/** "2,077 unit-years (5 %) are far above the rest; the most extreme is …, 103× the median." */
export function outlierSentence(
  u: {
    above: number;
    below: number;
    extreme: { label: string; value: number }[];
  },
  count: number,
  median: number | null,
) {
  const n = u.above + u.below;
  if (!n || !count) return null;
  const top = u.extreme[0];
  const where =
    u.below === 0 ? "far above" : u.above === 0 ? "far below" : "far from";
  const size =
    u.below === 0
      ? "unusually large"
      : u.above === 0
        ? "unusually small"
        : "unusual";
  return `**${formatStat(n)} unit-years (${pct(n / count)})** are ${size}, ${where} the rest${
    top && median
      ? `. The most extreme, ${top.label}, is ${times(top.value / median)} the typical one`
      : ""
  }.`;
}

/** "TX has the highest median (364K short tons) and IL the lowest (14.4K)." */
export function groupMedianSentence(
  groups: { group: string; median: number | null }[],
  unit: string,
) {
  const known = groups.filter(
    (g): g is { group: string; median: number } => g.median !== null,
  );
  if (known.length < 2) return null;
  const sorted = [...known].sort((a, b) => b.median - a.median);
  const hi = sorted[0]!;
  const lo = sorted.at(-1)!;
  return `**${hi.group}** has the highest typical unit-year (${formatStat(hi.median)} ${unit}) and **${lo.group}** the lowest (${formatStat(lo.median)}).`;
}

/** How strong a correlation is, in words. */
export function correlationStrength(r: number) {
  const a = Math.abs(r);
  return a < 0.1
    ? "no"
    : a < 0.3
      ? "a weak"
      : a < 0.5
        ? "a moderate"
        : a < 0.7
          ? "a fairly strong"
          : "a strong";
}

/** "A strong link (r = 0.72): unit-years with more heat input tend to have more NOₓ mass." */
export function correlationSentence(
  r: number | null | undefined,
  x: string,
  y: string,
) {
  if (r === null || r === undefined || !Number.isFinite(r)) return null;
  const strength = correlationStrength(r);
  const lower = inSentence;
  if (strength === "no")
    return `**No clear link** (r = ${r.toFixed(2)}): ${lower(y)} doesn't move with ${lower(x)}.`;
  return `**${capitalize(strength)} link** (r = ${r.toFixed(2)}): unit-years with more ${lower(x)} tend to have ${r > 0 ? "more" : "less"} ${lower(y)}.`;
}

/**
 * The strongest pairs of a correlation matrix, skipping each variable with itself and pairs
 * that are the same quantity twice (|r| ≥ 0.995, e.g. CO₂ intensity and heat rate).
 */
export function strongestPairs(
  labels: string[],
  matrix: (number | null)[][],
  count = 2,
) {
  const pairs: { a: string; b: string; r: number }[] = [];
  matrix.forEach((row, i) =>
    row.forEach((r, j) => {
      if (j > i && r !== null && Math.abs(r) < 0.995)
        pairs.push({ a: labels[i]!, b: labels[j]!, r });
    }),
  );
  const strongest = [...pairs]
    .sort((p, q) => Math.abs(q.r) - Math.abs(p.r))
    .slice(0, count);
  const negative = pairs.filter((p) => p.r < -0.1).sort((p, q) => p.r - q.r)[0];
  return { strongest, negative };
}

/**
 * "The best model, decision tree, is off by 26.3 t of NOₓ per unit-year on average (21 % of the
 * actual value), 76 % less than the simple baseline. …" Relative error is the scale that reads
 * right: most units are small, so tons alone look large against a typical unit.
 */
export function modelSentence(
  best: { name: string; mae: number | null; r2: number | null },
  baselineMae: number | null,
  mapePct: number | null,
) {
  if (best.mae === null) return null;
  let s = `The most accurate model, the **${inSentence(best.name).replace(/^the /, "")}**, is off by about **${best.mae >= 10 ? Math.round(best.mae) : formatStat(best.mae)} tons** of NOₓ a year for a typical unit`;
  if (mapePct !== null)
    s += ` (about ${pct(mapePct / 100)} of its real amount)`;
  if (baselineMae)
    s += `, **${pct((baselineMae - best.mae) / baselineMae)} closer** than simply guessing from the unit's fuel and type`;
  s += ".";
  if (best.r2 !== null)
    s += ` It explains ${pct(best.r2)} of the differences between units.`;
  return s;
}

/** "TX leads all four categories." or "TX leads global warming and smog; MO leads acidification." */
export function leadersSentence(
  leaders: { category: string; group: string }[],
) {
  if (!leaders.length) return null;
  const byGroup = new Map<string, string[]>();
  for (const { category, group } of leaders)
    byGroup.set(group, [...(byGroup.get(group) ?? []), category]);
  if (byGroup.size === 1 && leaders.length > 1)
    return `**${leaders[0]!.group}** leads all ${leaders.length === 4 ? "four" : leaders.length} categories.`;
  const list = (xs: string[]) =>
    xs.length < 2
      ? (xs[0] ?? "")
      : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
  return `${[...byGroup]
    .map(([group, cats]) => `${group} leads ${list(cats.map(inSentence))}`)
    .join("; ")}.`;
}

/** One model's answer to a what-if, summed over its unit-years. */
interface WhatIfResult {
  /** In a sentence: "Ridge", "the tree". */
  model: string;
  /** Predicted NOₓ as reported (short tons). */
  base: number;
  /** Scenario minus as reported. */
  diff: number;
  diffPct: number | null;
  /** Unit-years the scenario takes outside the training data. */
  outside: number;
  /** The model's mean absolute error per unit-year on the test years. */
  mae: number;
}

/** "2–47 %", "0.4 %": a range of absolute percentages, whole numbers unless under 1. */
const pctRange = (values: number[]) => {
  const abs = values.map(Math.abs).sort((a, b) => a - b);
  const show = (v: number) =>
    v < 1 ? String(Number(v.toFixed(1))) : String(Math.round(v));
  const [lo, hi] = [show(abs[0]!), show(abs.at(-1)!)];
  return lo === hi ? `${lo} %` : `${lo}–${hi} %`;
};
/** "1.9K", "520": tons in a range, both ends in the same compact form. */
const compactTons = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumSignificantDigits: 2,
});
const tonRange = (values: number[]) => {
  const abs = values.map(Math.abs).sort((a, b) => a - b);
  const [lo, hi] = [
    compactTons.format(abs[0]!),
    compactTons.format(abs.at(-1)!),
  ];
  return lo === hi ? `${lo} t` : `${lo}–${hi} t`;
};

/** "fall 36 %", "rise 0.4 %", "barely change": a predicted change in a sentence. */
const move = (pct: number | null) => {
  const p = pct ?? 0;
  if (Math.abs(p) < 0.5) return "barely change";
  return `${p < 0 ? "fall" : "rise"} ${pctRange([p])}`;
};

/**
 * Each model's move, folding a shared verb: "fall 36 % with Ridge and 52 % with the tree",
 * "rise 6 % with Ridge; the tree would barely change".
 */
function moves(results: { model: string; pct: number | null }[]) {
  const verbs = results.map((r) => move(r.pct).split(" ")[0]);
  if (
    results.length > 1 &&
    verbs.every((v) => v === verbs[0]) &&
    verbs[0] !== "barely"
  )
    return `${verbs[0]} ${results.map((r) => `${pctRange([r.pct ?? 0])} with ${r.model}`).join(" and ")}`;
  return results
    .map((r, i) =>
      i === 0
        ? `${move(r.pct)} with ${r.model}`
        : `${r.model} predicts it would ${move(r.pct)}`,
    )
    .join("; ");
}

/**
 * A what-if's answer as plain sentences, for a Takeaways block: what happens to NOₓ (fall, rise,
 * barely change, or the models split), whether the models agree, whether the change is bigger
 * than their typical error, its share of the state's or nation's NOₓ, the TRACI impacts (which
 * move with NOₓ), and any extrapolation. The typical error of a sum of `units` independent
 * unit-year errors grows with √units, so a group's change is held to MAE × √units.
 */
export function whatIfAnswer({
  results,
  units,
  share,
}: {
  results: WhatIfResult[];
  units: number;
  share: { tons: number; of: string };
}) {
  const pcts = results.map((r) => r.diffPct ?? 0);
  const diffs = results.map((r) => r.diff);
  const down = pcts.every((p) => p <= 0);
  const up = pcts.every((p) => p >= 0);
  const tiny = pcts.every((p) => Math.abs(p) < 0.5);
  const split = !tiny && !down && !up;
  const moved = results.filter((_, i) => Math.abs(pcts[i]!) >= 0.5);
  const partial = !tiny && !split && moved.length < results.length;
  const both = results.length > 1 ? "both models" : results[0]?.model;

  const sentences: string[] = [];
  sentences.push(
    tiny
      ? `NOₓ would barely change: under 0.5 % with ${both}.`
      : split || partial
        ? `Predicted NOₓ would ${moves(results.map((r) => ({ model: r.model, pct: r.diffPct })))}.`
        : results.length > 1 && Math.max(...pcts) - Math.min(...pcts) >= 20
          ? // Far apart: a range ("4–49 %") hides who says what, so name each model.
            `NOₓ would **${down ? "fall" : "rise"}**: ${results
              .map(
                (r) =>
                  `${r.model} predicts **${Math.round(Math.abs(r.diffPct ?? 0))} % ${down ? "less" : "more"}** (${tonRange([r.diff])} a year)`,
              )
              .join(", ")}.`
          : `NOₓ would **${down ? "fall" : "rise"} ${pctRange(pcts)}**, ${tonRange(diffs)} a year ${down ? "less" : "more"}.`,
  );

  if (results.length > 1 && !tiny) {
    const spread = Math.max(...pcts) - Math.min(...pcts);
    if (split)
      sentences.push(
        "The models don't even agree on the direction, so the data can't settle this effect.",
      );
    else if (partial || spread >= 20)
      sentences.push(
        "The models disagree on how much, so treat the size of this effect as uncertain.",
      );
    else sentences.push("The two models agree closely.");
  }

  const noise = results.map((r) => r.mae * Math.sqrt(units));
  const beyond = results.map((r, i) => Math.abs(r.diff) > noise[i]!);
  const noiseText = tonRange(noise);
  // "Typical miss": how far off each model is on test data, scaled to this many unit-years.
  const miss =
    units > 1
      ? `typical miss for ${plural(units, "unit-year")}`
      : "typical miss on one unit-year";
  sentences.push(
    beyond.every(Boolean)
      ? `The change is bigger than the models' ${miss} (${noiseText}), so it **isn't just noise**.`
      : !beyond.some(Boolean)
        ? `The change is smaller than the models' ${miss} (${noiseText}), so **read it as no real change**.`
        : results
            .map((r, i) =>
              beyond[i]
                ? `${capitalize(r.model)}'s change (${tonRange([r.diff])}) is bigger than its ${miss} (${tonRange([noise[i]!])}), so **it isn't just noise**`
                : Math.abs(r.diff) < 0.5
                  ? `${r.model} doesn't move`
                  : `${r.model}'s (${tonRange([r.diff])}) is within its ${miss} (${tonRange([noise[i]!])})`,
            )
            .join("; ") + ".",
  );

  if (share.tons > 0 && !tiny)
    sentences.push(
      `For scale, the change equals ${pctRange(moved.map((r) => (r.diff / share.tons) * 100))} of all power-plant NOₓ reported in ${share.of} that year (${formatStat(share.tons)} t)${partial ? `, by ${moved.map((r) => r.model).join(" and ")}` : ""}.`,
    );
  if (!tiny && !split)
    sentences.push(
      `Smog, acid rain, and fine-particle potential from NOₓ would ${down ? "fall" : "rise"} by the same share, since TRACI counts them in proportion to NOₓ.`,
    );
  const outside = Math.max(0, ...results.map((r) => r.outside));
  if (outside)
    sentences.push(
      units === 1
        ? "This change takes the unit beyond what the models learned from, so it's an extrapolation."
        : `${formatNumber(outside)} of ${plural(units, "unit-year")} go beyond what the models learned from; their predictions are extrapolations.`,
    );
  return sentences;
}

/**
 * One input moved on every unit, in plain words: "With 50 % less fuel burned, predicted NOₓ would
 * fall 36 % with Ridge and 52 % with the tree." `less` and `more` name the change ("less fuel
 * burned"); each result is a model's change at −range % and +range %.
 */
export function sensitivitySentences({
  low,
  high,
  results,
}: {
  /** Each end of the range in words ("50 % less fuel burned"), null when it is the baseline. */
  low: string | null;
  high: string | null;
  results: { model: string; low: number | null; high: number | null }[];
}) {
  const ends = [
    low && { at: low, key: "low" as const },
    high && { at: high, key: "high" as const },
  ].filter((e): e is { at: string; key: "low" | "high" } => Boolean(e));
  return ends.map(
    (e, i) =>
      `With ${e.at}, ${i ? "it" : "predicted NOₓ"} would ${moves(results.map((r) => ({ model: r.model, pct: r[e.key] })))}.`,
  );
}

/**
 * Why "reported" and each model's "now" differ, so the before/after bars read right: a change is
 * measured from the model's own estimate of the place as reported, not from the reported tons.
 */
export function baselineReading(
  actual: number,
  models: { model: string; base: number }[],
) {
  const close = models.every((m) => Math.abs(m.base / actual - 1) < 0.1);
  if (close)
    return `The models' starting points are close to the **${formatStat(actual)} t** actually reported, so where each arrow ends is a fair estimate of the new total.`;
  const below = models.every((m) => m.base < actual);
  const above = models.every((m) => m.base > actual);
  return `The models start ${below ? "below" : above ? "above" : "away from"} the **${formatStat(actual)} t** actually reported (${models
    .map((m) => `${m.model} at ${formatStat(m.base)} t`)
    .join(
      ", ",
    )}), because no model is exact. So read the **length of each arrow**, the change, not where it ends.`;
}

/**
 * Which change matters most for these units, averaged over the models, and where the asked-about
 * change ranks: "Switching to gas cuts the most (−34 % on average) …".
 */
export function otherChangesReading(
  changes: { label: string; pcts: number[] }[],
  current: string | undefined,
) {
  const avg = changes.map((c) => ({
    label: c.label,
    pct: c.pcts.reduce((a, b) => a + b, 0) / Math.max(1, c.pcts.length),
  }));
  const cuts = avg.filter((c) => c.pct <= -0.5).sort((a, b) => a.pct - b.pct);
  const rises = avg.filter((c) => c.pct >= 0.5).sort((a, b) => b.pct - a.pct);
  const parts: string[] = [];
  if (cuts[0])
    parts.push(
      `**${cuts[0].label}** cuts predicted NOₓ the most (${Math.round(cuts[0].pct)} % averaged over the models)`,
    );
  if (rises[0])
    parts.push(
      `**${rises[0].label}** raises it the most (+${Math.round(rises[0].pct)} %)`,
    );
  if (!parts.length)
    return "None of these changes moves predicted NOₓ by more than 0.5 % for these units.";
  let s = `${capitalize(parts.join("; "))}.`;
  const rank = cuts.findIndex((c) => c.label === current);
  if (current && rank > 0)
    s += ` Your question ranks ${ordinal(rank + 1)} of ${cuts.length} changes that cut it.`;
  return s;
}

const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/**
 * How concentrated a group's change is: "With Ridge, Martin Lake accounts for 23 % of the change
 * and the top 3 plants for 55 %." For the tree, why few places move.
 */
export function breakdownReading(
  lists: { model: string; tree: boolean; rows: [string, number][] }[],
  noun: string,
  total: number,
) {
  return lists.map(({ model, tree, rows }) => {
    const sum = rows.reduce((s, [, d]) => s + d, 0);
    if (!rows.length || !sum)
      return `${capitalize(model)} doesn't change its prediction for any ${noun}.`;
    const share = (d: number) => `${Math.round((d / sum) * 100)} %`;
    const top3 = rows.slice(0, 3).reduce((s, [, d]) => s + d, 0);
    let s = `With ${model}, **${rows[0]![0]}** accounts for ${share(rows[0]![1])} of the change`;
    if (rows.length > 3) s += ` and the top 3 ${noun}s for ${share(top3)}`;
    s += ".";
    if (tree && rows.length < total)
      s += ` It moves only ${rows.length} of ${total} ${noun}s: the tree changes a prediction only when the change crosses one of its thresholds.`;
    return s;
  });
}

/**
 * Where the tree's two paths part: "The first 4 answers stay the same. At step 5 the change flips
 * the answer to "heat input above 28.8M MMBtu", which leads to past unit-years averaging 3,014 t
 * instead of 2,738 t."
 */
export function treePathReading(
  before: { steps: { text: string }[]; value: number },
  after: { steps: { text: string }[]; value: number },
) {
  const fork = before.steps.findIndex(
    (s, i) => s.text !== after.steps[i]?.text,
  );
  if (fork === -1)
    return `The change doesn't alter any of the tree's answers, so it predicts **${formatStat(before.value)} t** either way.`;
  const same =
    fork === 0
      ? "The very first answer changes"
      : `The first ${fork === 1 ? "answer stays" : `${fork} answers stay`} the same; at step ${fork + 1} the change flips it`;
  const step = after.steps[fork]!.text;
  return `${same} to “${inSentence(step)}”, which leads to past unit-years averaging **${formatStat(after.value)} t** instead of ${formatStat(before.value)} t.`;
}

/**
 * Where the two ways of measuring a link disagree most, and what that means: a link that is
 * strong by rank but weaker by amount holds for most units while a few very large ones blur it.
 */
export function correlationMethodsReading(
  labels: string[],
  byAmount: (number | null)[][],
  byRank: (number | null)[][],
) {
  let best: { a: string; b: string; p: number; s: number } | null = null;
  byAmount.forEach((row, i) =>
    row.forEach((p, j) => {
      const s = byRank[i]?.[j];
      if (j >= i || p == null || s == null) return;
      if (!best || Math.abs(p - s) > Math.abs(best.p - best.s))
        best = { a: labels[i]!, b: labels[j]!, p, s };
    }),
  );
  const b = best as { a: string; b: string; p: number; s: number } | null;
  if (!b || Math.abs(b.p - b.s) < 0.2)
    return "The two measures agree: no pair differs by more than 0.2, so a few very large units aren't distorting the picture.";
  const words = (r: number) =>
    correlationStrength(r) === "no"
      ? "no link"
      : `${correlationStrength(r)}${r < 0 ? " opposite" : ""} link`;
  const pair = `They disagree most on **${b.a}** and **${b.b}**: ${words(b.p)} by amount (${b.p.toFixed(2)}) but ${words(b.s)} by rank (${b.s.toFixed(2)}).`;
  return Math.abs(b.s) > Math.abs(b.p)
    ? `${pair} The link holds for most units; a few extreme values hide it when measured by amount.`
    : `${pair} A few extreme values create most of the link; for typical units it is weaker.`;
}

/**
 * A comparison of groups in plain words: each group's average against the first one picked, what
 * the tests say without naming them, and why a gap isn't proof of cause.
 */
export function compareSentences({
  groups,
  tests,
  label,
  unit,
  dimension,
}: {
  groups: { group: string; mean: number | null; count: number }[];
  tests: {
    welch: { p: number } | null;
    mannWhitney: { p: number } | null;
    anova: { p: number } | null;
    kruskal: { p: number } | null;
  };
  label: string;
  unit: string;
  dimension: string;
}) {
  const [base, ...rest] = groups;
  if (!base) return [];
  const what = inSentence(label);
  const lines = rest.map((g) => {
    if (g.mean == null || base.mean == null || !base.mean)
      return `**${g.group}** has no ${what} value to compare.`;
    const ratio = g.mean / base.mean;
    const size =
      ratio >= 2 || ratio <= 0.5
        ? ratio >= 1
          ? `${formatStat(ratio)} times as much as`
          : `${Math.round((1 - ratio) * 100)} % less than`
        : Math.abs(ratio - 1) < 0.05
          ? "about the same as"
          : `${Math.round(Math.abs(ratio - 1) * 100)} % ${ratio > 1 ? "more" : "less"} than`;
    return `A typical unit-year in **${g.group}** has ${formatStat(g.mean)} ${unit} of ${what} on average, **${size}** one in **${base.group}** (${formatStat(base.mean)} ${unit}).`;
  });
  const sig = (t: { p: number } | null) => t !== null && t.p < 0.05;
  const [a, b] =
    tests.welch && tests.mannWhitney
      ? [tests.welch, tests.mannWhitney]
      : [tests.anova, tests.kruskal];
  if (a && b)
    lines.push(
      sig(a) && sig(b)
        ? `This gap is **too big to be chance**: two standard statistical tests agree.`
        : sig(a) || sig(b)
          ? "The two statistical tests disagree on whether this gap is real, usually because a few extreme unit-years pull the average; treat it as uncertain."
          : "This gap **could be chance**: neither statistical test finds a real difference.",
    );
  lines.push(
    `This shows the groups differ, not why. They also differ in other ways (size, fuel, hours run), so ${inSentence(dimension)} alone isn't proven to cause the gap.`,
  );
  return lines;
}
