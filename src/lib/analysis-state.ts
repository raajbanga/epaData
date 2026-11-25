import { DIMENSION_KEYS } from "~/lib/analysis";
import {
  DEFAULT_FILTERS,
  firstParam,
  type FacilityFilters,
  type Params,
} from "~/lib/facility-filters";
import { isCategoryInput, MODEL_COLORS, NUMERIC_INPUTS } from "~/lib/model";

/**
 * Analyze page state (reproducible through URL parameters): the Explore filters
 * plus the active tab and each tab's choices, all as strings so they round-trip through the URL.
 */

/** One tab per question: what's selected, how one variable is spread, what moves together, how groups differ, and the TRACI impacts. */
const ANALYSIS_TABS = [
  "overview",
  "distribution",
  "relationships",
  "compare",
  "impacts",
] as const;
type AnalysisTab = (typeof ANALYSIS_TABS)[number];

/** Where the tabs and chart types before the 11/11 regroup now live, so old links keep working. */
const MOVED: Record<string, AnalysisTab> = {
  dataset: "overview",
  statistics: "distribution",
  trend: "overview",
  map: "overview",
  ranking: "overview",
  distribution: "distribution",
  scatter: "relationships",
  correlation: "relationships",
  bars: "compare",
};

export const DEFAULT_VIEW = {
  tab: "overview" as AnalysisTab,
  variable: "co2MassTons",
  by: "state", // "" = no grouping
  series: "fuelClass",
  x: "heatInputMMBtu",
  y: "noxMassTons",
  color: "fuelClass",
  box: "", // "" = automatic (box plot when grouped), "1" = box plot, "0" = histogram
  log: "", // "1" = log axis
  order: "desc", // ranking: "desc" = highest first
  rankBy: "facility",
  compareBy: "noxControl",
  groups: "SCR|None",
  impactBy: "state",
  perMWh: "", // "1" = impact per MWh
};
export type AnalysisView = typeof DEFAULT_VIEW;

/** The selection when the page opens with no parameters: the complete API years. */
export const DEFAULT_ANALYSIS_FILTERS: FacilityFilters = {
  ...DEFAULT_FILTERS,
  yearMin: "2015",
  yearMax: "2025",
  // Unit-years listed but not run (0 hours) report no values at all; leave them out by default
  // so they don't count as missing in every column. A removable chip, like the years.
  operatingHoursMin: "0",
  operatingHoursMinStrict: "1",
};

/** `defaults` overridden by the URL's values for the same keys. */
function readView<T extends Record<string, string>>(
  defaults: T,
  params: Params,
): T {
  const view = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const v = firstParam(params, key);
    if (v !== undefined) view[key] = v as T[typeof key];
  }
  return view;
}

/** The view's non-default values written into `params`. */
function writeView<T extends Record<string, string>>(
  defaults: T,
  view: T,
  params = new URLSearchParams(),
) {
  for (const key of Object.keys(defaults)) {
    if (view[key] !== defaults[key]) params.set(key, view[key]!);
  }
  return params;
}

export function parseAnalysisParams(params: Params) {
  // The URL holds the filters that differ from the page's defaults (the complete API years, units
  // that ran), so a link that sets only a state still gets them; a removed default is written
  // empty ("operatingHoursMin=").
  const filters = readView(DEFAULT_ANALYSIS_FILTERS, params);
  const view = readView(DEFAULT_VIEW, params);
  const tab: string = view.tab;
  view.tab =
    tab === "charts"
      ? (MOVED[firstParam(params, "chart") ?? "trend"] ?? "overview")
      : (MOVED[tab] ?? view.tab);
  if (!ANALYSIS_TABS.includes(view.tab)) view.tab = DEFAULT_VIEW.tab;
  // An unknown grouping field in a hand-edited link falls back to the default, not an error.
  // (Unknown variables are checked against the catalog on the page.)
  for (const key of [
    "by",
    "series",
    "color",
    "compareBy",
    "impactBy",
  ] as const) {
    const optional = key === "by" || key === "series";
    const value = view[key];
    if (!(optional && value === "") && !DIMENSION_KEYS.includes(value as never))
      view[key] = DEFAULT_VIEW[key];
  }
  // The default groups (SCR|None) are NOₓ-control values; they mean nothing for another field.
  if (
    view.compareBy !== DEFAULT_VIEW.compareBy &&
    firstParam(params, "groups") === undefined
  )
    view.groups = "";
  // The Compare tab takes up to eight groups.
  view.groups = view.groups.split("|").slice(0, 8).join("|");
  return { filters, view };
}

/** The view keys each Analyze tab reads; the others don't change what it shows. */
const TAB_VIEW_KEYS: Record<AnalysisTab, (keyof AnalysisView)[]> = {
  overview: ["variable", "series", "order", "rankBy"],
  distribution: ["variable", "by", "box", "log"],
  relationships: ["x", "y", "color", "log"],
  compare: ["variable", "compareBy", "groups"],
  impacts: ["impactBy", "perMWh"],
};

/** Exported metadata: the tab and only the choices it uses, so it reads back as the same view. */
export const analysisViewRecord = (view: AnalysisView) =>
  Object.fromEntries([
    ["tab", view.tab],
    ...TAB_VIEW_KEYS[view.tab].map((k) => [k, view[k]]),
  ]) as Partial<AnalysisView>;

/** The filters that differ from Analyze's defaults, a removed default as an empty value. */
export const analysisFilterParams = (filters: FacilityFilters) =>
  writeView(
    DEFAULT_ANALYSIS_FILTERS,
    Object.fromEntries(
      Object.entries(filters).map(([k, v]) => [k, v.trim()]),
    ) as FacilityFilters,
  );

/**
 * The filters as exported metadata records them: every filter that is set, plus Analyze's own
 * defaults (a removed one as an empty value), so the record reads on its own and
 * parseAnalysisParams gives back exactly this selection.
 */
export const analysisFilterRecord = (filters: FacilityFilters) =>
  Object.fromEntries(
    (Object.keys(DEFAULT_FILTERS) as (keyof FacilityFilters)[])
      .map((k) => [k, filters[k].trim()] as const)
      .filter(
        ([k, v]) =>
          v !== DEFAULT_FILTERS[k] ||
          DEFAULT_ANALYSIS_FILTERS[k] !== DEFAULT_FILTERS[k],
      ),
  );

/** The inverse of parseAnalysisParams: the filters and view choices that differ from the defaults. */
export const analysisSearchParams = (
  filters: FacilityFilters,
  view: AnalysisView,
) => writeView(DEFAULT_VIEW, view, analysisFilterParams(filters)).toString();

/** Predict page state: tab, model (Models tab), and the what-if question. */
const PREDICT_TABS = ["models", "whatif"] as const;
/** What a what-if covers: one unit, every unit at a plant, in a state, or in the US. */
const PREDICT_SCOPES = ["unit", "plant", "state", "us"] as const;
/** The range a sensitivity opens on, and the one any new input starts from. */
export const DEFAULT_RANGE = { by: "pct", from: "-50", to: "50", step: "5" };
const DEFAULT_PREDICT_VIEW = {
  tab: "models" as (typeof PREDICT_TABS)[number],
  model: "ridge", // Models tab: the model whose details are shown, "baseline" | "ridge" | "tree"
  scope: "unit" as (typeof PREDICT_SCOPES)[number],
  fid: "1356", // unit and plant: Ghent unit 2, 2024 (coal, no SCR)
  uid: "2",
  st: "KY", // state
  burns: "", // a group's units narrowed to a fuel ("Coal", "Gas", "Oil"); "" any
  year: "2024",
  // The change, applied to every unit: power output and fuel burned in %, SCR, primary fuel.
  load: "0",
  heat: "0",
  scr: "add", // "" unchanged | "add" | "remove"
  fuel: "", // "" unchanged, else the primary fuel every unit switches to
  input: "heat_input_mmbtu", // one input varied
  // Its range: from, to, and step, as a % change of each unit's value ("pct") or, for one
  // unit, in the input's own unit ("unit").
  ...DEFAULT_RANGE,
};
export type PredictView = typeof DEFAULT_PREDICT_VIEW;

/**
 * A range in the input's own unit only means something for one unit: a group gets the default
 * percentage range instead, never those numbers read as percentages.
 */
export const normalizeRange = (view: PredictView): PredictView =>
  view.by === "unit"
    ? view.scope === "unit"
      ? view
      : { ...view, ...DEFAULT_RANGE }
    : { ...view, by: "pct" };

export function parsePredictParams(params: Params) {
  const view = readView(DEFAULT_PREDICT_VIEW, params);
  // Sensitivity and Scenarios were separate tabs before 11/11; both now live on What-if.
  const tab: string = view.tab;
  if (tab === "sensitivity" || tab === "scenarios") view.tab = "whatif";
  // An unknown model shows Ridge, as did "both", the default before What-if stopped using it.
  if (!Object.hasOwn(MODEL_COLORS, view.model)) view.model = "ridge";
  if (!["", "add", "remove"].includes(view.scr)) view.scr = "";
  if (!PREDICT_TABS.includes(view.tab)) view.tab = DEFAULT_PREDICT_VIEW.tab;
  if (!PREDICT_SCOPES.includes(view.scope)) view.scope = "unit";
  // Not an ID or a state code: never "every plant", which an empty filter would mean.
  if (!/^\d+$/.test(view.fid)) view.fid = DEFAULT_PREDICT_VIEW.fid;
  if (!/^[A-Z]{2}$/.test(view.st)) view.st = DEFAULT_PREDICT_VIEW.st;
  // An input the models don't have (a hand-edited link) falls back to the default.
  if (
    !Object.hasOwn(NUMERIC_INPUTS, view.input) &&
    !isCategoryInput(view.input)
  )
    view.input = DEFAULT_PREDICT_VIEW.input;
  // Before 11/22 a sensitivity was "± range %"; such links keep their range.
  const range = firstParam(params, "range");
  if (range && firstParam(params, "from") === undefined) {
    view.from = `-${range}`;
    view.to = range;
  }
  return normalizeRange(view);
}

/**
 * The Predict view as exported metadata records it: only the fields the current tab and scope use
 * (a state's question carries no unit; the Models tab no what-if), so the record reads on its own.
 */
export function predictViewRecord(view: PredictView): Partial<PredictView> {
  if (view.tab === "models") return { tab: view.tab, model: view.model };
  const { tab, scope, fid, uid, st, burns, year, load, heat, scr, fuel } = view;
  const { input, by, from, to, step } = view;
  return {
    tab,
    scope,
    ...(scope === "unit" && { fid, uid }),
    ...(scope === "plant" && { fid }),
    ...(scope === "state" && { st }),
    ...(scope !== "unit" && { burns }),
    year,
    load,
    heat,
    scr,
    fuel,
    input,
    ...(Object.hasOwn(NUMERIC_INPUTS, input) ? { by, from, to, step } : {}),
  };
}

/** The inverse of parsePredictParams: the non-default choices. */
export const predictSearchParams = (view: PredictView) =>
  writeView(DEFAULT_PREDICT_VIEW, view).toString();

/**
 * Links from a facility's or unit's details: Analyze for its unit-years (every year), and What-if
 * for the plant or the unit in its last complete year (a year Predict can't use falls back there).
 */
export function detailLinks(
  facilityId: number,
  unitId: string | undefined,
  years: readonly number[],
) {
  const year = years.find((y) => y < new Date().getFullYear());
  const analyze = new URLSearchParams({
    facilityId: String(facilityId),
    ...(unitId !== undefined && { unitId }),
    yearMin: "",
    yearMax: "",
  });
  const predict = predictSearchParams({
    ...DEFAULT_PREDICT_VIEW,
    tab: "whatif",
    scope: unitId === undefined ? "plant" : "unit",
    fid: String(facilityId),
    uid: unitId ?? DEFAULT_PREDICT_VIEW.uid,
    year: year ? String(year) : DEFAULT_PREDICT_VIEW.year,
  });
  return {
    analyze: `/analyze?${analyze.toString()}`,
    predict: `/predict?${predict}`,
  };
}
