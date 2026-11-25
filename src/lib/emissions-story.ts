import { METRICS } from "./metrics";

/**
 * The home page's story: how much each pollutant changed over the years the database covers in
 * full. Thinly covered years (a few hundred records) and a year still being reported (its totals
 * well under the year before with about as many units) are left out, so a drop is a real drop.
 */

const POLLUTANTS = [
  {
    key: "so2",
    label: METRICS.so2MassTons.short,
    name: "sulfur dioxide",
    what: "Comes mostly from burning coal. It causes acid rain and fine particles that harm lungs.",
  },
  {
    key: "nox",
    label: METRICS.noxMassTons.short,
    name: "nitrogen oxides",
    what: "Forms when fuel burns very hot. It makes smog and ground-level ozone.",
  },
  {
    key: "co2",
    label: METRICS.co2MassTons.short,
    name: "carbon dioxide",
    what: "Made by burning any fossil fuel. It is the main gas warming the climate.",
  },
] as const;

type PollutantKey = (typeof POLLUTANTS)[number]["key"];
type YearTotals = { year: number; records: number } & Record<
  PollutantKey,
  number
>;

export function emissionsStory(coverage: YearTotals[]) {
  const max = Math.max(0, ...coverage.map((c) => c.records));
  let years = coverage.filter((c) => c.records >= max * 0.8);
  // A run of covered years, ending at the latest.
  for (let i = years.length - 1; i > 0; i--)
    if (years[i]!.year - years[i - 1]!.year > 1) {
      years = years.slice(i);
      break;
    }
  const last = years.at(-1);
  const prev = years.at(-2);
  const partial =
    last && prev && last.co2 < prev.co2 * 0.7 ? last.year : undefined;
  if (partial) years = years.slice(0, -1);
  const first = years[0];
  const end = years.at(-1);
  if (!first || !end || first === end) return null;
  return {
    from: first.year,
    to: end.year,
    partial,
    pollutants: POLLUTANTS.map((p) => ({
      ...p,
      first: first[p.key],
      last: end[p.key],
      /** Null when the first year had none: no percentage of zero. */
      pct: first[p.key] ? (end[p.key] / first[p.key] - 1) * 100 : null,
    })),
    /** Each year as a share of the first year's amount, 100 = the same. */
    rows: years.map((y) => ({
      x: y.year,
      ...(Object.fromEntries(
        POLLUTANTS.map((p) => [
          p.key,
          first[p.key] ? (y[p.key] / first[p.key]) * 100 : null,
        ]),
      ) as Record<PollutantKey, number | null>),
    })),
  };
}
