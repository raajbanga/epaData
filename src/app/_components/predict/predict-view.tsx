"use client";

import { useEffect, useMemo, useState } from "react";
import { InlineLoading, QueryError } from "~/components/ui/empty-state";
import { ExportContext } from "~/components/ui/export-button";
import { predictMetadata } from "~/lib/export-bundle";
import { PageTitle } from "~/components/ui/page";
import { SegmentedControl } from "~/components/ui/segmented-control";
import {
  normalizeRange,
  predictSearchParams,
  predictViewRecord,
  type parsePredictParams,
  type PredictView as View,
} from "~/lib/analysis-state";
import { DEFAULT_FILTERS } from "~/lib/facility-filters";
import {
  describeScenario,
  MODEL_COLORS,
  predictableYears,
  sameScenario,
  WHAT_IF_CHANGES,
  type ScenarioSpec,
  shortName,
} from "~/lib/model";
import { stateName } from "~/lib/search-suggestions";
import { replaceUrlQuery } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { ModelsTab } from "./models-tab";
import { Question } from "./question";
import { WhatIfResults } from "./whatif-results";

export type Model = RouterOutputs["prediction"]["models"][number];
type Scope = RouterOutputs["prediction"]["scope"];

/** What the What-if sections receive: both models, the scope's unit-years, and the scenario. */
export interface WhatIfProps {
  view: View;
  setView: (patch: Partial<View>) => void;
  /** Ridge and the tree: two estimates, so their spread shows how sure the answer is. */
  chosen: Model[];
  scope: Scope;
  spec: ScenarioSpec;
  /** One unit-year, not a group. */
  unit: boolean;
  /** What the scope covers, in a sentence: "Ghent unit 2", "every unit in Texas burning coal". */
  place: string;
  /** The change in a few words: "Add SCR". */
  changeLabel: string;
}

const IN_SENTENCE: Record<string, string> = {
  baseline: "the baseline",
  ridge: "Ridge",
  tree: "the tree",
};
/** A model in a sentence: "Ridge", "the tree", "the baseline". */
export const modelName = (m: Model) => IN_SENTENCE[m.kind] ?? m.name;

/** The chosen models as chart series. */
export const modelSeries = (chosen: Model[]) =>
  chosen.map((m) => ({
    key: m.kind,
    label: `${shortName(m)} model`,
    color: MODEL_COLORS[m.kind],
  }));

const TABS = { models: "Models", whatif: "What-if" } as const;

/** How good the models are, then what they predict when a unit, a plant, a state, or the nation changes. */
export function PredictView({
  initial,
}: {
  initial: ReturnType<typeof parsePredictParams>;
}) {
  const [view, setViewState] = useState(initial);
  const query = predictSearchParams(view);
  useEffect(() => replaceUrlQuery(query), [query]);
  const setView = (patch: Partial<View>) =>
    setViewState((v) => normalizeRange({ ...v, ...patch }));

  const [models] = api.prediction.models.useSuspenseQuery();
  const { data: source } = api.analysis.provenance.useQuery();
  // What-if always answers with both trained models; the Models tab shows all three.
  const trained = useMemo(
    () => models.filter((m) => m.kind !== "baseline"),
    [models],
  );

  return (
    <ExportContext
      value={predictMetadata(
        source,
        predictViewRecord(view),
        // Every model a tab's charts and tables include is described.
        view.tab === "models" ? models : trained,
      )}
    >
      <div className="space-y-6">
        <PageTitle lead="**Computer models** that predict how much **NOₓ** (smog-forming pollution) a unit puts out in a year, from how much fuel it burned, what kind of unit it is, its pollution controls, and last year's rate. **Models** shows how accurate they are; **What-if** asks what would happen if something changed.">
          Predict
        </PageTitle>
        <SegmentedControl
          variant="tabs"
          value={view.tab}
          onChange={(tab) => setView({ tab })}
          options={Object.entries(TABS).map(([value, label]) => ({
            value: value as View["tab"],
            label,
          }))}
        />

        {!trained.length ? (
          <p className="text-fg-muted text-sm">
            No models are registered. Run <code>npm run ml:train</code>.
          </p>
        ) : view.tab === "models" ? (
          <ModelsTab models={models} view={view} setView={setView} />
        ) : (
          <WhatIf view={view} setView={setView} chosen={trained} />
        )}
      </div>
    </ExportContext>
  );
}

/** A fuel narrowing in the sentence: "burning coal". */
const burning = (burns: string) =>
  burns ? ` burning ${burns.toLowerCase()}` : "";

/**
 * The question (who, which units, what change, which year), then the answer and the detail.
 * Both models always answer: where they differ, that's the uncertainty.
 */
function WhatIf({
  view,
  setView,
  chosen,
}: Pick<WhatIfProps, "view" | "setView" | "chosen">) {
  const year = Number(view.year);
  const { data: filterOptions } = api.facilities.getFilterOptions.useQuery();
  // Last year's NOₓ rate is an input, and the models know 2016–2025: only complete years whose
  // previous year is stored, within that span (no partial current year, no year after a gap).
  const model = chosen[0]!;
  const years = predictableYears(
    filterOptions?.years ?? [],
    model.fitYears,
    model.testYears,
  );
  const badYear = years.length > 0 && !years.includes(year);
  useEffect(() => {
    if (badYear) setView({ year: String(years[0]) });
  }, [badYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // The current plant's units: its name and state for the sentence, and a unit to fall back on.
  const units = api.prediction.baselineUnits.useQuery(
    { facilityId: Number(view.fid), year },
    { placeholderData: (prev) => prev },
  );
  const unitList = units.data ?? [];
  const firstUnit = unitList[0]?.unitId;
  const hasUnit = unitList.some((u) => u.unitId === view.uid);
  // A new plant or year keeps the unit when it exists there, else takes the largest emitter.
  useEffect(() => {
    if (!units.isPlaceholderData && firstUnit && !hasUnit)
      setView({ uid: firstUnit });
  }, [units.isPlaceholderData, firstUnit, hasUnit]); // eslint-disable-line react-hooks/exhaustive-deps
  const plant =
    !units.isPlaceholderData && unitList[0]
      ? { name: unitList[0].facilityName, stateCode: unitList[0].stateCode }
      : undefined;

  const burns = view.scope === "unit" ? "" : view.burns;
  const filters = {
    ...DEFAULT_FILTERS,
    primaryFuel: burns || "ALL",
    ...(view.scope === "unit"
      ? { facilityId: view.fid, unitId: view.uid }
      : view.scope === "plant"
        ? { facilityId: view.fid }
        : view.scope === "state"
          ? { stateCode: view.st }
          : {}),
  };
  const scope = api.prediction.scope.useQuery(
    { filters, year },
    { placeholderData: (prev) => prev },
  );
  const rows = scope.data?.rows ?? [];

  const plantName = plant?.name ?? "this plant";
  const place =
    view.scope === "unit"
      ? `${plantName} unit ${view.uid}`
      : view.scope === "plant"
        ? `every unit at ${plantName}`
        : view.scope === "state"
          ? `every unit in ${stateName(view.st)}`
          : "every unit in the US";

  const spec = useMemo<ScenarioSpec>(
    () => ({
      load: Number(view.load) || 0,
      heat: Number(view.heat) || 0,
      scr: view.scr === "add" || view.scr === "remove" ? view.scr : "",
      fuel: view.fuel,
    }),
    [view.load, view.heat, view.scr, view.fuel],
  );
  const changeLabel =
    WHAT_IF_CHANGES.find((c) => sameScenario(c.spec, spec))?.label ??
    describeScenario(spec);

  return (
    <div className="space-y-10">
      <Question
        view={view}
        setView={setView}
        current={spec}
        place={place}
        plant={plant}
        years={years}
        filterOptions={filterOptions}
        fuels={chosen[0]!.artifact.ranges.categorical.primary_fuel}
      />

      {scope.error ? (
        <QueryError error={scope.error} onRetry={() => void scope.refetch()} />
      ) : !scope.data ? (
        <InlineLoading title="Loading the units…" />
      ) : !rows.length ? (
        <p className="text-fg-muted text-sm">
          {view.scope === "unit"
            ? `This unit has no NOₓ record for ${view.year}; pick another unit or year.`
            : `No unit${burning(burns)} reported NOₓ here in ${view.year}; try another fuel or place.`}
        </p>
      ) : (
        <div
          inert={scope.isPlaceholderData}
          className={
            scope.isPlaceholderData ? "space-y-10 opacity-60" : "space-y-10"
          }
        >
          <WhatIfResults
            view={view}
            setView={setView}
            chosen={chosen}
            scope={scope.data}
            spec={spec}
            unit={view.scope === "unit"}
            place={`${place}${burning(burns)}`}
            changeLabel={changeLabel}
          />
        </div>
      )}
    </div>
  );
}
