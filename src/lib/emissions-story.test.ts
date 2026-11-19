import assert from "node:assert/strict";
import test from "node:test";
import { emissionsStory } from "./emissions-story";

const y = (year: number, records: number, co2: number) => ({
  year,
  records,
  co2,
  so2: co2 / 2,
  nox: co2 / 4,
});

void test("the story uses fully covered years and drops a year still being reported", () => {
  const s = emissionsStory([
    y(1997, 1800, 2000),
    y(2015, 4600, 2000),
    y(2016, 4500, 1800),
    y(2017, 4400, 1500),
    y(2018, 4300, 700),
  ])!;
  assert.equal(s.from, 2015);
  assert.equal(s.to, 2017);
  assert.equal(s.partial, 2018);
  assert.equal(Math.round(s.pollutants[2]!.pct), -25);
  assert.deepEqual(
    s.rows.map((r) => Math.round(r.co2!)),
    [100, 90, 75],
  );
});

void test("no story from a single year", () => {
  assert.equal(emissionsStory([y(2015, 10, 5)]), null);
});
