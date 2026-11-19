import { type Metadata } from "next";
import { AnalyzeView } from "~/app/_components/analyze/analyze-view";
import { parseAnalysisParams } from "~/lib/analysis-state";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Analyze" };

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = parseAnalysisParams(await searchParams);
  // The summary streams in after the page (pending queries are sent to the browser); the
  // catalog and filter options are quick and the controls need them.
  void api.analysis.summary.prefetch({ filters: initial.filters });
  await Promise.all([
    api.analysis.catalog.prefetch(),
    api.facilities.getFilterOptions.prefetch(),
  ]);
  return (
    <HydrateClient>
      <AnalyzeView initial={initial} />
    </HydrateClient>
  );
}
