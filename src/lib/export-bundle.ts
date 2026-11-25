import { strToU8, zipSync } from "fflate";

import type { VariableInfo } from "~/lib/analysis";
import { toCsv, type CsvColumn, type CsvValue } from "~/lib/csv";
import type { TraciFactor } from "~/lib/traci";

/**
 * Exports: every analysis download is a ZIP of the data as CSV, a metadata.json that
 * makes it reproducible (when, from which data, with which filters, definitions, factors, and
 * model), and the chart image when there is one.
 */

/** What every export from a page shares; tabs add their own fields (variables, model, …). */
export type ExportMetadata = Record<string, unknown>;

export interface ExportTable {
  head: readonly string[];
  rows: readonly CsvValue[][];
}

/** Which data an export came from: the app version and the state of the database. */
export interface Provenance {
  software: { name: string; version: string; commit: string };
  database: {
    unitYears: number;
    datasets: number;
    lastImport: Date | string | null;
  };
}

/** A registered model as the `models` table stores it (the fields an export reports). */
export interface ModelRecord {
  id: string;
  name: string;
  target: string;
  features: string[];
  params: Record<string, unknown>;
  trainYears: string;
  validationYears: string;
  fitYears: string;
  testYears: string;
  metrics: Record<string, Record<string, number>>;
  artifactPath: string;
  pipelineVersion: string;
  trainedAt: Date | string;
}

/** A model in an export's metadata: name, inputs, settings, periods, scores, and versions. */
export const modelMetadata = (m: ModelRecord) => ({
  id: m.id,
  name: m.name,
  target: m.target,
  features: m.features,
  settings: m.params,
  fitYears: m.fitYears,
  tuningTrainYears: m.trainYears,
  tuningValidationYears: m.validationYears,
  testYears: m.testYears,
  metrics: m.metrics,
  savedModel: m.artifactPath,
  pipeline: m.pipelineVersion,
  trainedAt: m.trainedAt,
});

/** The Analyze page's shared metadata: the data, the filters (each one set, and each removed default as empty), and the view. */
export const analyzeMetadata = (
  source: Provenance | undefined,
  filters: Record<string, string>,
  view: object,
): ExportMetadata => ({ page: "Analyze", ...source, filters, view });

/** The Predict page's shared metadata: the data, the view, and the models it shows. */
export const predictMetadata = (
  source: Provenance | undefined,
  view: object,
  models: ModelRecord[],
): ExportMetadata => ({
  page: "Predict",
  ...source,
  view,
  models: models.map(modelMetadata),
});

/** The full analytical dataset's metadata (Analyze's "Download all"). */
export const datasetMetadata = ({
  source,
  filters,
  unitYears,
  variables,
  factors,
}: {
  source: Provenance;
  filters: Record<string, string>;
  unitYears: number;
  variables: VariableInfo[];
  factors: TraciFactor[];
}): ExportMetadata => ({
  title: "Analytical dataset",
  page: "Analyze",
  exportedAt: new Date().toISOString(),
  ...source,
  filters,
  unitYears,
  variables,
  traciFactors: factors,
  missingValues:
    "Blank cells are missing: not reported, or undefined (an input missing or a zero denominator). Never read them as 0.",
});

const tableCsv = ({ head, rows }: ExportTable) =>
  toCsv(
    rows,
    head.map((h, i): CsvColumn<readonly CsvValue[]> => [h, (r) => r[i]]),
  );

/** ZIP bytes of `<name>.csv`, metadata.json, and an optional `<name>.png`. */
export function zipBundle(
  name: string,
  table: ExportTable,
  metadata: ExportMetadata,
  png?: Uint8Array,
) {
  return zipSync({
    [`${name}.csv`]: strToU8(tableCsv(table)),
    "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
    ...(png ? { [`${name}.png`]: png } : {}),
  });
}

/** A download's metadata: the page's, plus when and from where it was saved, and its files. */
export const downloadMetadata = (
  name: string,
  metadata: ExportMetadata,
  url: string,
  hasPng: boolean,
  now = new Date(),
): ExportMetadata => ({
  ...metadata,
  exportedAt: now.toISOString(),
  url,
  files: [`${name}.csv`, ...(hasPng ? [`${name}.png`] : [])],
});

/** Builds the bundle in the browser and saves it as `<name>.zip`. */
export function downloadBundle(
  name: string,
  table: ExportTable,
  metadata: ExportMetadata,
  png?: Uint8Array,
) {
  const bytes = zipBundle(
    name,
    table,
    downloadMetadata(name, metadata, window.location.href, Boolean(png)),
    png,
  );
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/zip" }),
  );
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${name}.zip`,
  });
  a.click();
  // Revoking right after click() can cancel the download in Safari, which starts it
  // asynchronously; give it time to read the blob first.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
