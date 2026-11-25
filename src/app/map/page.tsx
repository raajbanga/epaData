import { type Metadata } from "next";
import { MapPage } from "~/app/_components/facilities-map";
import { parseExplorerParams, type Params } from "~/lib/facility-filters";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Map" };

export default async function Map({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const initialState = parseExplorerParams(await searchParams);
  await Promise.all([
    api.facilities.getMapFacilities.prefetch(initialState.filters),
    api.facilities.getFilterOptions.prefetch(),
  ]);
  return (
    <HydrateClient>
      <MapPage initialState={initialState} />
    </HydrateClient>
  );
}
