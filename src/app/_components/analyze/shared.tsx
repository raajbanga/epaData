"use client";

import { BLANK } from "~/components/ui/question-sentence";
import { Select } from "~/components/ui/select";
import {
  AGGREGATION_LABELS,
  type DimensionKey,
  type VariableInfo,
} from "~/lib/analysis";
import type { AnalysisView } from "~/lib/analysis-state";
import type { FacilityFilters } from "~/lib/facility-filters";
import type { RouterOutputs } from "~/trpc/react";
import { inSentence, formatNumber } from "~/lib/utils";

type Catalog = RouterOutputs["analysis"]["catalog"];

/** What every Analyze tab receives: the selection, the tab choices, and the catalog. */
export interface TabProps {
  filters: FacilityFilters;
  view: AnalysisView;
  setView: (patch: Partial<AnalysisView>) => void;
  catalog: Catalog;
  summary?: RouterOutputs["analysis"]["summary"];
}

/** A view's dimension choice for the API ("" = none). */
export const asDimension = (key: string) =>
  (key || undefined) as DimensionKey | undefined;

/** "CO₂ intensity (lb/MWh)". */
export const variableLabel = (v?: VariableInfo) =>
  v ? `${v.label} (${v.unit})` : "";

/** The CSV column of a variable: "co2MassTons (short tons)". */
export const valueColumn = (v?: VariableInfo) =>
  v ? `${v.key} (${v.unit})` : "";

/** "; the 8 largest of 15 groups" when a chart shows only part of its groups. */
export const shownOf = (shown: number, total = 0) =>
  total > shown
    ? `; the ${shown} largest of ${formatNumber(total)} groups`
    : "";

/** "Total", "Mean", or "Pooled rate" for the variable. */
export const combinedLabel = (v?: VariableInfo) =>
  v ? AGGREGATION_LABELS[v.aggregation] : "Value";

/** A picker's value and change handler bound to one tab choice, plus the catalog. */
export const bind = (
  { view, setView, catalog }: TabProps,
  key: keyof AnalysisView,
) => ({
  value: view[key],
  onChange: (value: string) => setView({ [key]: value }),
  catalog,
});

export const findInfo = (catalog: Catalog, key: string) =>
  catalog.variables.find((v) => v.key === key);

export const dimensionLabel = (catalog: Catalog, key: string) =>
  catalog.dimensions.find((d) => d.key === key)?.label ?? key;

/** A variable picker over the catalog, as a blank in a QuestionSentence. */
export function VariableField({
  label = "Variable",
  value,
  onChange,
  catalog,
}: {
  label?: string;
  value: string;
  onChange: (key: string) => void;
  catalog: Catalog;
}) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      aria-label={label}
      className={BLANK}
      options={catalog.variables.map((v) => ({
        value: v.key,
        label: inSentence(variableLabel(v)),
        group: v.group,
      }))}
    />
  );
}

/** A dimension picker, as wide as its text; `none` adds a "None" choice stored as "". */
export function DimensionField({
  label = "Group by",
  value,
  onChange,
  catalog,
  none,
  exclude = [],
  prefix = "",
}: {
  label?: string;
  value: string;
  onChange: (key: string) => void;
  catalog: Catalog;
  none?: string;
  exclude?: string[];
  /** Words before each option inside the sentence: "by " gives "by fuel class". */
  prefix?: string;
}) {
  return (
    <Select
      value={value || "NONE"}
      onValueChange={(v) => onChange(v === "NONE" ? "" : v)}
      aria-label={label}
      className={BLANK}
      options={[
        ...(none ? [{ value: "NONE", label: none }] : []),
        ...catalog.dimensions
          .filter((d) => !exclude.includes(d.key))
          .map((d) => ({
            value: d.key,
            label: `${prefix}${inSentence(d.label)}`,
          })),
      ]}
    />
  );
}

/** A row of tab controls. */
export function Controls({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}
