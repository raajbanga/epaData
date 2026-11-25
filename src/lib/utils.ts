import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { SortDirection } from "./facility-filters";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type SortValue = string | number | Date | null | undefined;

const isMissing = (v: SortValue) =>
  v === null || v === undefined || v === "" || v === "—";

const SCALE = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as const;
const NUMBER_TEXT = /^(-?[\d,]*\.?\d+)([KMBT])?$/;

/** Dates and formatted numbers ("1,234.5", "19.5B") as numbers; anything else unchanged. */
const sortable = (v: SortValue) => {
  if (v instanceof Date) return v.getTime();
  const m = typeof v === "string" ? NUMBER_TEXT.exec(v.trim()) : null;
  return m
    ? Number(m[1]!.replace(/,/g, "")) *
        (m[2] ? SCALE[m[2] as keyof typeof SCALE] : 1)
    : v;
};

/** "19.5B", "497K", "0.05": compact notation, 3 significant digits. */
export const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumSignificantDigits: 3,
});

/**
 * Large numbers in short form, "19.5B", "497K", "1.6M"; under 10,000 they're written out
 * ("9,193"), where the short form saves nothing. Downloads keep full precision.
 */
export const shortNumber = (value: number) =>
  Math.abs(value) >= 10_000 ? compactNumber.format(value) : null;

/** Whether a value sorts as a number (so its column starts highest-first). */
export const isNumericValue = (v: SortValue) => typeof sortable(v) === "number";

/** Ascending order for table cells: numbers and dates numerically, text naturally ("Unit 2" < "Unit 10"). */
function compareValues(a: SortValue, b: SortValue) {
  const x = sortable(a);
  const y = sortable(b);
  return typeof x === "number" && typeof y === "number"
    ? x - y
    : String(x).localeCompare(String(y), undefined, { numeric: true });
}

/** Client-side sort for small tables: stable, and missing values stay last in either direction. */
export function sortRows<T>(
  rows: readonly T[],
  key: (row: T) => SortValue,
  dir: SortDirection,
) {
  return rows
    .map((row, i) => ({ row, i, v: key(row) }))
    .sort((a, b) => {
      if (isMissing(a.v) || isMissing(b.v)) {
        return Number(isMissing(a.v)) - Number(isMissing(b.v)) || a.i - b.i;
      }
      const c = compareValues(a.v, b.v);
      return (dir === "asc" ? c : -c) || a.i - b.i;
    })
    .map(({ row }) => row);
}

/** Distinct non-empty strings, in first-seen order. */
export const uniqueStrings = (values: (string | null | undefined)[]) =>
  [...new Set(values)].filter((v): v is string => Boolean(v));

/** Locale-formatted quantity with an optional unit; null (not reported) renders "—", a reported 0 "0 t". */
export function formatQuantity(
  value: number | null | undefined,
  unit = "",
  { digits = 0 } = {},
) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const num =
    shortNumber(value) ??
    value.toLocaleString("en-US", { maximumFractionDigits: digits });
  return unit ? `${num} ${unit}` : num;
}

/** Plain number for tables and counts; zero renders "0", null "—". */
export const formatNumber = (value: number | null | undefined, digits = 0) =>
  formatQuantity(value, "", { digits });

/** "12,345": a count written out in full, for row ranges that must add up exactly. */
export const exactCount = (n: number) => n.toLocaleString("en-US");

/** "Every unit in Texas" from "every unit in Texas". */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A label inside a sentence: "fuel class", but "NOₓ control" and "CO₂ mass" keep their case. */
export const inSentence = (label: string) =>
  /^[A-Z][A-Z]/.test(label)
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1);

/** "1 unit", "3 units", "2 facilities": the count with its noun; `many` defaults to `one` + "s". */
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${shortNumber(n) ?? n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Display names for `datasets.source`. */
const DATASET_SOURCE_LABELS: Record<string, string> = {
  API: "EPA CAMPD API",
  BULK_CSV: "CSV upload",
  BULK_EXCEL: "Excel upload",
};

export const sourceLabel = (source: string) =>
  DATASET_SOURCE_LABELS[source] ?? source;

/** "10/7/2026", in UTC so the server and every browser show the same day. */
export const formatDate = (date: Date | number) =>
  new Date(date).toLocaleDateString("en-US", { timeZone: "UTC" });

/** Where a record came from, e.g. "EPA CAMPD API · 10/7/2026". */
export const datasetOriginLabel = (d: {
  source: string;
  importedAt: Date | number;
}) => `${sourceLabel(d.source)} · ${formatDate(d.importedAt)}`;

/**
 * A dataset's history status: a failed retrieval, superseded by a later import (for an upload,
 * by the CAMPD API when a sync took its records), partly replaced by the API, or active.
 */
export const datasetStatus = (d: {
  notes: string | null;
  superseded: boolean;
  replacedByApi?: number;
}) =>
  d.notes?.startsWith("Error")
    ? ("Error" as const)
    : d.superseded
      ? d.replacedByApi
        ? ("Superseded by API" as const)
        : ("Superseded" as const)
      : d.replacedByApi
        ? ("Partly replaced by API" as const)
        : ("Active" as const);

/** URL params of the inspect dialog (?facility=3, ?unit=…), kept when a page rewrites its own query. */
export const DETAIL_PARAMS = ["facility", "unit"] as const;

/** Mirror a page's state into the URL without navigating, keeping any open detail dialog's param. */
export function replaceUrlQuery(query: string) {
  const current = new URLSearchParams(window.location.search);
  const next = new URLSearchParams(query);
  for (const key of DETAIL_PARAMS) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  const search = next.toString();
  window.history.replaceState(
    null,
    "",
    search ? `?${search}` : window.location.pathname,
  );
}

/** "kg CO2 eq" → "kg CO₂ eq": subscripts in the chemical formulas of a unit stored as plain text. */
export const chemUnit = (unit: string) =>
  unit.replace(/\b(CO|SO|NO)2\b/g, "$1₂").replace(/\bO3\b/g, "O₃");
