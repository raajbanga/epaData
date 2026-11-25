"use client";

import { useDeferredValue, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  EmptyState,
  InlineLoading,
  QueryError,
} from "~/components/ui/empty-state";
import { Input } from "~/components/ui/input";
import { PageTitle, PageView } from "~/components/ui/page";
import {
  ErrorBanner,
  Field,
  ReportTable,
  Section,
} from "~/components/ui/report";
import { SegmentedControl } from "~/components/ui/segmented-control";
import { TryExamples } from "~/components/ui/try-examples";
import { Select, toOptions } from "~/components/ui/select";
import { KpiStrip, StatTile } from "~/components/ui/stat-tile";
import {
  DEFAULT_RETRIEVAL,
  type CampdRetrieval as RetrievalInput,
  parseFacilityIds,
} from "~/lib/facility-filters";
import { describeChanges, type FieldChange } from "~/lib/record-diff";
import { datasetOriginLabel, formatNumber } from "~/lib/utils";
import { METRICS } from "~/lib/metrics";
import { api } from "~/trpc/react";
import { DatasetHistory } from "./dataset-history";

type PreviewTab = "new" | "changed" | "unchanged" | "dropped";

/** First year of Acid Rain Program annual data in CAMPD. */
const FIRST_CAMPD_YEAR = 1995;
const LAST_YEAR = new Date().getFullYear() - 1;

const changeText = (changes: FieldChange[]) =>
  describeChanges(changes, (v) => formatNumber(v, 2));

/** Sample retrievals for the demo: a state and fuel, one facility's history, a unit type, a control. */
const RETRIEVE_EXAMPLES: ({
  label: string;
  years: { from: number; to: number };
} & Partial<typeof DEFAULT_RETRIEVAL>)[] = [
  {
    label: "Kentucky coal units, 2025",
    years: { from: 2025, to: 2025 },
    stateCode: "KY",
    unitFuelType: "Coal",
  },
  {
    label: "Barry (facility 3), 2023–2025",
    years: { from: 2023, to: 2025 },
    facilityIds: "3",
  },
  {
    label: "Texas combined-cycle units, 2024",
    years: { from: 2024, to: 2024 },
    stateCode: "TX",
    unitType: "Combined cycle",
  },
  {
    label: "Ohio units with a baghouse, 2025",
    years: { from: 2025, to: 2025 },
    stateCode: "OH",
    controlTechnologies: "Baghouse",
  },
];

const sum = <T,>(rows: T[], key: keyof T) =>
  rows.reduce((n, row) => n + Number(row[key]), 0);

/**
 * Retrieval: CAMPD annual emissions by year range and filters. Shows what the database already
 * holds, previews what the API returns against it (new / changed / unchanged / dropped), and saves
 * only after approval. Also lists the dataset history.
 */
export function RetrieveView() {
  const utils = api.useUtils();
  const [form, setForm] = useState(DEFAULT_RETRIEVAL);
  const [years, setYears] = useState({ from: LAST_YEAR, to: LAST_YEAR });
  const [previewInput, setPreviewInput] = useState<RetrievalInput | null>(null);
  const [tab, setTab] = useState<PreviewTab>("changed");
  const setField = (key: keyof typeof DEFAULT_RETRIEVAL, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const facilityIds = parseFacilityIds(form.facilityIds);
  const yearCount = years.to - years.from + 1;
  const invalid =
    facilityIds === null
      ? "Plant IDs must be whole numbers separated by commas, like 3, 26."
      : yearCount < 1
        ? "The first year must not be after the last year."
        : null;
  const input: RetrievalInput | null =
    invalid || !facilityIds
      ? null
      : {
          fromYear: years.from,
          toYear: years.to,
          stateCode: form.stateCode,
          facilityId: facilityIds,
          unitFuelType: form.unitFuelType,
          unitType: form.unitType,
          controlTechnologies: form.controlTechnologies,
        };
  const deferredInput = useDeferredValue(input);
  // A preview belongs to the parameters it was run with; editing them asks for a new one.
  const previewIsCurrent =
    previewInput !== null &&
    JSON.stringify(previewInput) === JSON.stringify(input);

  const retrieve = api.facilities.retrieveCampd.useMutation({
    onSettled: () => void utils.facilities.invalidate(),
    onSuccess: () => setPreviewInput(null),
  });
  const running = retrieve.isPending;
  const runError = retrieve.data?.error ?? retrieve.error?.message;
  const results = retrieve.data?.results ?? [];

  const previewQuery = api.facilities.previewCampd.useQuery(previewInput!, {
    enabled: previewInput !== null,
    staleTime: Infinity,
  });
  const preview = previewIsCurrent ? previewQuery.data : undefined;
  const previewYears = preview?.years ?? [];
  const previewing = previewIsCurrent && previewQuery.isFetching;

  const coverageQuery = api.facilities.getLocalCoverage.useQuery(
    deferredInput!,
    { enabled: deferredInput !== null },
  );
  const coverage = coverageQuery.data ?? [];

  const { data: filterOptions } = api.facilities.getFilterOptions.useQuery();
  const { data: published } =
    api.facilities.getCampdPublishedThrough.useQuery();
  const { data: campdOptions } = api.facilities.getRetrievalOptions.useQuery();

  const latestYear = Math.max(published?.year ?? LAST_YEAR, LAST_YEAR);
  const yearOptions = toOptions(
    Array.from(
      { length: latestYear - FIRST_CAMPD_YEAR + 1 },
      (_, i) => latestYear - i,
    ),
  );

  const selects = [
    { key: "stateCode", label: "State", values: filterOptions?.states },
    { key: "unitFuelType", label: "Fuel", values: campdOptions?.fuels },
    {
      key: "unitType",
      label: "Unit type",
      values: campdOptions?.unitTypes,
    },
    {
      key: "controlTechnologies",
      label: "Control technology",
      values: campdOptions?.controls,
    },
  ] as const;

  const toSave = sum(previewYears, "inserted") + sum(previewYears, "updated");
  const previewRows = previewYears.flatMap((y) =>
    tab === "dropped" ? [] : y.rows[tab],
  );
  const droppedRows = previewYears.flatMap((y) =>
    y.droppedRows.map((d) => ({ ...d, year: y.year })),
  );

  return (
    <PageView
      header={
        <PageTitle
          lead={
            <>
              <strong className="text-fg font-semibold">
                Get newer records straight from the EPA.
              </strong>{" "}
              Pick years and filters, see what the EPA would send next to what
              is already stored, then{" "}
              <strong className="text-fg font-semibold">approve to save</strong>
              . Nothing is saved before you approve, and each year becomes its
              own dataset. Files downloaded from the EPA website go through{" "}
              <Link href="/upload" className="text-primary hover:underline">
                Upload
              </Link>{" "}
              instead.
            </>
          }
        >
          Retrieve from the EPA
        </PageTitle>
      }
    >
      {runError && <ErrorBanner>Retrieval stopped at {runError}</ErrorBanner>}
      {preview?.error && (
        <ErrorBanner>Preview stopped at {preview.error}</ErrorBanner>
      )}

      <Section title="Filters">
        <TryExamples
          examples={RETRIEVE_EXAMPLES.map(({ label, years: y, ...form }) => ({
            label,
            onSelect: () => {
              setForm({ ...DEFAULT_RETRIEVAL, ...form });
              setYears(y);
            },
          }))}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="From year">
            <Select
              size="drawer"
              value={String(years.from)}
              onValueChange={(v) =>
                setYears((y) => ({ ...y, from: Number(v) }))
              }
              options={yearOptions}
            />
          </Field>
          <Field label="To year">
            <Select
              size="drawer"
              value={String(years.to)}
              onValueChange={(v) => setYears((y) => ({ ...y, to: Number(v) }))}
              options={yearOptions}
            />
          </Field>
          <Field label="Facility IDs" className="col-span-2">
            <Input
              value={form.facilityIds}
              onChange={(e) => setField("facilityIds", e.target.value)}
              placeholder="Any, or e.g. 3, 1355"
            />
          </Field>
          {selects.map(({ key, label, values }) => (
            <Field key={key} label={label}>
              <Select
                size="drawer"
                value={form[key]}
                onValueChange={(v) => setField(key, v)}
                options={toOptions(values, "Any")}
              />
            </Field>
          ))}
        </div>
        {invalid && <p className="text-danger text-sm">{invalid}</p>}
        <Button
          className="mt-1"
          disabled={!input || previewing}
          onClick={() => input && setPreviewInput(input)}
        >
          {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {previewing
            ? "Fetching from the EPA…"
            : `Preview ${yearCount > 1 ? `${yearCount} years` : "year"} from the EPA`}
        </Button>
      </Section>

      <Section
        title="Already stored here"
        note="What is **already stored** for these years and filters, by where it came from. This is an estimate of what the EPA will send."
      >
        {coverageQuery.error ? (
          <QueryError
            error={coverageQuery.error}
            onRetry={() => void coverageQuery.refetch()}
          />
        ) : coverageQuery.isLoading && deferredInput ? (
          <InlineLoading className="py-6" title="Checking the database…" />
        ) : coverage.length === 0 ? (
          <EmptyState title="Nothing stored for these years and filters yet." />
        ) : (
          <ReportTable
            sortable
            sortKeys={coverage.map((c) => [c.year, c.records, c.importedAt])}
            head={["Year", "Stored unit-years", "Last written by"]}
            rows={coverage.map((c) => [
              c.year,
              formatNumber(c.records),
              <span key="from" title={c.datasetName ?? ""}>
                {c.source && c.importedAt
                  ? datasetOriginLabel({
                      source: c.source,
                      importedAt: c.importedAt,
                    })
                  : "Unknown dataset"}
              </span>,
            ])}
          />
        )}
      </Section>

      {previewIsCurrent && (
        <Section
          title="What the EPA sent"
          note="Each record from the EPA **compared with what is stored**. Approving saves the new and changed ones; rows that fail the checks are listed in the invalid-records report."
        >
          {previewing && !preview ? (
            <InlineLoading
              className="py-6"
              title="Asking the EPA for the records…"
            />
          ) : previewYears.length > 0 ? (
            <>
              <DiffTiles rows={previewYears}>
                <StatTile
                  label="Received"
                  value={formatNumber(sum(previewYears, "received"))}
                  subtext="Records the EPA sent"
                />
              </DiffTiles>
              {previewYears.length > 1 && (
                <ReportTable
                  sortable
                  sortKeys={previewYears.map((y) => [
                    y.year,
                    y.received,
                    y.inserted,
                    y.updated,
                    y.unchanged,
                    y.dropped,
                  ])}
                  head={[
                    "Year",
                    "Received",
                    "New",
                    "Changed",
                    "Unchanged",
                    "Dropped",
                  ]}
                  rows={previewYears.map((y) => [
                    y.year,
                    formatNumber(y.received),
                    formatNumber(y.inserted),
                    formatNumber(y.updated),
                    formatNumber(y.unchanged),
                    formatNumber(y.dropped),
                  ])}
                />
              )}
              <SegmentedControl
                value={tab}
                onChange={setTab}
                options={[
                  { value: "new", label: "New" },
                  { value: "changed", label: "Changed" },
                  { value: "unchanged", label: "Unchanged" },
                  { value: "dropped", label: "Dropped" },
                ]}
                className="w-fit"
              />
              {tab === "dropped" ? (
                droppedRows.length === 0 ? (
                  <EmptyState
                    variant="success"
                    title="Every EPA record passed the checks"
                  />
                ) : (
                  <ReportTable
                    sortable
                    head={["Year", "Row", "Kind", "Reason"]}
                    rows={droppedRows.map((d) => [
                      d.year,
                      d.rowNumber,
                      d.kind,
                      d.reason,
                    ])}
                  />
                )
              ) : previewRows.length === 0 ? (
                <EmptyState title={`No ${tab} records`} />
              ) : (
                <ReportTable
                  sortable
                  sortKeys={previewRows.map((r) => [
                    undefined,
                    r.facilityName,
                    undefined,
                    undefined,
                    undefined,
                    r.changes.length,
                  ])}
                  head={[
                    "Year",
                    "Facility",
                    "Unit",
                    `${METRICS.grossGenerationMWh.column} (API)`,
                    `${METRICS.co2MassTons.column} (API)`,
                    ...(tab === "changed" ? ["Database → API"] : []),
                  ]}
                  rows={previewRows.map((r) => [
                    r.year,
                    <span key="f" title={r.facilityName}>
                      {r.facilityName} (#{r.facilityId})
                    </span>,
                    r.unitId,
                    formatNumber(r.grossGenerationMWh),
                    formatNumber(r.co2MassTons),
                    ...(tab === "changed"
                      ? [
                          <span key="c" title={changeText(r.changes)}>
                            {changeText(r.changes)}
                          </span>,
                        ]
                      : []),
                  ])}
                />
              )}
              <p className="text-fg-muted text-sm">
                Up to 50 rows per category and year are listed; the counts above
                cover every row.
              </p>
              {!preview?.error && (
                <div className="border-edge flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                  <span className="text-fg-2 mr-auto text-sm">
                    Nothing is saved until you approve.
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewInput(null)}
                    disabled={running}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={running}
                    onClick={() => retrieve.mutate(previewInput)}
                  >
                    {running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {running
                      ? "Saving…"
                      : `Approve and save ${yearCount > 1 ? `${yearCount} years` : "year"} (${formatNumber(toSave)} new or changed)`}
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </Section>
      )}

      {retrieve.variables && (
        <Section title="Retrieval status">
          <DiffTiles rows={results} saved>
            <StatTile
              label="Status"
              value={running ? "Saving" : runError ? "Error" : "Saved"}
              valueClassName={
                running
                  ? "text-info"
                  : runError
                    ? "text-danger"
                    : "text-success"
              }
              subtext={`${results.length} of ${retrieve.variables.toYear - retrieve.variables.fromYear + 1} years saved`}
            />
          </DiffTiles>
        </Section>
      )}

      <DatasetHistory
        title="Past retrievals"
        uploads={false}
        note="**New / Updated / Unchanged** compare each retrieval with what was stored before it (— means it was imported before this was tracked). A **superseded** retrieval had all its records replaced by a later one; it is kept as history."
      />
    </PageView>
  );
}

/** `children` (a lead tile), then New / Changed / Unchanged / Dropped summed over the years, for a preview or a saved retrieval. */
function DiffTiles({
  rows,
  saved = false,
  children,
}: {
  rows: {
    inserted: number;
    updated: number;
    unchanged: number;
    dropped: number;
  }[];
  saved?: boolean;
  children: ReactNode;
}) {
  const dropped = sum(rows, "dropped");
  return (
    <KpiStrip>
      {children}
      <StatTile
        label="New"
        value={formatNumber(sum(rows, "inserted"))}
        valueClassName="text-primary"
        subtext={saved ? "Saved" : "Not saved yet"}
      />
      <StatTile
        label="Changed"
        value={formatNumber(sum(rows, "updated"))}
        valueClassName="text-warn"
        subtext={saved ? "Values updated" : "Values differ"}
      />
      <StatTile
        label="Unchanged"
        value={formatNumber(sum(rows, "unchanged"))}
        subtext={saved ? "Same as before" : "Same as stored"}
      />
      <StatTile
        label="Dropped"
        value={formatNumber(dropped)}
        valueClassName={dropped ? "text-danger" : undefined}
        subtext={
          saved
            ? "Listed in the invalid-records file on Download"
            : "Failed a check or repeated"
        }
        className="col-span-2 sm:col-span-1"
      />
    </KpiStrip>
  );
}
