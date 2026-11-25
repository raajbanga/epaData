const TERMS = [
  {
    term: "ORISPL ID",
    body: "A power plant's permanent federal ID number. Every plant has one, and this site uses it to tell plants apart.",
  },
  {
    term: "NERC region",
    body: "The regional power grid a plant feeds, such as ERCOT (most of Texas) or WECC (the West).",
  },
  {
    term: "Nameplate capacity (MW)",
    body: "The most power a unit can make at once. One megawatt (MW) powers roughly 750 to 1,000 homes.",
  },
  {
    term: "CO₂ intensity (lb/MWh)",
    body: "Pounds of CO₂ for each megawatt-hour of electricity. A modern gas plant is about 800, coal about 2,100; nuclear, wind, and solar are 0.",
  },
  {
    term: "MMBtu",
    body: "Million British thermal units: the amount of heat in the fuel a unit burns. More MMBtu means more fuel burned.",
  },
  {
    term: "Data-quality checks",
    body: "Every record is checked for values that can't be right: fuel use far outside what a working plant needs for its power, power made with zero hours of running, or fuel burned with no CO₂ reported.",
  },
];

/** Glossary of the terms the tables use, collapsed by default. */
export function EpaPrimer() {
  return (
    <details className="group">
      <summary className="text-fg cursor-pointer text-base font-semibold">
        Terms used in the data
      </summary>
      <dl className="mt-3 grid grid-cols-1 gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
        {TERMS.map(({ term, body }) => (
          <div key={term}>
            <dt className="text-fg font-medium">{term}</dt>
            <dd className="text-fg-2 mt-0.5">{body}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
