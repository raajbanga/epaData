import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FILTERS } from "./facility-filters";
import { filterSuggestions, type FilterVocab } from "./search-suggestions";

const vocab: FilterVocab = {
  states: ["KS", "KY", "TX", "WV"],
  years: [2025, 2024, 2023],
  fuels: ["Coal", "Coal Refuse", "Natural Gas", "Pipeline Natural Gas"],
  unitTypes: ["Combined cycle", "Combustion turbine"],
  noxControls: ["Selective Catalytic Reduction", "Low NOx Burner Technology"],
  programCodes: ["ARP", "CSNOX"],
};
const labels = (text: string, active = DEFAULT_FILTERS, yearRange = false) =>
  filterSuggestions(text, vocab, active, { yearRange }).map(
    (s) => `${s.kind}: ${s.label}`,
  );

void test("states match by name or postal code", () => {
  assert.deepEqual(labels("kentucky"), ["State: Kentucky (KY)"]);
  assert.deepEqual(labels("ky"), ["State: Kentucky (KY)"]);
  assert.deepEqual(labels("west"), ["State: West Virginia (WV)"]);
});

void test("values match by word start or initials, best match first", () => {
  assert.deepEqual(labels("coal"), ["Fuel: Coal", "Fuel: Coal Refuse"]);
  assert.deepEqual(labels("gas"), [
    "Fuel: Natural Gas",
    "Fuel: Pipeline Natural Gas",
  ]);
  assert.deepEqual(labels("scr"), [
    "NOₓ control: Selective Catalytic Reduction",
  ]);
  assert.deepEqual(labels("as"), []);
});

void test("a year sets one year, or both ends of a range on Analyze", () => {
  assert.deepEqual(
    filterSuggestions("2024", vocab, DEFAULT_FILTERS)[0]?.patch,
    {
      year: "2024",
    },
  );
  assert.deepEqual(
    filterSuggestions("2024", vocab, DEFAULT_FILTERS, { yearRange: true })[0]
      ?.patch,
    { yearMin: "2024", yearMax: "2024" },
  );
  assert.deepEqual(labels("1999"), []);
});

void test("applied values and short text suggest nothing", () => {
  assert.deepEqual(
    labels("coal", { ...DEFAULT_FILTERS, primaryFuel: "Coal" }),
    ["Fuel: Coal Refuse"],
  );
  assert.deepEqual(labels("k"), []);
});

void test("only a value the text names outright is exact", () => {
  const exact = (text: string) =>
    filterSuggestions(text, vocab, DEFAULT_FILTERS).map((s) => s.exact);
  assert.deepEqual(exact("kentucky"), [true]);
  assert.deepEqual(exact("coal"), [true, false]);
  assert.deepEqual(exact("west"), [false]);
});
