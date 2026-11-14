# Features

A page-by-page reference for epaData. For setup, see the [README](../README.md).

## Features

Pages are ordered by workflow in the navigation bar: **Home**,
**Explore**, **Map**, **Analyze**, **Predict**, then **Retrieve**, **Upload**, **Download**. Facility, unit, and
comparison details open in one dialog over any page; the open item is kept in the URL
(`?facility=3`, `?unit=…`), so it survives a reload and can be shared.

| Feature                         | Where to find it                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home page                       | `/`: introduction and summary figures, links to every function, unit-years per reporting year, data sources, glossary                                                                                                                                                                                                                                                                                                                                          |
| Retrieval                       | **Retrieve** page (`/retrieve`). Method: EPA CAM API, apportioned annual emissions. Filters: year range, state, facility IDs, fuel, unit type, control technology. Shows what the database already holds, previews what the API returns (New / Changed / Unchanged / Dropped, with database → API values for changed fields), then saves on approval. Past retrievals are listed with their parameters and counts. **Try** samples fill the form in one click. |
| Upload                          | **Upload** page (`/upload`). CSV or Excel (≤ 100 MB), read by `scripts/parse_import.py`. Shows the column mapping, missing values, rejected rows with reasons, duplicate facility-unit-years, sanity flags, and New/Changed/Unchanged counts. Approve or cancel. Rejected and duplicate rows are stored in `import_issues`; the original file is archived in `uploads/`. Past uploads are listed below the drop zone.                                          |
| Basic search                    | **Explore** page (`/explore`), **Facilities** and **Unit-years** tabs. Always visible: one search box (description or name), state, year, fuel, unit type, facility ID, unit ID. **Advanced**: county, NERC region, secondary fuel, SO₂/NOₓ/PM control, operating status, audit flag/severity, origin                                                                                                                                                          |
| Multi-criteria and range search | All filters combine with AND. Min/max ranges for year, operating time, gross load, heat input, CO₂, SO₂, NOₓ, each inclusive (≥/≤) or strict (>/<) via the toggle beside it (under **Advanced**, which opens by itself when one of its filters is set)                                                                                                                                                                                                         |
| Description search              | The Explore search box. A sentence such as "coal units in Kentucky with high CO2" becomes ordinary filters, shown as removable **Interpreted as** chips; text with nothing recognizable falls back to a name search. See [Description search](#description-search).                                                                                                                                                                                            |
| Ranking and comparison          | **Ranking**: sort by any metric, keep the first N, overall or per state (`ROW_NUMBER() OVER (PARTITION BY state)`). **Compare**: tick 2–4 facilities or units, then **Compare** in the dock. **History**: the unit details list every reporting year.                                                                                                                                                                                                          |
| Search results                  | Sortable, paginated tables; every row opens its details; **Download all** exports the current search; the tab, filters, sort, and page live in the URL                                                                                                                                                                                                                                                                                                         |
| Facility and unit details       | One detail dialog (`?facility=` / `?unit=`): identification, operating data and emissions per year, fuels and controls, source dataset and origin per year, audit flags. Facilities also have a granular time series (hourly to yearly, live API).                                                                                                                                                                                                             |
| Download                        | **Download** page (`/download`): complete dataset, valid records, invalid-record report, search results, selected facilities/units, provenance. CSV only.                                                                                                                                                                                                                                                                                                      |
| Data quality                    | **Audit flags** tab on Explore: every physical-sanity flag, paginated, sortable, and filtered by the same search form; each row links to its unit                                                                                                                                                                                                                                                                                                              |
| Map                             | **Map** page (`/map`): D3 globe and Leaflet map of all facilities with the Explore filters; DB-vs-API source labels throughout                                                                                                                                                                                                                                                                                                                                 |

### Physical-sanity rules

Applied to every annual record written by a retrieval, an upload, or the CLI sync
(`AUDIT_THRESHOLDS` in `src/lib/emissions-metrics.ts`). Flagged records are stored, not
dropped, and appear in the Audit flags tab and the invalid-record report.

| Flag                       | Severity | Condition                                          |
| :------------------------- | :------- | :------------------------------------------------- |
| `ZERO_EMISSIONS_HIGH_HEAT` | ERROR    | heat input > 1,000 MMBtu and CO₂ reported as 0     |
| `CO2_NOT_REPORTED`         | WARN     | heat input > 1,000 MMBtu and no CO₂ value reported |
| `PHANTOM_GENERATION`       | ERROR    | gross load > 0 MWh and operating time reported 0 h |
| `EXTREME_HEAT_RATE`        | WARN     | heat input ÷ gross load < 5 or > 25 MMBtu/MWh      |

Metrics the source leaves blank are stored as `NULL` ("not reported"), not 0, so the rules
can tell a missing value from a reported zero. Derived values stored with each record: CO₂
intensity = CO₂ (short tons) × 2,000 ÷ gross load (lb/MWh), and heat rate = heat input ÷
gross load (MMBtu/MWh); both are `NULL` when an input is missing or gross load is 0.

### Description search

`src/lib/describe-search.ts` turns a sentence into filters without a language model:

1. It matches the longest known phrase at each position against a vocabulary built from the
   database's own filter values (states, fuels, unit types, controls, counties) plus synonyms
   ("scrubber" → SO₂ control, "gas" → Natural Gas, state names → codes). Two-letter state codes
   count only in capitals, so "in" and "or" stay English.
2. It binds numbers to metrics ("CO2 over 500k tons", "under 50 tons SO2", "between 2015 and
   2020") and reads ranking words ("top 10", "lowest", "in each state").
3. "High" and "low" become thresholds: the 75th or 25th percentile of that metric among the
   unit-years that match the other filters, rounded to three significant figures.
4. Words it could not use are listed as "Not understood". If `OPENROUTER_API_KEY` is set,
   only those leftover words are sent to an OpenRouter model, which may add filters chosen
   from the same vocabulary. Its output is validated before use. Without a key, the parser's
   result is used as is.

The result is applied to the normal filter controls, so it can be refined by hand, exported,
and shared by URL like any other search.

## Analysis and prediction

Two pages, **Analyze** and **Predict**, sit between Map and Retrieve in the navigation. Both
keep every choice in the URL, so a view can be reloaded or shared.

| Feature                    | Where to find it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| :------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytical dataset builder | **Analyze** (`/analyze`): the Explore filters, as chips with "+ Filter", (year range, state, facility, unit, fuel, unit type, controls, program, operating-time and load ranges) choose the unit-years. **Overview** tab: unit-years, facilities, units, and years selected; trend, state map, and ranking of one variable; a collapsed data-quality section with every variable's definition and missing count, why values are missing (units that didn't run, NOₓ-only programs without CO₂, steam-only units without MWh, no previous year), and the grouping fields. Unit-years with 0 operating hours are left out by default (a removable chip). One search box with suggestions (name, operator, county, ID, or a description) on every page |
| Descriptive statistics     | **Distribution** tab: histogram or box plot first, then count, missing, min, max, mean, median, SD, Q1, Q3, IQR, P5/P10/P90/P95, overall and per group (state, fuel class, fuel, unit type, NOₓ or SO₂ control class, year, facility, unit); unusual observations beyond Tukey's far-out fences                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Derived indicators         | CO₂, SO₂, NOₓ intensity (lb/MWh), NOₓ rate (lb/MMBtu), heat rate, capacity factor, year-over-year change in tons and %. Missing when an input is missing or a denominator is 0; groups pool rates as Σ numerator ÷ Σ denominator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Interactive visualization  | Recharts charts (D3 for the state map and heat map) on the tab whose question they answer: trend, state map, and rankings (**Overview**); histograms and box plots (**Distribution**); scatter and correlation heat map, Pearson or Spearman (**Relationships**); bars per group (**Compare groups**). Each tab opens with a plain-language reading; tooltips, PNG export, and data download on every chart; drag to zoom on scatter and line charts; jargon defined on hover                                                                                                                                                                                                                                                                       |
| Comparative analysis       | **Compare groups** tab: bars for every group, then two to eight groups along any grouping field (facilities or units by search, states, fuels, with vs without SCR, 2015 vs 2024, …): pooled values, ranks, differences, 95 % CIs, Welch t, Mann–Whitney U, ANOVA, Kruskal–Wallis, and a plain-language reading                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| TRACI impact indicators    | **TRACI impacts** tab: global warming, acidification, particulate human health, and smog formation, each in its own unit, total or per MWh, by any grouping field; the factors and formulas are shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Prediction                 | **Predict** → **Models**: annual NOₓ per unit-year; median baseline, Ridge regression, decision tree; tune on 2016–21 / 2022–23, refit on 2016–23, test 2024–25; MAE, RMSE, R², MAPE with 95 % intervals; error and R² charts; predicted vs actual; average error by fuel; importances; the persistence reference; every test prediction as a download                                                                                                                                                                                                                                                                                                                                                                                              |
| Sensitivity and scenarios  | **Predict** → **What-if**: a baseline unit-year with each model's prediction; Ridge, tree, or both. Sensitivity: one numeric input varied from a minimum to a maximum (in its own unit or as % of the baseline), with the baseline marked and the region outside the training data shaded, or one category (fuel, unit type, a control) as bars. Scenarios on the same page: load +10 %, heat input −5 %, add SCR, fuel switch, high efficiency, with range warnings, tooltips listing the changed inputs, and the TRACI impacts of each predicted NOₓ. A unit's details on Explore link here                                                                                                                                                       |
| Saving and exporting       | Every chart and result table downloads a ZIP: CSV, `metadata.json` (date, software commit, database snapshot, filters, definitions, TRACI factors, model and split), and the chart PNG. **Download all** on Analyze exports every selected unit-year with all variables                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Prediction results (test years 2024–2025, refit on 2016–2023)

| Model                                  | MAE (t) | MAE 95 % interval | RMSE (t) |    R² | MAPE    |
| :------------------------------------- | ------: | :---------------- | -------: | ----: | :------ |
| Baseline: median by fuel and unit type |   109.4 | 99.3–121.0        |    366.9 | 0.489 | 143.6 % |
| Ridge regression (log target)          |    58.5 | 52.7–64.9         |    213.5 | 0.827 | 49.3 %  |
| Decision tree (depth ≤ 20, leaf ≥ 20)  |    26.3 | 23.4–29.7         |    113.9 | 0.951 | 20.9 %  |
| _Persistence (reference, not served)_  |    18.5 | 16.1–21.2         |     92.8 | 0.967 | 15.3 %  |

Intervals come from a cluster bootstrap over test units (1,000 samples). Without same-year heat
input, gross load, and operating time, validation R² falls to 0.70 (Ridge) and 0.84 (tree): the
rest comes from unit attributes, controls, and the previous year's NOₓ rate.

**Persistence beats both models.** Last year's NOₓ rate × this year's heat input (the median
baseline where either is missing) has a lower test error than the tree, by 7.8 t (6.3–9.4). A
unit's rate barely changes from year to year, and three reformulations that build this product
into the models did not close the gap (`ml/reformulations.py`, report §Q4). The models'
value is their response to load, controls, and fuel in the What-if tab, not a better forecast.
Full metrics, including persistence, are in `ml/models/metrics.json`.

### How prediction works without Python on the server

`ml/train.py` (pandas, scikit-learn) trains the models offline and stores each one in the
`models` table with its preprocessing (medians, log flags, scaling, categories) and
parameters (Ridge coefficients or the tree's node arrays) as JSON. `src/lib/model.ts`
replays them in TypeScript, so predictions, sensitivity curves, and scenarios are instant and
also work on the read-only Vercel build. `src/lib/model.test.ts` checks that it reproduces
scikit-learn's predictions on 200 test rows (`ml/fixtures/parity.json`) to 10⁻⁶.

```bash
npm run ml:train      # retrain and re-register the models (needs the Python venv)
npm run test:py       # pytest for the training pipeline
epaDataVENV/bin/python ml/reformulations.py   # the persistence comparison (writes nothing)
npm run traci:import  # reload the TRACI factors from data/traci
```
