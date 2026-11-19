import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  changedInputs,
  featureLabel,
  modelInputs,
  outOfRange,
  percentChange,
  predict,
  residualsByGroup,
  applyScenario,
  AS_REPORTED,
  describeScenario,
  scopeCategory,
  scopeSensitivity,
  scopeTotals,
  treeBreakpoints,
  treePath,
  type ModelArtifact,
  type ModelRaw,
  type ScopeRow,
} from "./model";

const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const fixture = read<{ raw: ModelRaw; predictions: Record<string, number> }[]>(
  "ml/fixtures/parity.json",
);
const models = Object.fromEntries(
  (["baseline", "ridge", "tree"] as const).map((k) => [
    k,
    read<ModelArtifact>(`ml/models/nox-${k}.json`),
  ]),
);

void test("predict: matches scikit-learn on the parity fixture", () => {
  assert.ok(fixture.length >= 100);
  for (const { raw, predictions } of fixture) {
    for (const [kind, expected] of Object.entries(predictions)) {
      const got = predict(models[kind]!, modelInputs(raw));
      assert.ok(
        Math.abs(got - expected) <= 1e-6 * Math.max(1, Math.abs(expected)),
        `${kind}: ${got} vs ${expected} for ${JSON.stringify(raw)}`,
      );
    }
  }
});

const raw: ModelRaw = {
  year: 2024,
  primary_fuel: "Coal",
  unit_type: "Tangentially-fired",
  nameplate_capacity_mw: 500,
  commercial_op_date: "1978-06-01",
  operating_hours: 6000,
  gross_generation_mwh: 2_000_000,
  heat_input_mmbtu: 20_000_000,
  nox_controls:
    "Low NOx Burner Technology w/ Overfire Air|Selective Catalytic Reduction",
  prev_nox_mass_tons: 1000,
  prev_heat_input_mmbtu: 0,
  prev_operating_hours: null,
};

void test("modelInputs: age, controls, and an undefined prior rate", () => {
  const x = modelInputs(raw);
  assert.equal(x.unit_age, 46);
  assert.equal(x.scr, 1);
  assert.equal(x.sncr, 0);
  assert.equal(x.low_nox_burner, 1);
  assert.equal(x.overfire_air, 1);
  assert.equal(x.prior_nox_rate, null); // prior heat input 0: missing, not infinite
  assert.equal(
    modelInputs({ ...raw, prev_heat_input_mmbtu: 10_000_000 }).prior_nox_rate,
    0.2,
  );
});

void test("outOfRange: flags values past the training range and unseen categories", () => {
  const x = modelInputs(raw);
  assert.deepEqual(outOfRange(models.ridge!, x), []);
  const far = { ...x, heat_input_mmbtu: 1e12, unit_type: "Fusion reactor" };
  assert.deepEqual(outOfRange(models.ridge!, far).sort(), [
    "heat_input_mmbtu",
    "unit_type",
  ]);
});

void test("predict: Ridge responds to heat input in the expected direction", () => {
  const x = modelInputs(raw);
  const more = { ...x, heat_input_mmbtu: x.heat_input_mmbtu! * 1.1 };
  assert.ok(predict(models.ridge!, more) > predict(models.ridge!, x));
});

void test("featureLabel: inputs, categories, and controls in words", () => {
  assert.equal(featureLabel("heat_input_mmbtu"), "Heat input");
  assert.equal(featureLabel("primary_fuel=Coal"), "Primary fuel: Coal");
  assert.equal(featureLabel("unit_type"), "Unit type");
  assert.equal(featureLabel("scr"), "SCR");
  assert.equal(featureLabel("unknown_thing"), "unknown_thing");
});

void test("percentChange: relative to the base, undefined from zero", () => {
  assert.equal(percentChange(110, 100), 10.000000000000009);
  assert.equal(percentChange(50, 100), -50);
  assert.equal(percentChange(5, 0), null);
});

void test("changedInputs names each changed input with its value and the baseline's", () => {
  const base = modelInputs(raw); // coal, with SCR
  const at = (spec: Partial<typeof AS_REPORTED>) =>
    changedInputs(base, applyScenario(base, { ...AS_REPORTED, ...spec }));
  assert.deepEqual(at({}), []);
  assert.match(at({ load: 10 })[0]!, /^Gross load .+ MWh \(from .+\)$/);
  assert.match(at({ heat: -5 })[0]!, /^Heat input .+ MMBtu \(from .+\)$/);
  assert.deepEqual(at({ scr: "remove" }), ["SCR no (from yes)"]);
  assert.deepEqual(at({ scr: "add" }), []); // SCR already on
  assert.match(
    at({ fuel: "Pipeline Natural Gas" })[0]!,
    /Pipeline Natural Gas \(from Coal\)$/,
  );
});

void test("residualsByGroup: signed bias and absolute error per group, worst first", () => {
  const r = residualsByGroup([
    { group: "Coal", actual: 100, predicted: 130 },
    { group: "Coal", actual: 100, predicted: 90 },
    { group: "Gas", actual: 10, predicted: 8 },
    { group: "Gas", actual: 10, predicted: null },
  ]);
  assert.deepEqual(r, [
    { group: "Coal", n: 2, bias: 10, mae: 20 },
    { group: "Gas", n: 1, bias: -2, mae: 2 },
  ]);
});

const scopeRows: ScopeRow[] = fixture.slice(0, 40).map(({ raw: r }, i) => ({
  facilityId: i,
  facilityName: `Plant ${i}`,
  stateCode: "KY",
  unitId: "1",
  actual: 0,
  inputs: modelInputs(r),
}));

void test("applyScenario: scales load and heat, sets SCR and fuel, never below zero", () => {
  const base = modelInputs(raw);
  const x = applyScenario(base, {
    load: 10,
    heat: -150,
    scr: "remove",
    fuel: "Coal Refuse",
  });
  assert.equal(x.gross_load_mwh, 2_200_000);
  assert.equal(x.heat_input_mmbtu, 0);
  assert.equal(x.scr, 0);
  assert.equal(x.primary_fuel, "Coal Refuse");
  assert.deepEqual(applyScenario(base, AS_REPORTED), base);
  assert.equal(describeScenario(AS_REPORTED), "As reported");
  assert.equal(
    describeScenario({ load: 10, heat: 0, scr: "add", fuel: "" }),
    "Power output +10 %, add SCR",
  );
});

void test("scopeTotals: sums each unit's prediction, as reported and under the scenario", () => {
  for (const m of Object.values(models)) {
    const spec = { ...AS_REPORTED, scr: "add" as const };
    const t = scopeTotals(m, scopeRows, spec);
    const base = scopeRows.reduce((s, r) => s + predict(m, r.inputs), 0);
    const scen = scopeRows.reduce(
      (s, r) => s + predict(m, applyScenario(r.inputs, spec)),
      0,
    );
    assert.ok(Math.abs(t.base - base) < 1e-6);
    assert.ok(Math.abs(t.scenario - scen) < 1e-6);
    assert.equal(t.units.length, scopeRows.length);
    assert.ok(Math.abs(t.units[0]!.diff) >= Math.abs(t.units.at(-1)!.diff));
    assert.equal(scopeTotals(m, scopeRows, AS_REPORTED).diff, 0);
  }
  const [at0] = scopeSensitivity(
    models.ridge!,
    scopeRows,
    "heat_input_mmbtu",
    [0],
  );
  assert.equal(at0!.diff, 0);
  const scr = scopeCategory(models.ridge!, scopeRows.slice(0, 1), "scr");
  assert.equal(scr.filter((q) => q.reported).length, 1);
});

void test("treeBreakpoints: the tree's prediction only changes at its thresholds", () => {
  const tree = models.tree!;
  const base = modelInputs(fixture[0]!.raw);
  const cuts = treeBreakpoints(tree, "heat_input_mmbtu");
  assert.ok(cuts.length > 1);
  const at = (v: number) => predict(tree, { ...base, heat_input_mmbtu: v });
  // Between two neighbouring thresholds the prediction is flat.
  for (let i = 0; i + 1 < Math.min(cuts.length, 30); i++) {
    const [a, b] = [cuts[i]!, cuts[i + 1]!];
    if (b / a < 1.001) continue;
    const lo = a * 1.0005;
    const hi = b * 0.9995;
    assert.equal(at(lo), at((lo + hi) / 2));
    assert.equal(at(lo), at(hi));
  }
  assert.deepEqual(treeBreakpoints(models.ridge!, "heat_input_mmbtu"), []);
});

void test("treePath: ends at the tree's own prediction, in words", () => {
  const tree = models.tree!;
  const base = modelInputs(raw);
  const path = treePath(tree, base)!;
  assert.equal(path.value, predict(tree, base));
  assert.ok(path.steps.length > 0);
  assert.ok(path.steps.every((s) => !s.text.includes("=")));
  assert.equal(treePath(models.ridge!, base), null);
});
