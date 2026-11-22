"use client";

import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "~/components/ui/input";
import { getFuelTheme } from "~/lib/map-utils";
import { cn, formatQuantity } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import type { FacilityFilters } from "~/lib/facility-filters";
import {
  filterSuggestions,
  type FilterSuggestion,
  type FilterVocab,
} from "~/lib/search-suggestions";
import { Swatch } from "~/components/ui/swatch";

export type FacilitySuggestion = RouterOutputs["facilities"]["suggest"][number];
export type UnitSuggestion =
  RouterOutputs["facilities"]["suggestUnits"][number];

/**
 * The company to show under a suggestion: the operator (the owners are usually the same), or,
 * when the match came from an owner or operator rather than the name, that one ("Owner:
 * Allegheny Energy"), so the match makes sense. The stored text is "A (Owner)|B (Operator)".
 */
function companyLine(f: FacilitySuggestion, q: string) {
  const parts = (f.ownerOperator ?? "")
    .split("|")
    .map((p) => /^(.*?)\s*\((Owner|Operator)\)\s*$/.exec(p.trim()))
    .filter((m) => m !== null)
    .map(([, name, role]) => ({ name: name!, role: role! }));
  const needle = q.toLowerCase();
  if (needle && !f.name.toLowerCase().includes(needle)) {
    const hit = parts.find((p) => p.name.toLowerCase().includes(needle));
    if (hit) return `${hit.role}: ${hit.name}`;
  }
  return (parts.find((p) => p.role === "Operator") ?? parts[0])?.name ?? "";
}

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms = 200) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Filter values a page offers as suggestions; picking one adds it as a chip. */
interface SearchFilters {
  vocab?: FilterVocab;
  active: FacilityFilters;
  onPick: (s: FilterSuggestion) => void;
  /** Analyze: a year sets both ends of the range. */
  yearRange?: boolean;
  /** List the filters above the facilities or units (Analyze, where groups matter most). */
  first?: boolean;
}

type Item =
  | { type: "filter"; key: string; s: FilterSuggestion }
  | { type: "facility"; key: string; f: FacilitySuggestion }
  | { type: "unit"; key: string; u: UnitSuggestion };

const GROUP_LABEL: Record<Item["type"], string> = {
  filter: "Filters",
  facility: "Facilities",
  unit: "Units",
};

const place = (county: string | null, state: string) =>
  county ? `${county.replace(/ County$/, " Co.")}, ${state}` : state;

/**
 * The one search box of the app. What it suggests depends on the page: facilities (`onPick`),
 * units (`onPickUnit`, typed as "Ghent 2" or "1356 CT1"), and filter values such as a state, fuel,
 * control, program, or year (`filters`), each in its own group. Arrow keys and Enter, or the mouse,
 * pick a suggestion. Enter with nothing highlighted calls `onSubmit`, which the filter bars use for
 * description search; without one (a picker), it picks the first suggestion, waiting for the
 * list if it is still loading.
 */
export function FacilitySearch({
  value,
  onValueChange,
  onPick,
  onPickUnit,
  filters,
  onSubmit,
  onClear,
  isLoading,
  placeholder = "Search plant, operator, county, or ID",
  hint,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (text: string) => void;
  /** Suggest facilities. */
  onPick?: (facility: FacilitySuggestion) => void;
  /** Suggest units. */
  onPickUnit?: (unit: UnitSuggestion) => void;
  /** Suggest filter values. */
  filters?: SearchFilters;
  onSubmit?: () => void;
  /** Shown as an ✕ in the box while it has text; defaults to clearing the text. */
  onClear?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  /** A line under the suggestions, e.g. what Enter does. */
  hint?: ReactNode;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = useDebounced(value.trim());
  const ready = open && q.length >= 2;
  // No placeholder data: a stale list for the previous text could be clicked by mistake.
  const facilityQuery = api.facilities.suggest.useQuery(
    { q },
    { enabled: ready && !!onPick },
  );
  const unitQuery = api.facilities.suggestUnits.useQuery(
    { q },
    { enabled: ready && !!onPickUnit },
  );
  const isFetching = facilityQuery.isFetching || unitQuery.isFetching;

  // Until the typed text settles, the list would be for older text; hide it.
  const current = q.length >= 2 && q === value.trim();
  const filterItems: Item[] =
    current && filters
      ? filterSuggestions(q, filters.vocab, filters.active, {
          yearRange: filters.yearRange,
        }).map((s) => ({ type: "filter", key: `${s.kind}:${s.label}`, s }))
      : [];
  const recordItems: Item[] = current
    ? [
        ...(onPick ? (facilityQuery.data ?? []) : []).map((f): Item => ({
          type: "facility",
          key: `f${f.id}`,
          f,
        })),
        ...(onPickUnit ? (unitQuery.data ?? []) : []).map((u): Item => ({
          type: "unit",
          key: `u${u.facilityId}:${u.unitId}`,
          u,
        })),
      ]
    : [];
  // A filter the text names outright ("texas", "coal") leads; otherwise the page's preference.
  const filtersFirst =
    filters?.first === true ||
    filterItems.some((i) => i.type === "filter" && i.s.exact);
  const items = filtersFirst
    ? [...filterItems, ...recordItems]
    : [...recordItems, ...filterItems];
  const showList = open && items.length > 0;
  const grouped = new Set(items.map((i) => i.type)).size > 1;

  const pick = (item: Item) => {
    setOpen(false);
    setActive(-1);
    setNotice(null);
    if (item.type === "filter") filters?.onPick(item.s);
    else if (item.type === "facility") onPick?.(item.f);
    else onPickUnit?.(item.u);
  };

  // A picker's Enter before its list arrives: pick the first match once it does, or say there is none.
  const [pendingEnter, setPendingEnter] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listSettled = current && !isFetching;
  useEffect(() => {
    if (!pendingEnter) return;
    if (items[0]) {
      setPendingEnter(false);
      pick(items[0]);
    } else if (listSettled) {
      setPendingEnter(false);
      setNotice(`Nothing matches “${value.trim()}”.`);
    }
  }, [pendingEnter, items, listSettled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("relative min-w-0", className)}>
      {isLoading || (open && isFetching) ? (
        <Loader2 className="text-fg-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 animate-spin" />
      ) : (
        <Search className="text-fg-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      )}
      <Input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          setActive(-1);
          setNotice(null);
          setPendingEnter(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!items.length) return;
            e.preventDefault();
            setOpen(true);
            // -1 is the text itself; the arrows cycle through it and every suggestion.
            const n = items.length;
            setActive((i) =>
              e.key === "ArrowDown"
                ? i + 1 >= n
                  ? -1
                  : i + 1
                : i - 1 < -1
                  ? n - 1
                  : i - 1,
            );
          } else if (e.key === "Enter") {
            const chosen = showList ? items[active] : undefined;
            e.preventDefault();
            if (chosen) pick(chosen);
            else if (onSubmit) {
              setOpen(false);
              onSubmit();
            } else if (value.trim().length < 2) {
              setNotice("Type two or more letters, then pick a suggestion.");
            } else {
              setOpen(true);
              setPendingEnter(true);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        className={cn("h-10 pr-9 pl-9 text-[15px]", inputClassName)}
      />
      {value && (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onValueChange(""))}
          className="text-fg-muted hover:text-fg absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {notice && !showList && (
        <p
          role="status"
          className="border-edge bg-surface text-warn absolute top-full right-0 left-0 z-40 mt-1 rounded-md border px-3 py-1.5 text-sm shadow-lg"
        >
          {notice}
        </p>
      )}
      {showList && (
        <div className="border-edge bg-surface absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-md border shadow-lg">
          <ul
            id={listId}
            role="listbox"
            className="max-h-96 overflow-y-auto py-1"
          >
            {items.map((item, i) => (
              <Fragment key={item.key}>
                {grouped && items[i - 1]?.type !== item.type && (
                  <li
                    role="presentation"
                    className="text-fg-muted px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase"
                  >
                    {GROUP_LABEL[item.type]}
                  </li>
                )}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // Keep focus in the box so the blur doesn't close the list before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm",
                    i === active && "bg-surface-2",
                  )}
                >
                  <SuggestionRow item={item} q={q} />
                </li>
              </Fragment>
            ))}
          </ul>
          {(hint ?? !onSubmit) && (
            <p className="border-edge text-fg-muted border-t px-3 py-1.5 text-sm">
              {hint ?? "Enter picks the highlighted suggestion, or the first."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ item, q }: { item: Item; q: string }) {
  if (item.type === "filter")
    return (
      <>
        <span className="border-edge text-fg-muted shrink-0 rounded border px-1.5 py-px text-[11px]">
          {item.s.kind}
        </span>
        <span className="text-fg min-w-0 flex-1 truncate font-medium">
          {item.s.label}
        </span>
        <span className="text-fg-muted shrink-0 text-xs">Add filter</span>
      </>
    );
  if (item.type === "facility") {
    const f = item.f;
    return (
      <>
        <Swatch color={getFuelTheme(f.primaryFuel).color} />
        <span className="min-w-0 flex-1">
          <span className="text-fg block truncate font-medium">
            {f.name}{" "}
            <span className="text-fg-muted font-normal tabular-nums">
              {f.id}
            </span>
          </span>
          <span className="text-fg-muted block truncate text-xs">
            {[place(f.county, f.stateCode), companyLine(f, q)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="text-fg-muted shrink-0 text-xs tabular-nums">
          {f.totalCapacityMW
            ? formatQuantity(f.totalCapacityMW, "MW", { digits: 0 })
            : ""}
        </span>
      </>
    );
  }
  const u = item.u;
  return (
    <>
      <Swatch color={getFuelTheme(u.primaryFuel).color} />
      <span className="min-w-0 flex-1">
        <span className="text-fg block truncate font-medium">
          {u.facilityName} unit {u.unitId}{" "}
          <span className="text-fg-muted font-normal tabular-nums">
            {u.facilityId}
          </span>
        </span>
        <span className="text-fg-muted block truncate text-xs">
          {[
            place(u.county, u.stateCode),
            u.primaryFuel,
            u.unitType,
            u.operatingStatus && !u.operatingStatus.startsWith("Operating")
              ? u.operatingStatus
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="text-fg-muted shrink-0 text-xs tabular-nums">
        {u.capacityMW ? formatQuantity(u.capacityMW, "MW", { digits: 0 }) : ""}
      </span>
    </>
  );
}
