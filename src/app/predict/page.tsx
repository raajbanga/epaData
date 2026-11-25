import { type Metadata } from "next";
import { PredictView } from "~/app/_components/predict/predict-view";
import { parsePredictParams } from "~/lib/analysis-state";
import { type Params } from "~/lib/facility-filters";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Predict" };

export default async function PredictPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const initial = parsePredictParams(await searchParams);
  await api.prediction.models.prefetch();
  return (
    <HydrateClient>
      <PredictView initial={initial} />
    </HydrateClient>
  );
}
