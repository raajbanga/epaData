# epaData

**Explore, analyze, and predict U.S. power-plant emissions.**

epaData is a web app for the EPA's Clean Air Markets Program Data (CAMPD). It pulls annual
operating and emissions data for every U.S. power-plant unit from the EPA API or from your own
CSV and Excel files, checks it, and lets you search, map, analyze, and download it. A built-in
NOₓ model answers what-if questions, such as how a unit's emissions change with new controls or
a fuel switch.

**[Live demo →](https://epadata.vercel.app)** The hosted copy is read-only, so Retrieve and Upload
only work when you run it yourself.

![epaData home page: coverage by year, data sources, and what you can do](docs/screenshots/home.jpg)

## Features

- **Explore**: search 1,777 facilities and 57,000+ unit-years by name, any field, numeric
  ranges, or a plain-English description ("coal units in Kentucky with high CO2"). Rank the top N
  overall or per state, and compare up to four facilities or units side by side.
- **Map**: every facility on a 3D globe or a flat map, colored by fuel and sized by capacity or CO₂.
- **Retrieve and Upload**: pull data from the EPA API or import a CSV or Excel file, review what
  is new, changed, or rejected, and approve before anything is saved. Every record is checked
  against physical-sanity rules.
- **Analyze**: distributions, derived indicators (emission intensity, heat rate, capacity
  factor), correlations, group comparisons with statistical tests, and EPA TRACI 2.2 impact
  indicators.
- **Predict**: annual NOₓ models (Ridge regression and a decision tree, measured against a
  baseline), with sensitivity curves and scenarios.
- **Download**: CSV for any dataset, search, or selection. Analysis exports include the chart
  and a metadata file so results can be reproduced.

Every view lives in the URL, so any search, chart, or prediction can be reloaded or shared. See
the [feature reference](docs/features.md) for the details.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/explore.jpg" alt="Explore: Kentucky coal units in 2025, ranked by CO₂"><br><sub><b>Explore</b>: filters as chips, sortable results, CSV export</sub></td>
    <td width="50%"><img src="docs/screenshots/map.jpg" alt="Map: every facility on a globe, colored by fuel"><br><sub><b>Map</b>: every facility on a globe or flat map</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/analyze.jpg" alt="Analyze: a plain-language summary and CO₂ by year and fuel class"><br><sub><b>Analyze</b>: a plain-language reading above every chart</sub></td>
    <td><img src="docs/screenshots/models.jpg" alt="Predict: test error and R² for each NOx model"><br><sub><b>Predict</b>: each model's test error and R², with 95% intervals</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/whatif.jpg" alt="What-if: predicted NOx as heat input changes, for Ridge and the decision tree"><br><sub><b>What-if</b>: change one input and watch both models respond; shading marks inputs outside the training data</sub></td>
  </tr>
</table>

## How it works

```mermaid
flowchart LR
    EPA["EPA CAMPD API"] -- "Retrieve: preview, then save" --> W
    FILE["CSV / Excel upload"] -- "validate, then approve" --> W
    W["Shared write path<br/>diff · upsert · sanity checks"] --> DB[("SQLite")]
    DB --> UI["Explore · Map · Analyze · Predict · Download"]
    ML["Models trained offline<br/>(scikit-learn)"] -. "stored as JSON" .-> DB
```

Every write goes through one path that compares incoming rows with what's stored, so you
see what's new, changed, or rejected before approving. Records that fail a physical-sanity
check (for example, power generated with zero operating hours) are kept and flagged, not
dropped. The prediction models are trained offline in Python and stored in the database, and
the app replays them in TypeScript, so predictions are instant and need no Python on the
server. More in [docs/data.md](docs/data.md).

### Prediction results

Annual NOₓ per unit-year, tested on 2024–2025 after training on 2016–2023:

| Model                                  | Mean error (t) |   R² |
| :------------------------------------- | -------------: | ---: |
| Baseline: median by fuel and unit type |          109.4 | 0.49 |
| Ridge regression                       |           58.5 | 0.83 |
| Decision tree                          |           26.3 | 0.95 |

A simple rule, last year's NOₓ rate times this year's heat input, does better still (18.5 t),
because a unit's rate barely changes from year to year. The models earn their place in the
What-if tab, where they show how NOₓ responds to load, controls, and fuel. The full results are
in [docs/features.md](docs/features.md#prediction-results-test-years-20242025-refit-on-20162023).

## Database

Eight SQLite tables, defined with Drizzle ORM in
[`src/server/db/schema.ts`](src/server/db/schema.ts) with versioned migrations in
[`drizzle/`](drizzle). Each facility, unit, and unit-year is stored once, enforced by unique
keys, and every unit-year records the dataset that last wrote it, so you can trace each value
to an EPA sync or a file upload. Rejected and duplicate rows land in `import_issues`, and
sanity-check flags in `data_audit_logs`. The repository includes `db.sqlite`, which holds
1,777 facilities, 6,031 units, and 57,414 unit-years.

```mermaid
erDiagram
    FACILITIES ||--o{ UNITS : "houses"
    FACILITIES ||--o{ ANNUAL_RECORDS : "tracks"
    UNITS ||--o{ ANNUAL_RECORDS : "reports"
    DATASETS ||--o{ ANNUAL_RECORDS : "last wrote"
    ANNUAL_RECORDS ||--o{ DATA_AUDIT_LOGS : "flags"
    DATASETS ||--o{ IMPORT_ISSUES : "rejects"
    DATASETS ||--o{ ANNUAL_RECORDS : "superseded upload"

    FACILITIES {
        integer id PK "EPA facility ID (ORISPL)"
        text name
        text state_code
        text county
        real latitude
        real longitude
        integer epa_region
        text nerc_region
        text source_category
        text owner_operator
    }

    UNITS {
        text id PK "internal UUID"
        integer facility_id FK "unique with unit_id"
        text unit_id "EPA unit ID"
        text unit_type
        text primary_fuel
        text secondary_fuel
        text operating_status
        text commercial_op_date
        text retirement_date
        real max_hourly_hi_rate
        real nameplate_capacity_mw
        text so2_controls
        text nox_controls
        text pm_controls
        text hg_controls
        text program_code
    }

    DATASETS {
        text id PK "UUID"
        text name
        text source "API | BULK_CSV | BULK_EXCEL"
        integer reporting_year
        integer imported_at
        integer raw_record_count
        integer valid_records
        integer flagged_records
        integer inserted_records
        integer updated_records
        integer unchanged_records
        integer dropped_records
        text original_filename
        text archived_path
        text query_params "JSON, API only"
        text notes
    }

    ANNUAL_RECORDS {
        text id PK "unit_internal_id + year"
        text dataset_id FK
        text superseded_upload_id FK "upload an API sync replaced"
        integer facility_id FK
        text unit_internal_id FK "unique with year"
        integer year
        real operating_hours
        real gross_generation_mwh
        real heat_input_mmbtu
        real steam_load_klb
        real co2_mass_tons
        real so2_mass_tons
        real nox_mass_tons
        text so2_controls "as reported that year"
        text nox_controls
        text pm_controls
        text hg_controls
        text program_code
        real co2_intensity_lbs_mwh
        real heat_rate_mmbtu_mwh
    }

    IMPORT_ISSUES {
        text id PK
        text dataset_id FK
        integer row_number
        text kind "REJECTED | DUPLICATE"
        text reason
        text raw_row "JSON"
    }

    DATA_AUDIT_LOGS {
        text id PK
        text annual_record_id FK
        text flag_type
        text severity "WARN | ERROR"
        text details
        integer created_at
    }

    TRACI_FACTORS {
        integer id PK
        text traci_version
        text pollutant "co2 | so2 | nox"
        text substance
        text cas
        text medium "air"
        text impact_category
        real factor
        text factor_unit
        text source
    }

    MODELS {
        text id PK "nox-baseline | nox-ridge | nox-tree"
        text name
        text kind "baseline | ridge | tree"
        text target
        text features "JSON"
        text params "JSON"
        text train_years
        text validation_years
        text test_years
        text metrics "JSON"
        text artifact "JSON"
        text artifact_path
        text pipeline_version
        integer trained_at
    }
```

Indexes, design decisions, and the row counts per table are in [docs/data.md](docs/data.md);
every column is described in [DATABASE_BREAKDOWN.md](DATABASE_BREAKDOWN.md).

## Quick start

Requires Node.js 20.9+ and Python 3.9+.

```bash
git clone https://github.com/raajbanga/epaData.git && cd epaData
npm install
python3 -m venv epaDataVENV && epaDataVENV/bin/pip install -r requirements.txt
cp .env.example .env
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>. The database ships with the repository, so everything except the
live EPA features works right away, with no API key.

Two optional keys go in `.env`:

| Variable             | Turns on                                                                                                             |
| :------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `CAMPD_API`          | Retrieve and the hourly-to-monthly time series ([get an EPA API key](https://www.epa.gov/airmarkets/cam-api-portal)) |
| `OPENROUTER_API_KEY` | A language-model fallback for description search                                                                     |

The full list is in [docs/development.md](docs/development.md#environment-variables).

## Documentation

| Document                                       | Contents                                                                                   |
| :--------------------------------------------- | :----------------------------------------------------------------------------------------- |
| [Features](docs/features.md)                   | Every page, the data-quality rules, and how description search and prediction work         |
| [Data](docs/data.md)                           | Data sources, what's in the bundled database, the schema, and how to refresh or rebuild it |
| [Development](docs/development.md)             | Requirements, configuration, scripts, reproducing the results, and the code layout         |
| [DATABASE_BREAKDOWN.md](DATABASE_BREAKDOWN.md) | Column-by-column schema reference and which view reads which table                         |
| [samples/](samples/README.md)                  | A sample upload file and the validation report it should produce                           |
| [report/](report/README.md)                    | Project reports and slides                                                                 |

## Tech stack

| Area            | Built with                                                                           |
| :-------------- | :----------------------------------------------------------------------------------- |
| Web app         | Next.js 16, React 19, tRPC 11, TanStack Query, Tailwind CSS 4                        |
| Data            | SQLite (libSQL) with Drizzle ORM; Python for reading uploads                         |
| Charts and maps | Recharts, D3, Leaflet                                                                |
| Prediction      | scikit-learn, trained offline and replayed in TypeScript, so no Python on the server |
| Hosting         | Vercel                                                                               |

## Testing

```bash
npm run validate   # format check, lint, typecheck, unit tests, production build
npm run test:py    # model training pipeline
```

## Team

<table>
  <tr>
    <td align="center"><a href="https://github.com/raajbanga"><img src="https://github.com/raajbanga.png?size=120" width="80" alt=""><br><b>Raaj Banga</b></a><br><sub>Project Manager/Back-end Lead</sub></td>
    <td align="center"><a href="https://github.com/TheRealAxnav"><img src="https://github.com/TheRealAxnav.png?size=120" width="80" alt=""><br><b>Arnav Bawankule</b></a><br><sub>Front-end Lead</sub></td>
  </tr>
</table>

Built for CS396.

## Data and credits

- Emissions, facility, and unit data: U.S. EPA Clean Air Markets Program Data (CAMPD), public
  domain.
- Map shapes: [us-atlas](https://github.com/topojson/us-atlas) and
  [world-atlas](https://github.com/topojson/world-atlas) (ISC license), bundled in
  `public/geo/`.
- Basemap tiles: © OpenStreetMap contributors, © CARTO.
