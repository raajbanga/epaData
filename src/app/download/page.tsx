import { type Metadata } from "next";
import { DownloadView } from "~/app/_components/download-view";
import { parseExplorerParams, type Params } from "~/lib/facility-filters";

export const metadata: Metadata = { title: "Download" };

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return (
    <DownloadView initialState={parseExplorerParams(await searchParams)} />
  );
}
