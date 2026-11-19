"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Field, FIELD_LABEL } from "~/components/ui/report";
import { Select, toOptions } from "~/components/ui/select";
import {
  BLANK,
  BLANK_TRIGGER,
  QuestionSentence,
} from "~/components/ui/question-sentence";
import { TryExamples } from "~/components/ui/try-examples";
import type { PredictView } from "~/lib/analysis-state";
import { DEFAULT_FILTERS } from "~/lib/facility-filters";
import { sameScenario, WHAT_IF_CHANGES, type ScenarioSpec } from "~/lib/model";
import { stateName } from "~/lib/search-suggestions";
import type { RouterOutputs } from "~/trpc/react";
import { Controls } from "../analyze/shared";
import { FacilitySearch } from "../facility-search";

type FilterOptions = RouterOutputs["facilities"]["getFilterOptions"];

/** A group's units narrowed by fuel; matched by "contains", so "Gas" is every gas. */
const BURNS = [
  { value: "ANY", label: "burning any fuel" },
  { value: "Coal", label: "burning coal" },
  { value: "Gas", label: "burning gas" },
  { value: "Oil", label: "burning oil" },
];

const CUSTOM = "custom";

/** One-click questions that fill every blank. */
const EXAMPLES: { label: string; view: Partial<PredictView> }[] = [
  {
    label: "Texas coal plants add SCR",
    view: { scope: "state", st: "TX", burns: "Coal", ...spec(0) },
  },
  {
    label: "Ghent unit 2 runs 10 % more",
    view: { scope: "unit", fid: "1356", uid: "2", burns: "", ...spec(2) },
  },
  {
    label: "every US gas unit burns 5 % less fuel",
    view: { scope: "us", burns: "Gas", ...spec(4) },
  },
  {
    label: "Kentucky coal plants switch to gas",
    view: { scope: "state", st: "KY", burns: "Coal", ...spec(5) },
  },
];

/** A change's scenario as view fields. */
function spec(i: number) {
  return toView(WHAT_IF_CHANGES[i]!.spec);
}
function toView(s: ScenarioSpec): Partial<PredictView> {
  return {
    load: String(s.load),
    heat: String(s.heat),
    scr: s.scr,
    fuel: s.fuel,
  };
}

/**
 * The what-if as a question whose blanks are the controls: "What if [every unit in Texas]
 * [burning coal] [added SCR] in [2024]?". A custom change opens its own fields.
 */
export function Question({
  view,
  setView,
  current,
  place,
  plant,
  years,
  filterOptions,
  fuels,
}: {
  view: PredictView;
  setView: (patch: Partial<PredictView>) => void;
  current: ScenarioSpec;
  /** The scope in the sentence: "every unit in Texas". */
  place: string;
  /** The current unit's plant, for the shortcuts. */
  plant: { name: string; stateCode: string } | undefined;
  years: number[];
  filterOptions: FilterOptions | undefined;
  fuels: string[];
}) {
  const match = WHAT_IF_CHANGES.find((c) => sameScenario(c.spec, current));
  const [custom, setCustom] = useState(!match);
  const change = custom || !match ? CUSTOM : match.key;

  return (
    <div className="space-y-3">
      <QuestionSentence label="What-if question">
        <span>What if</span>
        <PlacePicker
          view={view}
          setView={setView}
          place={place}
          plant={plant}
          filterOptions={filterOptions}
        />
        {view.scope !== "unit" && (
          <Select
            aria-label="Which units"
            value={view.burns || "ANY"}
            onValueChange={(b) => setView({ burns: b === "ANY" ? "" : b })}
            options={BURNS}
            className={BLANK}
          />
        )}
        <Select
          aria-label="What changes"
          value={change}
          onValueChange={(key) => {
            const c = WHAT_IF_CHANGES.find((x) => x.key === key);
            setCustom(!c);
            if (c) setView(toView(c.spec));
          }}
          options={[
            ...WHAT_IF_CHANGES.map((c) => ({ value: c.key, label: c.phrase })),
            { value: CUSTOM, label: "made a custom change" },
          ]}
          className={BLANK}
        />
        <span>in</span>
        <Select
          aria-label="Year"
          value={view.year}
          onValueChange={(year) => setView({ year })}
          options={toOptions(years.length ? years : [Number(view.year)])}
          className={BLANK}
        />
        <span className="-ml-1.5">?</span>
      </QuestionSentence>

      {change === CUSTOM && (
        <Controls>
          <Field label="Power output (%)">
            <Input
              type="number"
              value={view.load}
              onChange={(e) => setView({ load: e.target.value })}
              className="h-9 w-24"
            />
          </Field>
          <Field label="Fuel burned (%)">
            <Input
              type="number"
              value={view.heat}
              onChange={(e) => setView({ heat: e.target.value })}
              className="h-9 w-24"
            />
          </Field>
          <Field label="SCR (a NOₓ control)">
            <Select
              value={view.scr || "same"}
              onValueChange={(scr) =>
                setView({ scr: scr === "same" ? "" : scr })
              }
              options={[
                { value: "same", label: "Unchanged" },
                { value: "add", label: "Added to every unit" },
                { value: "remove", label: "Removed from every unit" },
              ]}
              className="w-56"
            />
          </Field>
          <Field label="Primary fuel">
            <Select
              value={view.fuel || "same"}
              onValueChange={(f) => setView({ fuel: f === "same" ? "" : f })}
              options={[
                { value: "same", label: "Unchanged" },
                ...fuels.map((f) => ({ value: f, label: f })),
              ]}
              className="w-56"
            />
          </Field>
        </Controls>
      )}

      <TryExamples
        examples={EXAMPLES.map((ex) => ({
          label: ex.label,
          onSelect: () => {
            setCustom(false);
            setView(ex.view);
          },
        }))}
      />
    </div>
  );
}

/**
 * Who the question is about: search a unit, a plant, or a state, or take a shortcut (the whole
 * US, or the current unit's state or plant).
 */
function PlacePicker({
  view,
  setView,
  place,
  plant,
  filterOptions,
}: {
  view: PredictView;
  setView: (patch: Partial<PredictView>) => void;
  place: string;
  plant: { name: string; stateCode: string } | undefined;
  filterOptions: FilterOptions | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const go = (patch: Partial<PredictView>) => {
    setView(patch);
    setText("");
    setOpen(false);
  };
  const shortcuts: { label: string; patch: Partial<PredictView> }[] = [
    { label: "Every unit in the US", patch: { scope: "us" } },
    ...(plant
      ? [
          {
            label: `Every unit in ${stateName(plant.stateCode)}`,
            patch: { scope: "state" as const, st: plant.stateCode },
          },
          {
            label: `Every unit at ${plant.name}`,
            patch: { scope: "plant" as const },
          },
          {
            label: `${plant.name} unit ${view.uid}`,
            patch: { scope: "unit" as const },
          },
        ]
      : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={BLANK_TRIGGER}
        aria-label="Which units: search a unit, plant, or state"
      >
        <span className="truncate">{place}</span>
        <ChevronDown className="text-fg-muted size-4 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <FacilitySearch
          value={text}
          onValueChange={setText}
          onPickUnit={(u) =>
            go({ scope: "unit", fid: String(u.facilityId), uid: u.unitId })
          }
          onPick={(f) => go({ scope: "plant", fid: String(f.id) })}
          filters={{
            vocab: filterOptions,
            active: DEFAULT_FILTERS,
            onPick: ({ patch }) => {
              if (patch.stateCode) go({ scope: "state", st: patch.stateCode });
            },
          }}
          placeholder="Search a unit, plant, or state"
          aria-label="Search a unit, plant, or state"
          inputClassName="h-9 text-sm"
        />
        <div className="space-y-1">
          <p className={FIELD_LABEL}>Or pick</p>
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => go(s.patch)}
              className="text-fg-2 hover:bg-surface-2 hover:text-fg block w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm"
            >
              {s.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
