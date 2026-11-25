import assert from "node:assert/strict";
import test from "node:test";
import {
  correlationSentence,
  groupMedianSentence,
  leadersSentence,
  leaderSentence,
  modelSentence,
  outlierSentence,
  baselineReading,
  breakdownReading,
  compareSentences,
  correlationMethodsReading,
  otherChangesReading,
  treeGroupReading,
  treePathReading,
  sensitivitySentences,
  whatIfAnswer,
  shareSentence,
  spreadSentences,
  strongestPairs,
  trendSentence,
} from "./takeaways";

void test("a trend reads as a rise or fall between the first and last year", () => {
  const points = [
    { year: 2016, value: 1.5e9 },
    { year: 2015, value: 2e9 },
    { year: 2025, value: null },
    { year: 2024, value: 1.5e9 },
  ];
  assert.equal(
    trendSentence({
      label: "CO₂ mass",
      unit: "short tons",
      aggregation: "sum",
      points,
    }),
    "The yearly total of CO₂ mass **fell 25 %** from 2015 to 2024 (2B → 1.5B short tons).",
  );
  assert.match(
    trendSentence({
      label: "Heat rate",
      unit: "MMBtu/MWh",
      aggregation: "mean",
      points: [
        { year: 2015, value: 10 },
        { year: 2020, value: 10.1 },
      ],
    })!,
    /^The average heat rate \*\*stayed about the same\*\*/,
  );
  assert.equal(
    trendSentence({ label: "x", unit: "", aggregation: "sum", points: [] }),
    null,
  );
  // From a first year of 0 there is no percentage: the change is read from 0.
  assert.equal(
    trendSentence({
      label: "SO₂ mass",
      unit: "short tons",
      aggregation: "sum",
      points: [
        { year: 2015, value: 0 },
        { year: 2024, value: 12 },
      ],
    }),
    "The yearly total of SO₂ mass **rose from 0** to 12 short tons from 2015 to 2024.",
  );
  // Across signs (a change variable) there is none either.
  assert.equal(
    trendSentence({
      label: "CO₂ change",
      unit: "short tons",
      aggregation: "sum",
      points: [
        { year: 2016, value: -80_000 },
        { year: 2025, value: 70_000 },
      ],
    }),
    "The yearly total of CO₂ change **rose by 150K** from 2016 to 2025 (-80K → 70K short tons).",
  );
  assert.equal(
    outlierSentence({ above: 3582, below: 0, extreme: [] }, 45441, null),
    "**3,582 unit-years (7.9 %)** are unusually large, far above the rest.",
  );
});

void test("an outlier reads as a ratio only between two positive values", () => {
  const one = { label: "Gavin unit 1", value: -20 };
  assert.equal(
    outlierSentence({ above: 0, below: 1, extreme: [one] }, 100, 10),
    "**1 unit-year (1 %)** is unusually small, far below the rest.",
  );
  assert.equal(
    outlierSentence({ above: 1, below: 1, extreme: [one] }, 100, -2),
    "**2 unit-years (2 %)** are unusual, far from the rest.",
  );
});

void test("shares name the largest group, and its share of rows when they differ", () => {
  assert.equal(
    shareSentence([
      { group: "Coal", value: 60, n: 10 },
      { group: "Gas", value: 40, n: 90 },
    ]),
    "**Coal** units put out **60 % of the total**, though they are only 10 % of the unit-years.",
  );
  assert.equal(
    shareSentence([
      { group: "Coal", value: 50, n: 50 },
      { group: "Gas", value: 50, n: 50 },
    ]),
    "**Coal** units put out **50 % of the total**.",
  );
  assert.equal(
    shareSentence([
      { group: "Gas", value: 60, n: 80 },
      { group: "Coal", value: 40, n: 20 },
    ]),
    "**Gas** units put out **60 % of the total**, from 80 % of the unit-years.",
  );
  assert.equal(shareSentence([{ group: "Coal", value: 1, n: 1 }]), null);
  assert.match(
    leaderSentence({ group: "Miller (6002)", value: 12 }, 1000)!,
    /\*\*Miller \(6002\)\*\*, accounts for \*\*1.2 %\*\* of it/,
  );
});

void test("spread, skew, outliers, and groups read in words", () => {
  const [half, skew] = spreadSentences(
    { count: 100, mean: 500_000, median: 89_000, q1: 13_000, q3: 626_000 },
    "short tons",
  );
  assert.equal(
    half,
    "A typical unit-year has **89K short tons** (the median: half have more, half less). The middle half fall between 13K and 626K.",
  );
  assert.match(skew!, /5.6× the typical one/);
  assert.equal(
    spreadSentences({ count: 10, mean: 10, median: 9, q1: 5, q3: 12 }, "t")
      .length,
    1,
  );
  assert.equal(
    outlierSentence(
      { above: 5, below: 0, extreme: [{ label: "Gavin unit 1", value: 100 }] },
      100,
      10,
    ),
    "**5 unit-years (5 %)** are unusually large, far above the rest. The most extreme, Gavin unit 1, is 10× the typical one.",
  );
  assert.equal(
    outlierSentence({ above: 0, below: 0, extreme: [] }, 100, 1),
    null,
  );
  assert.equal(
    groupMedianSentence(
      [
        { group: "TX", median: 300 },
        { group: "IL", median: 10 },
        { group: "NY", median: null },
      ],
      "t",
    ),
    "**TX** has the highest typical unit-year (300 t) and **IL** the lowest (10).",
  );
});

void test("correlations get a strength in words; pairs skip duplicates of one quantity", () => {
  assert.equal(
    correlationSentence(0.72, "Heat input", "NOₓ mass"),
    "**A strong link** (r = 0.72): unit-years with more heat input tend to have more NOₓ mass.",
  );
  assert.match(
    correlationSentence(-0.35, "a", "b")!,
    /^\*\*A moderate link\*\*.*less b/,
  );
  assert.match(correlationSentence(0.05, "a", "b")!, /^\*\*No clear link\*\*/);
  assert.equal(correlationSentence(null, "a", "b"), null);
  const { strongest, negative } = strongestPairs(
    ["A", "B", "C"],
    [
      [1, 0.999, 0.6],
      [0.999, 1, -0.3],
      [0.6, -0.3, 1],
    ],
  );
  assert.deepEqual(strongest, { a: "A", b: "C", r: 0.6 });
  assert.deepEqual(negative, { a: "B", b: "C", r: -0.3 });
});

void test("the model verdict gives relative error and the gain over the baseline", () => {
  assert.equal(
    modelSentence(
      { name: "Decision tree", mae: 26.31, r2: 0.95 },
      109.4,
      20.87,
    ),
    "The most accurate model, the **decision tree**, is off by about **26 tons** of NOₓ a year for a typical unit (about 21 % of its real amount), **76 % closer** than simply guessing from the unit's fuel and type. It explains 95 % of the differences between units.",
  );
  assert.equal(modelSentence({ name: "x", mae: null, r2: null }, 1, 1), null);
});

void test("impact leaders are grouped by who leads", () => {
  assert.equal(
    leadersSentence([
      { category: "Global warming", group: "TX" },
      { category: "Acidification", group: "TX" },
      { category: "Smog formation", group: "TX" },
      { category: "Human health (particulate)", group: "TX" },
    ]),
    "**TX** leads all four categories.",
  );
  assert.equal(
    leadersSentence([
      { category: "Global warming", group: "TX" },
      { category: "Acidification", group: "MO" },
      { category: "Smog formation", group: "TX" },
    ]),
    "TX leads global warming and smog formation; MO leads acidification.",
  );
  assert.equal(leadersSentence([]), null);
});

void test("a what-if answer reads as plain sentences", () => {
  const share = { tons: 663_000, of: "the US" };
  const ridge = { model: "Ridge", outside: 0, mae: 58 };
  const tree = { model: "the tree", outside: 0, mae: 26 };
  assert.deepEqual(
    whatIfAnswer({
      units: 400,
      share,
      results: [
        { ...ridge, diff: -36_000, diffPct: -46.8 },
        { ...tree, diff: -1_900, diffPct: -2.3, outside: 3 },
      ],
    }),
    [
      "NOₓ would **fall**: Ridge predicts **47 % less** (36K t a year), the tree predicts **2 % less** (1.9K t a year).",
      "The models disagree on how much, so treat the size of this effect as uncertain.",
      "The change is bigger than the models' typical miss for 400 unit-years (520–1.2K t), so it **isn't just noise**.",
      "For scale, the change equals 0.3–5 % of all power-plant NOₓ reported in the US that year (663K t).",
      "Smog, acid rain, and fine-particle potential from NOₓ would fall by the same share, since TRACI counts them in proportion to NOₓ.",
      "3 of 400 unit-years go beyond what the models learned from; their predictions are extrapolations.",
    ],
  );
  // One model moves, the other doesn't.
  const one = whatIfAnswer({
    units: 1,
    share,
    results: [
      { ...ridge, diff: -1750, diffPct: -58.9 },
      { ...tree, diff: 0, diffPct: 0 },
    ],
  });
  assert.equal(
    one[0],
    "Predicted NOₓ would fall 59 % with Ridge; the tree predicts it would barely change.",
  );
  // From a prediction of 0 there is no percentage: the change is read in tons.
  assert.equal(
    whatIfAnswer({
      units: 1,
      share,
      results: [
        { ...ridge, diff: 12, diffPct: null },
        { ...tree, diff: 4, diffPct: 10 },
      ],
    })[0],
    "Predicted NOₓ would rise from 0 to 12 t with Ridge; the tree predicts it would rise 10 %.",
  );
  assert.equal(
    one[2],
    "Ridge's change (1.8K t) is bigger than its typical miss on one unit-year (58 t), so **it isn't just noise**; the tree doesn't move.",
  );
  assert.equal(
    one[3],
    "For scale, the change equals 0.3 % of all power-plant NOₓ reported in the US that year (663K t), by Ridge.",
  );
  // Opposite directions.
  const split = whatIfAnswer({
    units: 1,
    share,
    results: [
      { ...ridge, diff: -150, diffPct: -5 },
      { ...tree, diff: 20, diffPct: 0.7 },
    ],
  });
  assert.equal(
    split[0],
    "Predicted NOₓ would fall 5 % with Ridge; the tree predicts it would rise 0.7 %.",
  );
  assert.match(split[1]!, /direction/);
  assert.deepEqual(
    whatIfAnswer({
      units: 1,
      share,
      results: [{ ...ridge, diff: 3, diffPct: 0.1 }],
    }),
    [
      "NOₓ would barely change: under 0.5 % with Ridge.",
      "The change is smaller than the models' typical miss on one unit-year (58 t), so **read it as no real change**.",
    ],
  );
});

void test("a sensitivity reads as plain sentences", () => {
  assert.deepEqual(
    sensitivitySentences({
      low: "50 % less fuel burned",
      high: "50 % more fuel burned",
      results: [
        { model: "Ridge", low: -35.8, high: 29.3 },
        { model: "the tree", low: -51.8, high: 0.2 },
      ],
    }),
    [
      "With 50 % less fuel burned, predicted NOₓ would fall 36 % with Ridge and 52 % with the tree.",
      "With 50 % more fuel burned, it would rise 29 % with Ridge; the tree predicts it would barely change.",
    ],
  );
});

const two = (ridge: number, tree: number) => [
  { model: "Ridge", pct: ridge, tons: ridge },
  { model: "the tree", pct: tree, tons: tree },
];

void test("chart readings explain the What-if numbers", () => {
  assert.equal(
    baselineReading(4146, [
      { model: "Ridge", base: 2972 },
      { model: "the tree", base: 2738 },
    ]),
    "The models start below the **4,146 t** actually reported (Ridge at 2,972 t, the tree at 2,738 t), because no model is exact. So read the **length of each arrow**, the change, not where it ends.",
  );
  assert.match(
    baselineReading(0, [{ model: "Ridge", base: 0 }]),
    /^The models' starting points are close to the \*\*0 t\*\*/,
  );
  assert.match(
    baselineReading(100, [{ model: "Ridge", base: 104 }]),
    /close to the/,
  );
  assert.equal(
    otherChangesReading(
      [
        { label: "Add SCR", results: two(-59, 0) },
        { label: "Run 10 % more", results: two(6, 10) },
        { label: "Switch to gas", results: two(-69, 0) },
      ],
      "Add SCR",
    ),
    "**Switch to gas** cuts predicted NOₓ the most (-34 % averaged over the models); **Run 10 % more** raises it the most (+8 %). Your question ranks 2nd of 2 changes that cut it.",
  );
  // From a prediction of 0 there is no percentage: never averaged as 0, read in tons.
  assert.equal(
    otherChangesReading(
      [
        {
          label: "Add SCR",
          results: [
            { model: "Ridge", pct: null, tons: 0 },
            { model: "the tree", pct: null, tons: 0 },
          ],
        },
        {
          label: "Switch to coal",
          results: [
            { model: "Ridge", pct: null, tons: 12.3 },
            { model: "the tree", pct: null, tons: 0 },
          ],
        },
      ],
      undefined,
    ),
    "From a prediction of 0 t there is no percentage, so in tons: Switch to coal: +12 t with Ridge.",
  );
  assert.deepEqual(
    breakdownReading(
      [
        {
          model: "Ridge",
          tree: false,
          rows: [
            ["A", -50],
            ["B", -30],
            ["C", -10],
            ["D", -10],
          ],
        },
        { model: "the tree", tree: true, rows: [["A", -5]] },
      ],
      "plant",
      9,
    ),
    [
      "With Ridge, **A** accounts for 50 % of the change and the top 3 plants for 90 %.",
      "With the tree, **A** accounts for 100 % of the change. It moves only 1 of 9 plants: the tree changes a prediction only when the change crosses one of its thresholds.",
    ],
  );
  // Opposite moves: shares of the movement stay at most 100 %, and the reading says so.
  assert.deepEqual(
    breakdownReading(
      [
        {
          model: "Ridge",
          tree: false,
          rows: [
            ["A", -30],
            ["B", 20],
          ],
        },
      ],
      "plant",
      2,
    ),
    [
      "With Ridge, **A** accounts for 60 % of the change. 1 plant rises and 1 plant falls, so the net change is smaller than the movement.",
    ],
  );
});

void test("the group tree reading: paths, the flipped answer, and the dividing check", () => {
  const p = (units: number, tons: number) => ({ before: { units, tons } });
  assert.deepEqual(
    treeGroupReading(
      {
        paths: [p(2, 600), p(3, 300), p(1, 50), p(4, 50), p(0, 0)],
        moved: 3,
        flips: [{ text: "SCR: yes", units: 3, diff: -412.6 }],
        splits: [
          {
            question: "Heat input above 2M MMBtu",
            yes: { units: 3, tons: 700 },
            no: { units: 6, tons: 300 },
          },
        ],
      },
      10,
    ),
    [
      "These 10 units take **4 different paths**; the 3 with the most predicted NOₓ hold 6 units and **95 %** of it.",
      "The change sends **3 of 10 units** down a different path; the flip that moves predicted NOₓ most is to “SCR: yes” (3 units, -413 t).",
      "The check that divides these units' NOₓ most evenly is “heat input above 2M MMBtu”: yes for 3 units (700 t), no for 6 (300 t), of the 9 that reach it.",
    ],
  );
  assert.match(
    treeGroupReading(
      { paths: [p(2, 10)], moved: 0, flips: [], splits: [] },
      2,
    )[1]!,
    /doesn't flip any/,
  );
});

void test("the tree path reading names where the paths part", () => {
  const a = (t: string) => ({ text: t });
  assert.equal(
    treePathReading(
      {
        steps: [a("Heat input above 1"), a("Heat input at most 2")],
        value: 2738,
      },
      {
        steps: [a("Heat input above 1"), a("Heat input above 2")],
        value: 3014,
      },
    ),
    "The first answer stays the same; at step 2 the change flips it to “heat input above 2”, which leads to past unit-years averaging **3,014 t** instead of 2,738 t.",
  );
  assert.match(
    treePathReading(
      { steps: [a("x")], value: 5 },
      { steps: [a("x")], value: 5 },
    ),
    /doesn't alter any/,
  );
});

void test("the two correlation measures are compared in words", () => {
  const labels = ["A", "B", "C"];
  const amount = [
    [1, 0, 0],
    [-0.01, 1, 0],
    [0.5, 0.4, 1],
  ];
  const rank = [
    [1, 0, 0],
    [-0.71, 1, 0],
    [0.55, 0.45, 1],
  ];
  assert.equal(
    correlationMethodsReading(labels, amount, rank),
    "They disagree most on **B** and **A**: no link by amount (-0.01) but a strong opposite link by rank (-0.71). The link holds for most units; a few extreme values hide it when measured by amount.",
  );
  assert.match(correlationMethodsReading(labels, amount, amount), /agree/);
});

void test("a comparison reads in plain words", () => {
  const lines = compareSentences({
    groups: [
      { group: "SCR", mean: 749000, count: 16400 },
      { group: "None", mean: 90600, count: 7253 },
    ],
    tests: {
      welch: { p: 0.0001 },
      mannWhitney: { p: 0.0001 },
      anova: null,
      kruskal: null,
    },
    label: "CO₂ mass",
    unit: "short tons",
    dimension: "NOₓ control",
  });
  assert.equal(
    lines[0],
    "A typical unit-year in **None** has 90.6K short tons of CO₂ mass on average, **88 % less than** one in **SCR** (749K short tons).",
  );
  assert.match(lines[1]!, /too big to be chance/);
  assert.match(lines[2]!, /same unit appears in several years/);
  assert.match(lines[3]!, /NOₓ control alone isn't proven/);
  // From an average of 0, or across signs, there is no ratio: the difference is stated.
  const noTests = {
    welch: null,
    mannWhitney: null,
    anova: null,
    kruskal: null,
  };
  const read = (a: number, b: number) =>
    compareSentences({
      groups: [
        { group: "A", mean: a, count: 5 },
        { group: "B", mean: b, count: 5 },
      ],
      tests: noTests,
      label: "SO₂ mass",
      unit: "t",
      dimension: "fuel",
    })[0];
  assert.equal(
    read(0, 12),
    "A typical unit-year in **B** has 12 t of SO₂ mass on average, **+12 t** against one in **A** (0 t).",
  );
  assert.match(read(-50, 30)!, /\*\*\+80 t\*\* against/);
  assert.match(read(-50, -150)!, /\*\*-100 t\*\* against/);
});
