import { STATE_NAMES } from "./describe-search";
import type { FacilityFilters } from "./facility-filters";

/** The filter values a page can suggest (the shape of `facilities.getFilterOptions`). */
export interface FilterVocab {
  states?: string[];
  years?: number[];
  fuels?: string[];
  unitTypes?: string[];
  noxControls?: string[];
  so2Controls?: string[];
  pmControls?: string[];
  programCodes?: string[];
  nercRegions?: string[];
}

/** A filter the search box can add as a chip: what to show, and the filters it sets. */
export interface FilterSuggestion {
  kind: string;
  label: string;
  patch: Partial<FacilityFilters>;
  /** The text names this value outright ("texas", "KY", "coal", "scr"), so it leads the list. */
  exact: boolean;
}

const LISTS = [
  ["primaryFuel", "Fuel", "fuels"],
  ["unitType", "Unit type", "unitTypes"],
  ["noxControl", "NOₓ control", "noxControls"],
  ["so2Control", "SO₂ control", "so2Controls"],
  ["pmControl", "PM control", "pmControls"],
  ["programCode", "Program", "programCodes"],
  ["nercRegion", "NERC region", "nercRegions"],
] as const satisfies readonly (readonly [
  keyof FacilityFilters,
  string,
  keyof FilterVocab,
])[];

const STATE_BY_CODE = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([name, code]) => [code, name]),
);
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** "TX" → "Texas"; an unknown code as given. */
export const stateName = (code: string) =>
  STATE_BY_CODE[code] ? titleCase(STATE_BY_CODE[code]) : code;

/** "Selective Catalytic Reduction" → "scr"; parenthesized words are skipped. */
const initials = (value: string) =>
  value
    .replace(/\(.*?\)/g, "")
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toLowerCase())
    .join("");

/**
 * How well `value` matches the typed text: 0 exact or initials, 1 starts with it, 2 a later word
 * starts with it, undefined no match. Matching is by word start, so "gas" finds "Natural Gas"
 * but "as" finds nothing.
 */
function rank(value: string, q: string): number | undefined {
  const v = value.toLowerCase();
  if (v === q || (q.length >= 2 && initials(value) === q)) return 0;
  if (v.startsWith(q)) return 1;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(v))
    return 2;
  return undefined;
}

/**
 * Filter values matching what was typed, best first: states (by name or postal code), a year, then
 * fuels, unit types, controls, programs, and NERC regions. Values already applied are left out.
 * `yearRange` sets both ends of the year range (Analyze) instead of the single year.
 */
export function filterSuggestions(
  text: string,
  vocab: FilterVocab | undefined,
  active: FacilityFilters,
  { yearRange = false, limit = 5 } = {},
): FilterSuggestion[] {
  const q = text.trim().toLowerCase();
  if (q.length < 2 || !vocab) return [];
  const found: (Omit<FilterSuggestion, "exact"> & { score: number })[] = [];

  for (const code of vocab.states ?? []) {
    if (active.stateCode === code) continue;
    const name = STATE_BY_CODE[code];
    const score =
      code.toLowerCase() === q ? 0 : name ? rank(name, q) : undefined;
    if (score === undefined) continue;
    found.push({
      kind: "State",
      label: name ? `${titleCase(name)} (${code})` : code,
      patch: { stateCode: code },
      score,
    });
  }

  if (/^\d{4}$/.test(q) && vocab.years?.includes(Number(q))) {
    const set = yearRange
      ? active.yearMin === q && active.yearMax === q
      : active.year === q;
    if (!set)
      found.push({
        kind: "Year",
        label: q,
        patch: yearRange ? { yearMin: q, yearMax: q } : { year: q },
        score: 0,
      });
  }

  for (const [key, kind, list] of LISTS) {
    for (const value of vocab[list] ?? []) {
      if (active[key] === value) continue;
      const score = rank(value, q);
      if (score !== undefined)
        found.push({ kind, label: value, patch: { [key]: value }, score });
    }
  }

  return found
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ score, ...s }) => ({ ...s, exact: score === 0 }));
}
