import { connection } from "next/server";
import { DataCoverage, DataSources } from "~/app/_components/data-coverage";
import { EpaPrimer } from "~/app/_components/epa-primer";
import { HomeTrend, PollutantList } from "~/app/_components/home-story";
import { emissionsStory } from "~/lib/emissions-story";
import { renderRich } from "~/components/ui/glossed-text";
import { LinkList } from "~/components/ui/link-list";
import { Section } from "~/components/ui/report";
import { formatNumber } from "~/lib/utils";
import { api } from "~/trpc/server";

/**
 * Where to start, asked as the questions a newcomer has. Each link opens a page already set up
 * to answer it.
 */
const QUESTIONS = [
  {
    href: "/map",
    label: "Where are the power plants?",
    body: "A map of every plant, colored by the fuel it burns.",
  },
  {
    href: "/explore?topN=10&topBy=co2MassTons&year=2025",
    label: "Which plants pollute the most?",
    body: "The 10 plants that put out the most CO₂ in 2025.",
  },
  {
    href: "/analyze",
    label: "Is pollution going up or down?",
    body: "Year-by-year totals, by state and by plant.",
  },
  {
    href: "/analyze?yearMin=2015&yearMax=2025&operatingHoursMin=0&operatingHoursMinStrict=1&tab=compare&variable=noxRate",
    label: "Do pollution controls work?",
    body: "Units with and without NOₓ-cleaning equipment, side by side.",
  },
  {
    href: "/predict?tab=whatif&scope=state&st=TX&burns=Coal",
    label: "What if a plant cleaned up?",
    body: "Predicted NOₓ if Texas coal plants added a NOₓ scrubber.",
  },
  {
    href: "/analyze?tab=impacts",
    label: "What harm does it do?",
    body: "Emissions turned into climate, acid-rain, smog, and health effects.",
  },
];

/** The pages that bring data in or take it out. */
const DATA_PAGES = [
  {
    href: "/retrieve",
    label: "Retrieve from the EPA",
    body: "Pull newer years straight from the EPA.",
  },
  {
    href: "/upload",
    label: "Upload a file",
    body: "Add a CSV or Excel file; every row is checked first.",
  },
  {
    href: "/download",
    label: "Download",
    body: "Take any of this data away as a CSV file.",
  },
];

export default async function Home() {
  await connection(); // the figures come from the database at request time, never from the build
  const [stats, { factors }] = await Promise.all([
    api.facilities.getStats(),
    api.analysis.catalog(),
  ]);
  const unitYears = stats.coverage.reduce((n, c) => n + c.records, 0);
  const years = stats.coverage.map((c) => c.year);
  const story = emissionsStory(stats.coverage);
  const figures = [
    [formatNumber(stats.totalFacilities), "power plants"],
    [formatNumber(stats.totalUnits), "generating units"],
    [formatNumber(unitYears), "unit-years"],
    [`${formatNumber(stats.totalCapacityMW / 1000, 1)} GW`, "capacity"],
    [formatNumber(stats.totalAnomalies), "data-quality flags"],
  ];
  const change = (p: NonNullable<typeof story>["pollutants"][number]) =>
    `${p.label} by ${Math.round(Math.abs(p.pct))} %`;

  return (
    <div className="space-y-16">
      <header className="space-y-4">
        <h1 className="text-fg text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.12]">
          U.S. power plant emissions
        </h1>
        {story?.pollutants.every((p) => p.pct < 0) && (
          <p className="text-fg text-xl text-pretty sm:text-2xl">
            {renderRich(
              `From ${story.from} to ${story.to}, the plants here cut ${story.pollutants
                .map((p) => `**${change(p)}**`)
                .join(", ")
                .replace(/, ([^,]*)$/, ", and $1")}.`,
            )}
          </p>
        )}
        <p className="text-fg-2 text-lg text-pretty">
          This site holds the EPA&apos;s yearly records for{" "}
          {formatNumber(stats.totalUnits)} generating units at{" "}
          {formatNumber(stats.totalFacilities)} U.S. power plants: how much fuel
          each burned, how much power it made, and how much of each pollutant
          came out. Look up a plant, see where the pollution comes from, and
          test what would happen if a plant changed.
        </p>
      </header>

      {story && (
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <HomeTrend story={story} />
          <Section title="What the three pollutants are">
            <PollutantList story={story} />
          </Section>
        </div>
      )}

      <Section title="What do you want to find out?">
        <LinkList
          items={QUESTIONS}
          large
          className="grid grid-cols-1 gap-x-10 sm:grid-cols-2 lg:grid-cols-3"
        />
      </Section>

      <section
        aria-labelledby="about-data"
        className="border-edge space-y-8 border-t pt-10"
      >
        <div className="space-y-2">
          <h2 id="about-data" className="text-fg text-lg font-semibold">
            About the data
          </h2>
          <p className="text-fg-2 text-[15px]">
            A <strong className="text-fg font-medium">unit-year</strong> is one
            generating unit&apos;s record for one year; most of this site counts
            and compares them. A plant can have several units (boilers or
            turbines).
          </p>
          <dl className="flex flex-wrap gap-x-10 gap-y-3 pt-2">
            {figures.map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="text-fg text-xl font-semibold tabular-nums">
                  {value}
                </dd>
                <dd aria-hidden className="text-fg-muted text-xs">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-3">
          <Section
            title="Years stored"
            note={
              years.length
                ? `Unit-years per reporting year, ${years[0]}–${years.at(-1)}. Hover a column for its count.`
                : undefined
            }
          >
            <DataCoverage coverage={stats.coverage} />
          </Section>

          <Section
            title="Where it comes from"
            note="Most pages read the local database. Retrieve and the hourly and daily view ask the EPA directly."
          >
            <DataSources
              sources={stats.sources}
              traci={{
                version: factors[0]?.traciVersion,
                factors: factors.length,
              }}
            />
          </Section>

          <Section title="Add or take out data">
            <LinkList items={DATA_PAGES} />
          </Section>
        </div>

        <EpaPrimer />
      </section>
    </div>
  );
}
