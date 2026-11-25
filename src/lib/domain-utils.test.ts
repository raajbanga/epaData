import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDateOptionsForYear,
  clampCampdDateRange,
  clampDateToYear,
  clampIsoDateToCampdPublished,
  getCampdValidMonthsForYear,
  getDefaultCampdDateForYear,
  parseCampdQuarterEndFromError,
  toIsoDate,
} from "./campd-reporting-period";
import {
  buildYearlyRollups,
  deriveRates,
  evaluatePhysicalSanityRules,
  maxReported,
  pickCleanestByCarbonIntensity,
  sumReported,
  sumTotals,
  totalsAndRates,
  type ReportedTotals,
} from "./emissions-metrics";
import {
  activeCampdFilters,
  applyDescribed,
  campdRetrievalSchema,
  DEFAULT_FILTERS,
  DEFAULT_AUDIT_TABLE_STATE,
  DEFAULT_TABLE_STATE,
  DEFAULT_UNIT_TABLE_STATE,
  describeCampdFilters,
  describeRanking,
  explorerSearchParams,
  filterSearchParams,
  isFilterActive,
  multiValueOptions,
  nextSort,
  parseExplorerParams,
  parseFacilityIds,
  yearsText,
} from "./facility-filters";
import { FUEL_CATEGORIES, getFuelTheme, getMarkerRadius } from "./map-utils";
import {
  cleanOwnerOperator,
  formatCountyShort,
  generatePlantStory,
  getCarbonIntensityTier,
  getPlantRole,
  hasAirQualityControls,
  isOperatingStatus,
} from "./plant-narrative";
import { describeChanges } from "./record-diff";
import {
  formatNumber,
  formatQuantity,
  isNumericValue,
  sortRows,
} from "./utils";

void test("emissions metrics handle valid and missing generation", () => {
  const rates = (co2: number, heat: number, gen: number) =>
    deriveRates({
      co2MassTons: co2,
      heatInputMMBtu: heat,
      grossGenerationMWh: gen,
    });
  assert.deepEqual(rates(1, 75, 2), {
    co2IntensityLbsMWh: 1000,
    heatRateMMBtuMWh: 37.5,
  });
  assert.deepEqual(rates(1, 75, 0), {
    co2IntensityLbsMWh: null,
    heatRateMMBtuMWh: null,
  });
  assert.equal(
    pickCleanestByCarbonIntensity([
      { carbonIntensityLbsMWh: 900 },
      { carbonIntensityLbsMWh: 0 },
    ])?.carbonIntensityLbsMWh,
    0,
  );
});

void test("not reported (null) is kept apart from 0 in rates, totals, and sanity rules", () => {
  const record: ReportedTotals = {
    so2MassTons: 0,
    noxMassTons: 0,
    heatInputMMBtu: 38801.9,
    grossGenerationMWh: 2012,
    operatingHours: 111,
    co2MassTons: null,
    steamLoadKlb: null,
  };
  const flags = (r: ReportedTotals) =>
    evaluatePhysicalSanityRules({ ...r, ...deriveRates(r) }).map(
      (f) => `${f.flagType}:${f.severity}`,
    );
  // Missing CO₂ is a reporting gap (WARN); a reported 0 is implausible (ERROR).
  assert.deepEqual(flags(record), ["CO2_NOT_REPORTED:WARN"]);
  assert.deepEqual(flags({ ...record, co2MassTons: 0 }), [
    "ZERO_EMISSIONS_HIGH_HEAT:ERROR",
  ]);
  // Rates need both inputs reported; missing heat input never looks like an extreme heat rate.
  assert.equal(deriveRates(record).co2IntensityLbsMWh, null);
  assert.deepEqual(
    flags({ ...record, heatInputMMBtu: null, co2MassTons: 1 }),
    [],
  );
  // Phantom generation needs a reported 0 hours, not a missing value.
  assert.deepEqual(
    flags({ ...record, co2MassTons: 1, operatingHours: null }),
    [],
  );
  // A total adds what was reported, and is missing when nothing was.
  const reported = { ...record, co2MassTons: 1006 };
  assert.equal(sumTotals([record, reported]).co2MassTons, 1006);
  assert.equal(totalsAndRates([record]).co2MassTons, null);
  assert.equal(totalsAndRates([record]).co2IntensityLbsMWh, null);
  // A pooled rate leaves out the unit that reports load but no CO₂ (1006 t × 2000 / 2012 MWh).
  assert.equal(totalsAndRates([record, reported]).co2IntensityLbsMWh, 1000);
  // On screen a reported 0 reads "0 t" and a missing value "—".
  assert.equal(formatQuantity(0, "t"), "0 t");
  assert.equal(formatQuantity(null, "t"), "—");
  assert.equal(formatQuantity(12_345.6, "t"), "12.3K t");
  assert.equal(formatNumber(0), "0");
});

void test("fuel metadata stays consistent and filters remain distinct", () => {
  assert.equal(getFuelTheme("Pipeline Natural Gas").name, "Natural Gas");
  assert.equal(getFuelTheme("Coal").color, "#b07a1c");
  // Each chip is a fuel class getFuelTheme assigns, so its count equals what it filters to.
  assert.deepEqual(
    FUEL_CATEGORIES.map((c) => c.name),
    ["Pipeline Natural Gas", "Coal", "Residual Oil"].map(
      (f) => getFuelTheme(f).name,
    ),
  );
  assert.ok(
    getMarkerRadius({ totalCapacityMW: 1000, totalCo2Tons: 100 }, "capacity") >
      3,
  );
});

void test("unit status and controls use shared rules", () => {
  assert.equal(isOperatingStatus("Operating"), true);
  assert.equal(isOperatingStatus("Non-Operating"), false);
  assert.equal(hasAirQualityControls({ pmControls: "Baghouse" }), true);
  assert.equal(hasAirQualityControls({}), false);
  // A blank SO₂ entry must not hide a real NOₓ control (and blanks alone don't count).
  assert.equal(
    hasAirQualityControls({ so2Controls: "", noxControls: "SCR" }),
    true,
  );
  assert.equal(
    hasAirQualityControls({ so2Controls: " ", pmControls: "" }),
    false,
  );
  assert.equal(
    cleanOwnerOperator("Acme (Owner) | acme (Operator) | Beta Co (Parent)"),
    "Acme, Beta Co",
  );
  assert.equal(cleanOwnerOperator(null), "Owner unlisted");
  assert.equal(getCarbonIntensityTier(0).label, "Zero CO₂");
  assert.equal(getCarbonIntensityTier(1600).variant, "warning");
  assert.equal(getCarbonIntensityTier(2100).variant, "destructive");
});

void test("date options cover every day in a reporting year", () => {
  const options2024 = buildDateOptionsForYear(2024, "2026-06-30");
  assert.equal(options2024.length, 366);
  assert.equal(options2024[0]?.value, "2024-01-01");
  assert.equal(clampDateToYear("2023-03-10", 2024, "2026-06-30"), "2024-03-10");
  assert.equal(clampDateToYear("2024-02-29", 2025, "2026-06-30"), "2025-12-31");
  assert.equal(clampDateToYear("2026-07-15", 2026, "2026-06-30"), "2026-06-30");
  assert.equal(clampDateToYear("", 2025, "2026-06-30"), "2025-12-31");
  assert.equal(clampDateToYear("2025-05-01", 2027, "2026-06-30"), "2026-06-30");
  assert.equal(
    buildDateOptionsForYear(2026, "2026-06-30").at(-1)?.value,
    "2026-06-30",
  );
});

void test("CAMPD published-through is parsed from EPA errors and used to clamp", () => {
  const publishedThrough = "2026-06-30";
  assert.equal(
    parseCampdQuarterEndFromError(
      "Ensure that beginDate and endDate are of the form YYYY-MM-DD, are now or in the past, are after 01/01/1995, and are between 01/01/1995 and the quarter ending on 06/30/2026",
    ),
    publishedThrough,
  );
  assert.equal(parseCampdQuarterEndFromError("no quarter mentioned"), null);
  assert.deepEqual(
    getCampdValidMonthsForYear(2026, publishedThrough),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    getCampdValidMonthsForYear(2025, publishedThrough),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
  assert.deepEqual(getCampdValidMonthsForYear(2027, publishedThrough), []);
  assert.equal(
    clampIsoDateToCampdPublished("2026-07-15", publishedThrough),
    "2026-06-30",
  );
  assert.equal(
    getDefaultCampdDateForYear(2026, publishedThrough),
    "2026-06-30",
  );
  assert.equal(
    getDefaultCampdDateForYear(2025, publishedThrough),
    "2025-12-31",
  );
  assert.deepEqual(
    clampCampdDateRange("2026-01-01", "2026-12-31", publishedThrough),
    {
      beginDate: "2026-01-01",
      endDate: "2026-06-30",
    },
  );
  assert.equal(toIsoDate(new Date(2026, 5, 30)), "2026-06-30");
});

void test("yearly rollups aggregate records by reporting year", () => {
  const rollups = buildYearlyRollups([
    {
      id: "rec-1",
      year: 2022,
      grossGenerationMWh: 100,
      co2MassTons: 50,
      so2MassTons: 0,
      noxMassTons: 0,
      heatInputMMBtu: 800,
      steamLoadKlb: 0,
      operatingHours: 4000,
    },
    {
      id: "rec-2",
      year: 2022,
      grossGenerationMWh: 50,
      co2MassTons: 25,
      so2MassTons: 0,
      noxMassTons: 0,
      heatInputMMBtu: 400,
      steamLoadKlb: 0,
      operatingHours: 2000,
    },
  ]);

  assert.equal(rollups.length, 1);
  assert.equal(rollups[0]?.year, 2022);
  assert.equal(rollups[0]?.grossGenerationMWh, 150);
  assert.equal(rollups[0]?.co2MassTons, 75);
  assert.equal(rollups[0]?.unitCount, 2);
  assert.equal(rollups[0]?.co2IntensityLbsMWh, 1000);
  assert.equal(rollups[0]?.maxOperatingHours, 4000);
  assert.equal(rollups[0]?.heatRateMMBtuMWh, 8);
});

void test("CAMPD retrieval filters parse, drop 'ALL', and describe themselves", () => {
  assert.deepEqual(parseFacilityIds(" 3, 1355 |7 "), [3, 1355, 7]);
  assert.deepEqual(parseFacilityIds(""), []);
  assert.equal(parseFacilityIds("3, abc"), null);
  assert.equal(parseFacilityIds("2.5"), null);

  const active = activeCampdFilters({
    stateCode: "KY",
    facilityId: [],
    unitFuelType: "Coal",
    unitType: "ALL",
    controlTechnologies: "",
  });
  assert.deepEqual(active, { stateCode: "KY", unitFuelType: "Coal" });
  assert.equal(describeCampdFilters(active), "KY · Coal");
  assert.equal(
    describeCampdFilters({ facilityId: [3, 7], unitType: "Cyclone boiler" }),
    "Facility 3, 7 · Cyclone boiler",
  );
  assert.equal(describeCampdFilters({ stateCode: "ALL" }), "");

  assert.ok(
    campdRetrievalSchema.safeParse({ fromYear: 2020, toYear: 2024 }).success,
  );
  assert.ok(
    !campdRetrievalSchema.safeParse({ fromYear: 2024, toYear: 2020 }).success,
  );
  assert.ok(
    !campdRetrievalSchema.safeParse({ fromYear: 1990, toYear: 1991 }).success,
  );
});

void test("explorer state round-trips through URL query params", () => {
  const state = {
    tab: "units" as const,
    q: "coal units in KY",
    filters: {
      ...DEFAULT_FILTERS,
      stateCode: "KY",
      primaryFuel: "Coal",
      year: "2025",
      co2MassTonsMin: "500000",
      topN: "10",
      topBy: "noxMassTons",
      topDir: "asc",
      topLevel: "unit",
      rankGroup: "state",
    },
    table: DEFAULT_TABLE_STATE,
    auditTable: DEFAULT_AUDIT_TABLE_STATE,
    unitTable: {
      ...DEFAULT_UNIT_TABLE_STATE,
      sortBy: "noxMassTons" as const,
      sortDir: "asc" as const,
      page: 3,
      pageSize: 25,
    },
  };
  const qs = explorerSearchParams(state);
  assert.equal(
    qs,
    "tab=units&q=coal+units+in+KY&stateCode=KY&primaryFuel=Coal&year=2025&topN=10&topBy=noxMassTons&topDir=asc&topLevel=unit&rankGroup=state&co2MassTonsMin=500000&sort=noxMassTons&dir=asc&page=3&size=25",
  );
  assert.deepEqual(
    parseExplorerParams(Object.fromEntries(new URLSearchParams(qs))),
    state,
  );
  assert.equal(explorerSearchParams(parseExplorerParams({})), "");
});

void test("an old Top-N link ranks by its table sort", () => {
  const { filters } = parseExplorerParams({
    tab: "units",
    topN: "10",
    sort: "noxMassTons",
    dir: "asc",
  });
  assert.equal(describeRanking(filters), "Lowest 10 unit-years by NOₓ");
  const facilities = parseExplorerParams({
    topN: "5",
    sort: "co2",
    dir: "desc",
  });
  assert.equal(describeRanking(facilities.filters), "Top 5 facilities by CO₂");
});

void test("ranking settings count only while Top N is set", () => {
  const off = { ...DEFAULT_FILTERS, topBy: "noxMassTons", rankGroup: "state" };
  assert.equal(isFilterActive(off, "topBy"), false);
  assert.equal(isFilterActive(off, "rankGroup"), false);
  assert.equal(filterSearchParams(off).toString(), "");
  assert.equal(describeRanking(off), undefined);
  const on = { ...off, topN: "1" };
  assert.equal(isFilterActive(on, "topBy"), true);
  assert.equal(describeRanking(on), "Top 1 facility by NOₓ per state");
});

void test("a description search keeps the page's years unless it names some", () => {
  const page = { ...DEFAULT_FILTERS, yearMin: "2015", yearMax: "2025" };
  assert.deepEqual(
    applyDescribed(page, { ...DEFAULT_FILTERS, stateCode: "KY" }),
    { ...page, stateCode: "KY" },
  );
  assert.deepEqual(applyDescribed(page, { ...DEFAULT_FILTERS, year: "2024" }), {
    ...DEFAULT_FILTERS,
    year: "2024",
  });
  assert.deepEqual(
    applyDescribed(
      page,
      { ...DEFAULT_FILTERS, year: "2024" },
      { yearRange: true },
    ),
    { ...DEFAULT_FILTERS, yearMin: "2024", yearMax: "2024" },
  );
  // "At least 5000 hours" replaces Analyze's own "> 0", strictness included.
  const ran = { ...page, operatingHoursMin: "0", operatingHoursMinStrict: "1" };
  assert.deepEqual(
    applyDescribed(ran, { ...DEFAULT_FILTERS, operatingHoursMin: "5000" }),
    { ...page, operatingHoursMin: "5000" },
  );
});

void test("a strict flag is kept in the URL only while its bound is set", () => {
  const withBound = {
    ...DEFAULT_FILTERS,
    co2MassTonsMin: "500000",
    co2MassTonsMinStrict: "1",
  };
  assert.equal(
    filterSearchParams(withBound).toString(),
    "co2MassTonsMin=500000&co2MassTonsMinStrict=1",
  );
  assert.equal(isFilterActive(withBound, "co2MassTonsMinStrict"), true);
  const flagOnly = { ...DEFAULT_FILTERS, co2MassTonsMinStrict: "1" };
  assert.equal(isFilterActive(flagOnly, "co2MassTonsMinStrict"), false);
  assert.equal(filterSearchParams(flagOnly).toString(), "");
});

void test("explorer params ignore unknown keys and invalid values", () => {
  const parsed = parseExplorerParams({
    tab: "nope",
    sort: "co2MassTons", // a unit sort key is not valid on the Facilities tab
    dir: "sideways",
    page: "-2",
    size: "7",
    bogus: "1",
    stateCode: ["TX", "KY"],
  });
  assert.equal(parsed.tab, "explorer");
  assert.deepEqual(parsed.table, DEFAULT_TABLE_STATE);
  assert.equal(parsed.filters.stateCode, "TX");
  assert.equal("bogus" in parsed.filters, false);
});

void test("multiValueOptions splits combined unit values into distinct options", () => {
  assert.deepEqual(
    multiValueOptions([
      "Wet Lime FGD|Wet Limestone",
      "Diesel Oil, Pipeline Natural Gas",
      "Selective Non-catalytic Reduction (Began Oct 28, 2025)|Overfire Air",
      "Wet Limestone",
    ]),
    [
      "Diesel Oil",
      "Overfire Air",
      "Pipeline Natural Gas",
      "Selective Non-catalytic Reduction",
      "Wet Lime FGD",
      "Wet Limestone",
    ],
  );
});

void test("nextSort flips on the same field and resets the page", () => {
  const desc = (f: string) => f === "co2";
  const t = { ...DEFAULT_TABLE_STATE, page: 4 };
  assert.deepEqual(nextSort(t, "co2", desc), {
    ...t,
    page: 1,
    sortBy: "co2",
    sortDir: "desc",
  });
  assert.equal(nextSort(t, "name", desc).sortDir, "desc"); // already name/asc
  assert.equal(nextSort(t, "id", desc).sortDir, "asc");
});

void test("sortRows: numbers, formatted numbers, dates, natural text; missing values last", () => {
  const rows = ["1,250", "987", "—", "12", null, "10,000.5"];
  assert.deepEqual(
    sortRows(rows, (r) => r, "asc"),
    ["12", "987", "1,250", "10,000.5", "—", null],
  );
  assert.deepEqual(
    sortRows(rows, (r) => r, "desc"),
    ["10,000.5", "1,250", "987", "12", "—", null],
  );
  assert.deepEqual(
    sortRows(["Unit 10", "Unit 2", "unit 1"], (r) => r, "asc"),
    ["unit 1", "Unit 2", "Unit 10"],
  );
  const d = (iso: string) => new Date(iso);
  assert.deepEqual(
    sortRows([d("2026-10-07"), d("2025-01-01")], (r) => r, "asc").map((x) =>
      x.getUTCFullYear(),
    ),
    [2025, 2026],
  );
  assert.equal(isNumericValue("1,234.5"), true);
  assert.equal(isNumericValue("CT1"), false);
});

void test("audit tab sort and page round-trip through the URL", () => {
  const state = parseExplorerParams({
    tab: "audit",
    sort: "severity",
    dir: "asc",
    page: "3",
    auditFlag: "EXTREME_HEAT_RATE",
  });
  assert.deepEqual(state.auditTable, {
    ...DEFAULT_AUDIT_TABLE_STATE,
    sortBy: "severity",
    sortDir: "asc",
    page: 3,
  });
  assert.equal(state.filters.auditFlag, "EXTREME_HEAT_RATE");
  assert.equal(
    explorerSearchParams(state),
    "tab=audit&auditFlag=EXTREME_HEAT_RATE&sort=severity&dir=asc&page=3",
  );
  // A unit-view sort key is not valid on the Audit flags tab.
  assert.equal(
    parseExplorerParams({ tab: "audit", sort: "co2MassTons" }).auditTable
      .sortBy,
    "year",
  );
});

void test("a plant's role and story come from its category, fuel, size, and hours", () => {
  const role = (p: Parameters<typeof getPlantRole>[0]) => getPlantRole(p).label;
  assert.equal(role({ sourceCategory: "Cogeneration" }), "Cogeneration");
  assert.equal(role({ operatingHours: 5000 }), "Baseload");
  assert.equal(role({ capacityMW: 1500 }), "Baseload");
  assert.equal(role({ operatingHours: 0, capacityMW: 1500 }), "Standby");
  assert.equal(role({ operatingHours: 100, capacityMW: 1500 }), "Peaking");
  assert.equal(role({ operatingHours: 100 }), "Peaking");
  assert.equal(role({ operatingHours: 2000 }), "Load-following");
  assert.equal(role({ capacityMW: 50 }), "Standby");
  assert.equal(formatCountyShort("Kings County"), "Kings Co.");
  assert.equal(formatCountyShort(null), "County N/A");
  const story = generatePlantStory({
    name: "Ghent",
    county: "Carroll",
    stateCode: "KY",
    nercRegion: "SERC",
    sourceCategory: "Electric Utility",
    ownerOperator: null,
    totalCapacityMW: 100,
    primaryFuels: ["Coal"],
    co2Tons: 0,
    operatingHours: 8784,
    grossGenerationMWh: 2_000_000,
    carbonIntensity: null,
    hasControls: true,
    year: 2024,
  });
  assert.match(
    story.headline,
    /^Ghent is a 100 MW Coal facility in Carroll County, KY/,
  );
  // A leap year's full hours.
  assert.match(story.gridStory, /\(about 100% of the year\)/);
  assert.match(
    story.environmentalStory,
    /^No direct annual carbon emissions were reported for 2024/,
  );
});

void test("years, changes, and reported totals read in words without guessing", () => {
  const f = DEFAULT_FILTERS;
  assert.equal(yearsText(f), "");
  assert.equal(yearsText({ ...f, year: "2024" }), "2024");
  assert.equal(
    yearsText({ ...f, yearMin: "2015", yearMax: "2025" }),
    "2015–2025",
  );
  assert.equal(yearsText({ ...f, yearMin: "2024", yearMax: "2024" }), "2024");
  assert.equal(yearsText({ ...f, yearMin: "2015" }), "≥ 2015");
  assert.equal(
    yearsText({ ...f, yearMin: "2015", yearMinStrict: "1" }),
    "> 2015",
  );
  assert.equal(sumReported([null, undefined]), null);
  assert.equal(sumReported([null, 0, 2]), 2);
  assert.equal(maxReported([null]), null);
  assert.equal(maxReported([null, 3, 1]), 3);
  const changes = [
    { field: "co2MassTons", database: 1, incoming: 2 },
    { field: "noxControls", database: "SCR", incoming: "SNCR" },
  ] as Parameters<typeof describeChanges>[0];
  assert.equal(
    describeChanges(changes, String),
    "CO₂: 1 → 2 · NOₓ controls: SCR → SNCR",
  );
  assert.equal(
    describeChanges(changes, String, { values: false }),
    "CO₂, NOₓ controls",
  );
});
