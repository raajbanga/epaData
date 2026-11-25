import { UNIT_METRICS } from "./facility-filters";
import { TOTAL_KEYS, type ReportedTotals } from "./emissions-metrics";

/** How an incoming unit-year compares with what the database already holds. */
export type DiffStatus = "new" | "changed" | "unchanged";

/** Per-year control and program information stored on each annual record. */
export const RECORD_ATTRIBUTE_KEYS = [
  "so2Controls",
  "noxControls",
  "pmControls",
  "hgControls",
  "programCode",
] as const;
export type RecordAttributes = Record<
  (typeof RECORD_ATTRIBUTE_KEYS)[number],
  string | null
>;

/** A record's comparable fields: metrics, plus the per-year attributes when the source has them. */
export type ComparableRecord = ReportedTotals & Partial<RecordAttributes>;

export interface FieldChange {
  field: keyof ReportedTotals | keyof RecordAttributes;
  database: number | string | null;
  incoming: number | string | null;
}

export interface DiffCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

/** Natural key of a unit-year record, shared by uploads, CAMPD rows, and stored records. */
export const recordKey = (
  facilityId: number,
  unitId: string,
  year: number | string,
) => `${facilityId}:${unitId}:${year}`;

/**
 * Equal within floating-point noise (relative 1e-9), so re-reading the same CAMPD value counts as
 * unchanged; null (not reported) equals only null.
 */
const sameMetric = (a: number | null, b: number | null) =>
  a === null || b === null
    ? a === b
    : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * New when nothing is stored; otherwise every metric that differs from the stored value, and every
 * per-year attribute the incoming record carries (uploads without control columns don't compare them).
 */
export function diffRecord(
  incoming: ComparableRecord,
  stored?: ComparableRecord,
): { status: DiffStatus; changes: FieldChange[] } {
  if (!stored) return { status: "new", changes: [] };
  const changes: FieldChange[] = [
    ...TOTAL_KEYS.filter((k) => !sameMetric(incoming[k], stored[k])),
    ...RECORD_ATTRIBUTE_KEYS.filter(
      (k) =>
        incoming[k] !== undefined &&
        (incoming[k] ?? null) !== (stored[k] ?? null),
    ),
  ].map((field) => ({
    field,
    database: stored[field] ?? null,
    incoming: incoming[field] ?? null,
  }));
  return { status: changes.length ? "changed" : "unchanged", changes };
}

export const emptyDiffCounts = (): DiffCounts => ({
  inserted: 0,
  updated: 0,
  unchanged: 0,
});

export function countDiff(counts: DiffCounts, status: DiffStatus) {
  if (status === "new") counts.inserted++;
  else if (status === "changed") counts.updated++;
  else counts.unchanged++;
  return counts;
}

/** Each compared field in words, for every page that lists changes. */
const FIELD_LABELS: Record<FieldChange["field"], string> = {
  ...(Object.fromEntries(UNIT_METRICS.map((m) => [m.key, m.label])) as Record<
    (typeof UNIT_METRICS)[number]["key"],
    string
  >),
  steamLoadKlb: "Steam load",
  so2Controls: "SO₂ controls",
  noxControls: "NOₓ controls",
  pmControls: "PM controls",
  hgControls: "Hg controls",
  programCode: "Programs",
};

/**
 * The changes in words, "CO₂: 1,200 → 1,250 · NOₓ controls: — → SCR", with numbers written by
 * `number`; with `values: false`, only the fields ("CO₂, NOₓ controls").
 */
export function describeChanges(
  changes: FieldChange[],
  number: (v: number | null) => string,
  { values = true } = {},
) {
  const show = (v: FieldChange["database"]) =>
    typeof v === "string" ? v : number(v);
  return values
    ? changes
        .map(
          (c) =>
            `${FIELD_LABELS[c.field]}: ${show(c.database)} → ${show(c.incoming)}`,
        )
        .join(" · ")
    : changes.map((c) => FIELD_LABELS[c.field]).join(", ");
}
