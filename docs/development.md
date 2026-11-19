# Development

Everything beyond the [quick start](../README.md#quick-start): requirements, configuration, scripts, and how the code is organized.

## Requirements

Tested on macOS with Node.js 26 and Python 3.15. Linux works the same way. On Windows, use WSL,
or install `openpyxl` into the `python3` on your PATH (the server only looks for a virtual
environment at `epaDataVENV/bin/python3`).

- Node.js 20.9 or newer, with npm
- Python 3.9 or newer (reads uploaded files; model training uses pandas and scikit-learn,
  the committed models were trained with Python 3.15 and scikit-learn 1.9). Python 3.9 also
  reproduces the committed results; NumPy 2.0 may print harmless matrix-product warnings on macOS.
- Optional: an EPA API key ([api.data.gov signup](https://www.epa.gov/airmarkets/cam-api-portal))
  for Retrieve, `npm run sync:campd`, and the granular time series. Everything else works
  without it.

## Environment variables

Defined and validated in `src/env.js`; `.env.example` lists them all. Only `DATABASE_URL` is
required. Keys are read on the server only and never sent to the browser.

| Variable                | Required | Purpose                                                                                                                 |
| :---------------------- | :------- | :---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | yes      | `file:./db.sqlite` (relative paths resolve from the project folder). A value already set in your shell wins over `.env` |
| `DATABASE_AUTH_TOKEN`   | no       | Only for a remote libSQL/Turso database; leave empty                                                                    |
| `CAMPD_API`             | no       | EPA API key, sent as the `x-api-key` header. Enables Retrieve, `sync:campd`, and the granular time series               |
| `OPENROUTER_API_KEY`    | no       | Enables the language-model fallback in description search                                                               |
| `OPENROUTER_MODEL`      | no       | OpenRouter model ID; default `nvidia/nemotron-3-super-120b-a12b:free`                                                   |
| `NEXT_PUBLIC_CARTO_API` | no       | CARTO basemap key for the flat map: light or dark tiles to match the theme. Without it, public dark tiles               |
| `READ_ONLY`             | no       | `true` on a hosted build (Vercel): Upload and Retrieve show a "run it locally" notice and refuse writes                 |

## Reproducing the results

With the committed `db.sqlite` and `npm run dev` running, each link opens Explore in a
known state (the URL holds the whole search). The counts below were checked against
hand-written SQL.

| Check                                                | Link                                                                                                                                                                                                | Expected                                                                                   |
| :--------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| Multi-criteria: KY, coal, 2025, CO₂ ≥ 500,000 t      | [`/explore?tab=units&stateCode=KY&primaryFuel=Coal&year=2025&co2MassTonsMin=500000`](http://localhost:3000/explore?tab=units&stateCode=KY&primaryFuel=Coal&year=2025&co2MassTonsMin=500000)         | 25 unit-years                                                                              |
| Same search, facility level                          | [`/explore?stateCode=KY&primaryFuel=Coal&year=2025&co2MassTonsMin=500000`](http://localhost:3000/explore?stateCode=KY&primaryFuel=Coal&year=2025&co2MassTonsMin=500000)                             | 8 facilities                                                                               |
| Group-and-rank: top CO₂ facility in each state, 2024 | [`/explore?year=2024&topN=1&rankGroup=state&sort=co2&dir=desc`](http://localhost:3000/explore?year=2024&topN=1&rankGroup=state&sort=co2&dir=desc)                                                   | 51 facilities, one per state with 2024 data                                                |
| Historical: one unit, 2015–2025                      | [`/explore?tab=units&facilityId=3&unitId=1&yearMin=2015&yearMax=2025&sort=year&dir=asc`](http://localhost:3000/explore?tab=units&facilityId=3&unitId=1&yearMin=2015&yearMax=2025&sort=year&dir=asc) | 11 rows (Barry unit 1)                                                                     |
| Description search                                   | Explore → type "coal units in Kentucky with high CO2" → **Search** (or click it under **Try**)                                                                                                      | KY · Coal · CO₂ ≥ 2,730,000 (top 25 %), sorted by CO₂, 148 unit-years                      |
| Retired units                                        | [`/explore?tab=units&operatingStatus=Retired`](http://localhost:3000/explore?tab=units&operatingStatus=Retired)                                                                                     | 761 unit-years (any status containing "Retired", such as `Operating (Retired 06/30/2015)`) |
| Sample upload                                        | **Upload** → `samples/annual-emissions-sample.csv`                                                                                                                                                  | 25 rows: 21 valid (19 new, 1 changed, 1 unchanged), 3 rejected, 1 duplicate, 1 sanity flag |

The **Download all** button next to the results downloads exactly the rows the table shows (all pages).

Uploading the sample or approving a retrieval changes `db.sqlite`. Restore the committed copy
with `git restore db.sqlite`, then the numbers above apply again.

## Scripts

| Command                       | What it does                                                                                                                                                                                   |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Development server on port 3000                                                                                                                                                                |
| `npm run build` / `npm start` | Production build and server                                                                                                                                                                    |
| `npm run validate`            | Format check, lint, typecheck, tests, build                                                                                                                                                    |
| `npm test`                    | Unit tests in `src/lib/*.test.ts` (description parser, CSV writer, upload report, record diff, domain helpers, statistics, analysis variables, model parity and What-if math, export metadata) |
| `npm run test:py`             | pytest for the training pipeline                                                                                                                                                               |
| `npm run check`               | ESLint and `tsc --noEmit`                                                                                                                                                                      |
| `npm run db:migrate`          | Apply migrations in `drizzle/` to `DATABASE_URL`                                                                                                                                               |
| `npm run db:generate`         | Create a migration after a schema change                                                                                                                                                       |
| `npm run db:seed`             | Load facilities and units from CAMPD facility CSV files                                                                                                                                        |
| `npm run db:rebuild`          | Rebuild the database from facility CSVs and daily-emissions files                                                                                                                              |
| `npm run sync:campd`          | Fetch annual emissions from the EPA API and store them                                                                                                                                         |
| `npm run traci:import`        | Reload the TRACI factors from `data/traci`                                                                                                                                                     |
| `npm run ml:train`            | Retrain and re-register the prediction models (needs the Python venv)                                                                                                                          |
| `npm run report`              | Build the Phase 2 report with Tectonic (`report/phase2/phase2-report.pdf`); `report:phase1` for Phase 1                                                                                        |

## Technology

A TypeScript web stack on top of SQLite, with Python for file processing and model training:

| Layer           | Built with                                                                       | Role                                                                 |
| :-------------- | :------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| Server          | Next.js 16 route handlers (`/api/upload`, `/api/export`) and tRPC v11 procedures | Server endpoints; tRPC gives the browser typed calls for every query |
| Pages           | React 19 components, rendered on the server first                                | Pages and dialogs                                                    |
| Data access     | Drizzle ORM with drizzle-kit migrations                                          | Schema, typed queries, migrations                                    |
| Database        | SQLite through the libSQL client                                                 | Storage                                                              |
| File processing | `scripts/parse_import.py` (csv, openpyxl)                                        | Reads and validates every upload                                     |
| Styling         | Tailwind CSS v4                                                                  | Styling, light and dark themes                                       |

Analysis and prediction use Recharts (charts; D3 draws the state map and heat map), pandas, NumPy, scikit-learn, and joblib (offline
model training in `ml/`), SciPy (reference values for the statistics tests), pytest, and fflate
(export ZIPs). Statistics and TRACI calculations run in TypeScript on the server
(`src/lib/stats.ts`, `src/lib/analysis.ts`), checked against SciPy and hand calculations.

Other libraries: TanStack Query (client caching), Zod (input validation on every endpoint),
Leaflet with CARTO/OpenStreetMap tiles (2D map), D3 and TopoJSON (globe), lucide-react
(icons), node:test with tsx (unit tests), ESLint and Prettier.

## Repository layout

| Path                                                                            | Contents                                                                                                                                                                                                                                                                     |
| :------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/*/page.tsx`, `src/app/_components/`                                    | The eight pages (`/`, `/explore`, `/map`, `/analyze`, `/predict`, `/retrieve`, `/upload`, `/download`) and their views, with the analysis and prediction tabs in `analyze/` and `predict/`; `app-shell.tsx` holds the navigation, the detail dialog, and the comparison dock |
| `src/app/api/`                                                                  | Route handlers: tRPC endpoint, `upload` (preview and commit), `export` (CSV downloads)                                                                                                                                                                                       |
| `src/components/ui/`                                                            | Shared UI primitives (page layout, buttons, dialog, tables, badges, report sections)                                                                                                                                                                                         |
| `src/server/api/routers/`                                                       | tRPC routers: `facilities` (search, details, retrieval mutation), `analysis`, `prediction`                                                                                                                                                                                   |
| `src/server/db/`                                                                | Drizzle schema and database client                                                                                                                                                                                                                                           |
| `src/server/campd/client.ts`                                                    | EPA API client: retrieval, preview, granular time series                                                                                                                                                                                                                     |
| `src/server/ingest.ts`                                                          | Shared write path: diff against stored records, upserts, sanity audits                                                                                                                                                                                                       |
| `src/server/data-import.ts`, `src/server/export.ts`, `src/server/llm-search.ts` | Upload, CSV export, optional OpenRouter fallback                                                                                                                                                                                                                             |
| `src/server/analysis.ts`, `src/server/prediction.ts`                            | Analysis queries, registered models, predictions                                                                                                                                                                                                                             |
| `src/lib/`                                                                      | Pure logic with tests: filters and URL state, description parser, emissions math, record diff, CSV writer, statistics, analysis variables and TRACI, model inference                                                                                                         |
| `scripts/`                                                                      | CLI entry points (`migrate`, `seed-facilities-from-csv`, `rebuild-db`, `sync_campd`, `import_traci`) and the Python helpers `parse_import.py` and `daily_to_annual.py`                                                                                                       |
| `ml/`                                                                           | Offline training (`train.py`), its tests, the saved models and metrics, the parity fixture, and the persistence comparison (`reformulations.py`)                                                                                                                             |
| `data/traci/`                                                                   | The TRACI 2.2 factor extract and its source                                                                                                                                                                                                                                  |
| `drizzle/`                                                                      | SQL migrations                                                                                                                                                                                                                                                               |
| `samples/`                                                                      | Sample upload files and their expected results                                                                                                                                                                                                                               |
| `report/`                                                                       | Reports and slides, one folder per phase (`phase1/`, `phase2/`), plus the `shared/` LaTeX preamble and bibliography; see `report/README.md`                                                                                                                                  |
| `uploads/`                                                                      | Archived original upload files (not committed)                                                                                                                                                                                                                               |
