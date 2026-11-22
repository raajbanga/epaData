/**
 * Every measured column of a unit-year, named once: the full label (statistics, charts, model
 * inputs), a short label (filters, chips, change descriptions), the unit, and a compact table
 * header. Each page reads its names from here, so a metric is called the same thing everywhere.
 */
export const METRICS = {
  operatingHours: {
    label: "Operating time",
    short: "Operating time",
    unit: "hr",
    column: "Op. hrs",
  },
  grossGenerationMWh: {
    label: "Gross load",
    short: "Gross load",
    unit: "MWh",
    column: "Gross MWh",
  },
  heatInputMMBtu: {
    label: "Heat input",
    short: "Heat input",
    unit: "MMBtu",
    column: "Heat MMBtu",
  },
  co2MassTons: {
    label: "CO₂ mass",
    short: "CO₂",
    unit: "short tons",
    column: "CO₂ t",
  },
  so2MassTons: {
    label: "SO₂ mass",
    short: "SO₂",
    unit: "short tons",
    column: "SO₂ t",
  },
  noxMassTons: {
    label: "NOₓ mass",
    short: "NOₓ",
    unit: "short tons",
    column: "NOₓ t",
  },
  nameplateCapacityMW: {
    label: "Nameplate capacity",
    short: "Capacity",
    unit: "MW",
    column: "MW",
  },
} as const;
