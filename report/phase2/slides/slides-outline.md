# epaData presentation notes

Notes for [`epaData-slides.pptx`](epaData-slides.pptx) ([PDF](epaData-slides.pdf)), built by
[`build-slides.cjs`](build-slides.cjs). The slides carry the headline. These notes carry the detail
behind each one: why it's built that way, the numbers, and the answers to follow-up questions. Read
them before presenting; glance at them while presenting. Each slide's speaker notes are generated
from its section here, so the two always match.

- **Timing:** about 14:30 in total.
  - Slides before the demo: about 6:55.
  - The demo: about 5:40.
  - Slides after the demo: about 1:55.
  - If time is short, skip slide 15 (the main bugs). That saves about 0:35.
- **Speakers, by role:**

  | Speaker | Slides | Time |
  |---|---|---|
  | Raaj (back end, data, and models) | 1, 3–9, 12, 15, 16: intro, what Phase 2 added, the new tables, the analysis query, stored results, TRACI, the data split, the models, demo steps 5–6, and the main bugs | about 8:45 |
  | Arnav (front end) | 2, 10, 11, 13, 14, 16: the questions, demo steps 1–4 and 7–8 (the Analyze and Predict pages), and limitations | about 5:50 |

- **Numbers** assume a fresh `db.sqlite`, the committed models, and the demo run in order. The
  page rounds (45.4K, 1.64B); these notes give the exact figures.

## Before the demo (not timed)

1. Run `git restore db.sqlite` to undo any changes from rehearsals.
2. Start the production server: `npm run build && npm start`. `npm run dev` adds loading delays.
3. Open <http://localhost:3000> and visit Analyze (all five tabs) and Predict (Models and What-if)
   once.
4. Check the network: the map tiles and web fonts load from the internet. Nothing in the demo
   needs the map.
5. Use Chrome, zoomed to about 110 %, in a second window next to the deck.

## Introduction

### 1. Title — Raaj (0:20)

- epaData stores the EPA's yearly emissions records for U.S. power plants. Phase 1 built that
  database: retrieval, uploads, validation, and search.
- This talk is about Phase 2: what we added to answer questions with it.
  - an analysis layer over the database, with statistics and charts
  - the EPA's TRACI impact factors
  - models that predict a unit's NOₓ and answer what-if questions
  - stored results, so every page loads in a fraction of a second.
- Order of the talk:
  - the questions
  - what Phase 2 added to the database, and how it reads it
  - the models
  - a live demo
  - what the results don't show.

### 2. Four questions, one database — Arnav (0:40)

- Phase 1 could list the Kentucky coal units over 500,000 tons of CO₂. It couldn't say why
  emissions are falling, or what a unit would emit with a pollution control.
- **The four questions**, each answered live in the demo:
  - Q1: how did emissions change from 2015 to 2025, and how much of that is coal giving way to gas?
  - Q2: how much lower is the NOₓ rate of units with SCR, a catalytic NOₓ control?
  - Q3: which states contribute most to each TRACI impact category?
  - Q4: how well can we predict a unit's NOₓ, and how does it respond to changes?
- **The data:** 57,414 unit-years from 6,031 units at 1,777 plants, all from Phase 1's tables.
  - A unit-year is one generating unit's record for one year.
  - By default the analysis uses 45,441 of them: the complete years 2015–2025, units that ran.
- **Who it's for:** people who know the subject but not statistics software. Every chart opens
  with a plain sentence saying what it shows.

## What Phase 2 added

### 3. What Phase 2 added — Raaj (0:45)

- **Kept from Phase 1, unchanged:** the core tables (facilities, units, annual records, datasets,
  audit flags), their indexes, the one-transaction import, and the read-only host on Vercel.
  Phase 2 reads those tables; it doesn't change them.
- **Added in Phase 2** (blue on the slide):
  - **An analysis layer** on the server: one query per selection, then 29 variables, the
    statistics, TRACI, and the models, computed in TypeScript. The browser gets results, never
    rows.
  - **Three new tables:** `traci_factors`, `models`, and `result_cache` (next slide).
  - **Offline scripts** that fill them: `ml/train.py` trains and stores the models,
    `scripts/import_traci.ts` loads the factors, and `npm run db:precompute` refreshes the stored
    results.
  - **Analyze and Predict pages**, and exports with full provenance.
- Everything still lives in the one SQLite file, so the hosted copy works with no other service.

### 4. Three new tables — Raaj (0:50)

- **`traci_factors`** (6 rows): one row per pollutant and impact category.
  - Unique on (TRACI version, pollutant, medium, category), so a factor can't be loaded twice.
  - `source` records the workbook, sheet, and column each factor came from; `cas` and `substance`
    record exactly which TRACI substance it is.
  - Factors are data, not code: a new TRACI version is new rows, not a code change.
- **`models`** (3 rows): one row per trained model.
  - `artifact` holds the whole model as JSON: preprocessing plus coefficients or the tree.
  - Train, validation, and test years, metrics, and `pipeline_version` (git commit and
    scikit-learn version) make each model reproducible.
  - The app predicts from the JSON in TypeScript, so What-if needs no Python server.
- **`result_cache`** (90 rows, 3.8 MB): one finished result per question.
  - The key is the procedure plus its input as JSON with sorted keys, so equal questions get equal
    keys.
  - `data_version` is the newest import time. Every import changes it, so old results are never
    served.
- Each table is written by one script and read by the app, so the read-only host never writes.

### 5. One query per selection — Raaj (0:50)

- **One join** loads a selection: annual records with their unit and plant, plus a self-join to
  the same unit's previous year.
  - The previous year gives the 8 year-over-year variables (change in CO₂, NOₓ, and so on).
  - The WHERE clause is built by the same code as Explore's, so every filter, and Top N, means
    the same thing on every page.
- **Phase 1's indexes made it fast,** chosen by reading SQLite's `EXPLAIN QUERY PLAN`:
  - the year range uses the (year, CO₂) index
  - the previous-year join uses the unique (unit, year) index, Phase 1's rule against duplicate
    records.
  - Without that index the join took 33 s for the default selection; with it, 50 ms. Measured
    with `sqlite3`'s timer on a copy with the index dropped.
- **Read once:** each Analyze tab asks for several results about the same selection, so the rows
  are kept in memory for 5 minutes per (filters, data version), and every result is computed from
  that copy.
  - **The bug:** our first cache stored the query itself. Drizzle queries are lazy, so each use
    ran it again: 1.5 s per view. Storing the finished rows: under 1 ms.

### 6. Store the result in the database — Raaj (0:55)

- **Why the row cache wasn't enough:** on Vercel each server instance starts empty, so Analyze
  took about 4.4 s on almost every visit.
- **So results are stored in `result_cache`.** A lookup tries memory, then the table, then
  computes and stores.
- **Never stale:** each result carries the data version, and every import changes it.
- **Shipping it:** `npm run db:precompute` recomputes every stored input for the current data,
  and the committed file carries the results to the read-only host.
- **Result:** a stored result reads in about 8 ms instead of about 1,100 ms. Every page now shows
  in 0.1–0.25 s on a production build.
- **The browser gets results, not rows:** a chart receives its numbers, not 45,000 records. Bar
  charts arrive as HTML from the server; scatter plots draw on one canvas (Predict went from about
  9,700 page elements to about 680).

## Impacts and models

### 7. Six TRACI factors, read from a table — Raaj (1:00)

- **What TRACI is:** the EPA's method for turning emissions into potential impacts. CAMPD gives
  the inventory (tons of each pollutant); TRACI gives the factor (what one kilogram contributes to
  a category).
- **Which factors, and why:**
  - CAMPD measures only three pollutants to air: CO₂, SO₂, and NOₓ. So we took every non-empty
    TRACI 2.2 air factor for those three: six factors in four categories.
  - CO₂ has only a warming factor. SO₂ has no smog factor. The workbook has no eutrophication
    column.
  - Matched by exact substance name, never by a similar one. CAMPD reports NOₓ, so we use TRACI's
    NITROGEN OXIDES row (smog 24.79), not NITROGEN DIOXIDE (16.85).
- **Where they live:** `data/traci/traci_2_2_air.csv`, pinned to the EPA workbook download
  (`traci_2_2.xlsx`, by SHA-256), loaded into `traci_factors` by `npm run traci:import`. Each row
  stores the sheet and column it came from.
- **How they connect to our data:**
  - The three mass columns in `annual_records` are short tons, so each is × 907.18474 kg/ton,
    × its factor, and summed within one category.
  - The 8 TRACI variables (4 totals, 4 per MWh of gross load) are built from the table's rows when
    the server starts. No factor is written in the code, so a new TRACI version is new rows.
  - A category is missing when any pollutant in it is missing, never 0. Categories have different
    units, so they're never added together.
- Potential impacts for comparison, not measured harm; the page says so.

### 8. Splitting the data by year — Raaj (0:50)

- **The rows:** every unit-year from 2016 to 2025 with a reported NOₓ mass.
  - 2016 is the first year with a previous year in the CAMPD data, and last year's NOₓ rate is an
    input.
  - 2026 isn't finished, so it's left out.
- **The split, by year:** train 2016–2021 (25,116 unit-years), validate 2022–2023 (7,970), test
  2024–2025 (7,755). Roughly 60 / 20 / 20.
- **Why by year, not at random:** a unit's records barely change from one year to the next. A
  random split would train on a unit's 2025 and test on its 2024, and the scores would look better
  than the models really are. The real question is a year the model hasn't seen.
- **Why two years each:** about 7,800 unit-years in each, enough for stable errors, and more than
  one year's conditions.
- **The three steps:**
  1. Tune: fit on 2016–2021 and pick each model's settings by its error on 2022–2023.
  2. Refit the chosen settings on 2016–2023, so the final models learn from the newest years too.
  3. Score once on 2024–2025. Nothing is tuned after that.
- **Intervals:** the 95 % intervals on the test scores come from 1,000 resamples of whole units,
  because a unit's two test years aren't independent.

### 9. Three models, chosen on the validation years — Raaj (0:50)

- **Target:** a unit's NOₓ for the year, in short tons. NOₓ depends on controls, so "add SCR"
  means something; CO₂ is nearly a fixed multiple of fuel burned.
- **Inputs:** this year's heat input, gross load, and hours; the unit's capacity, age, fuel, type,
  and five control flags; last year's NOₓ rate and hours.
  - No leakage: nothing is this year's NOₓ or computed from it.
- **The search,** scored by mean absolute error on 2022–23:
  - Ridge regression on log tons, strength 0.01 to 100: 10 won (57.9 t).
  - Decision tree, depth 4 to 24 or unlimited × minimum leaf 5, 20, or 50: depth 20, leaf 20 won
    (26.5 t).
  - The baseline is the median for the unit's fuel and type (114.2 t).
  - Persistence, last year's rate × this year's fuel, is a reference (18.7 t), not a model we
    store.
- **Ablation:** without this year's activity the tree's error rises from 26.5 to 63.2 t, so most of
  its accuracy comes from knowing how much the unit ran.
- **Stored as rows:** `ml/train.py` writes each model's preprocessing and coefficients or tree as
  JSON in `models.artifact`. The app replays it in TypeScript, so What-if runs on the read-only
  host; a test checks 200 rows against scikit-learn to within one in a million.

## Demo

The demo follows one plant, Ghent in Kentucky: it's the largest coal emitter in step 1, the TRACI
example in step 5, and its unit 2 is the one changed in steps 7 and 8.

### 10. Steps 1–2: build a dataset, then follow CO₂ — Arnav (1:20)

1. Analyze, Overview. Type `coal units in Kentucky` and press Enter.
2. Open **Data quality and variables**, then remove the State and Fuel chips.
3. Hover 2015, 2023, and 2025 on the fuel chart, then switch the question to CO₂ intensity.

- The sentence becomes two chips, State KY and Fuel Coal: a filter, not a text search. The whole
  analysis is in the URL.
- Kentucky coal: 358 unit-years from 17 plants. CO₂ fell 30 % (76.5M → 53.7M short tons); Ghent
  alone is 20 %.
- All plants: CO₂ fell 22 % (2.10 → 1.64 billion). Gas passed coal in 2023 (798M vs 760M); coal was
  ahead again in 2025.
- Coal's intensity stays near 2,040 lb/MWh all decade, so the fall is the shift to gas, not
  cleaner coal. That answers Q1.

### 11. Steps 3–4: spread by fuel, then SCR vs none — Arnav (1:20)

1. Distribution: NOₓ emission rate by fuel class, box plot, log scale.
2. Compare groups: click the example **SCR vs no NOₓ control**.

- Typical rates: gas 0.034, coal 0.136, oil 0.574 lb/MMBtu. The average is 2.5× the median,
  because a few huge values pull it up, so the page leads with the median.
- Pooled, no control is 0.1746 lb/MMBtu and SCR 0.0495: 252.6 % higher. Welch's t and
  Mann–Whitney both give p < 0.001.
- The groups differ in more than SCR (fuel, size, hours), so it's an association, not the effect
  of SCR alone. That answers Q2.

### 12. Steps 5–6: impacts by state, then model accuracy — Raaj (1:30)

1. TRACI impacts: years 2024–2024, then switch to "per MWh of power".
2. Search `Ghent`, pick Ghent (1356), and open **TRACI 2.2 factors used**.
3. Predict, Models.

- Texas leads every total because it generates the most power. Per MWh, Nebraska (2.322 kg SO₂ eq),
  North Dakota, and Missouri lead acidification. That answers Q3.
- **Ghent by hand:** (9,157.169 t SO₂ × 1 + 6,987.671 t NOₓ × 0.7) × 907.18474 = 12,744,620 kg SO₂
  eq; the page shows 12.74M, and 1.101 per MWh.
- On 2024–25 the baseline is off by 109.4 t, Ridge by 58.5, the tree by 26.3 (76 % less). The
  tree's R² is 0.951 (0.937–0.963).
- Persistence is off by only 18.5 t: it's the better forecast. The models are for what-if.

### 13. Steps 7–8: change one input, then ask what-if — Arnav (1:30)

1. What-if. It opens on "What if Ghent unit 2 added SCR in 2024?".
2. Scroll to the heat-input chart (± 50 %), then back up to the answer.
3. Click **Download** on any chart.

- Ghent unit 2 reported 4,146 t in 2024; Ridge predicts 2,972 and the tree 2,738. Both are low
  because its rate jumped that year.
- With half the fuel, Ridge predicts 35 % less and the tree 57 % less. The tree is a staircase with
  8 thresholds; shaded areas are values never seen in training.
- Adding SCR: Ridge −59 % (1.7K t, far above its 58 t typical miss); the tree doesn't move, because
  none of its questions about this unit is about SCR.
- They agree on fuel use and disagree on controls and fuel type; the disagreement is the finding.
  These are model responses, not causal effects. That answers Q4.
- The ZIP has the CSV, the PNG, and `metadata.json`: the model, its split years, the commit, and
  the database snapshot.

## Wrap-up

### 14. What these results don't show — Arnav (0:40)

- **Potential, not actual harm:** TRACI doesn't know stack height, weather, or who lives nearby.
  It covers only the three pollutants CAMPD reports.
- **Associations, not effects:** the SCR and no-control fleets differ in fuel, size, and hours.
  What-if changes one input while real inputs move together.
- **Optimistic p-values:** the same unit appears in many years, but the tests treat unit-years as
  independent.
- **Persistence forecasts better:** the models are for what-if, and the page says so.
- **Fuel is stored per unit, not per year:** a plant converted from coal counts as gas in every
  year.
- **A missing pollutant drops its categories:** 13.7 % lack CO₂ and 10.8 % lack SO₂, so group
  totals cover only complete unit-years.

### 15. The main bugs — Raaj (0:35, skippable)

- **A cache that didn't cache:** Drizzle queries are lazy, so storing the query re-ran it.
  Storing the result fixed it: 1.5 s to under 1 ms (slide 5).
- **A read-only host:** each Vercel instance starts cold and can't write. Results stored in the
  committed database solved both (slide 6).
- **NOₓ vs NO₂ in TRACI:** both are listed, with different smog factors. Reading the workbook
  itself got us the right one, and `traci_factors` records its source.
- **A tree in 32-bit floats:** the tree replayed from the `models` table took the wrong branch on
  rare rows, because scikit-learn compares in 32-bit floats. `Math.fround` fixed it; a test checks
  200 rows against scikit-learn.

### 16. Thank you. Questions? — Raaj + Arnav (0:40)

- **What we found:**
  - Q1: CO₂ fell 22 %; coal's intensity stayed flat, so the fall is the shift to gas.
  - Q2: uncontrolled units emit NOₓ at a 252.6 % higher pooled rate than SCR units.
  - Q3: Texas leads every category in total; Nebraska, North Dakota, and Missouri per MWh.
  - Q4: the tree cuts the baseline's error by 76 %, but last year's rate still forecasts best.
- **Who built what:**
  - Raaj: the new tables, the analysis query and stored results, the variable list and
    statistics, TRACI, the models, and the report.
  - Arnav: the Analyze and Predict pages, the charts, zoom and export, the filter chips and plain
    readings, and this presentation.
  - Together: the questions, testing, the demo, and the documentation.
- **Reproducing it:** the README has every step; the database and models are committed. The site
  is live at epadata.vercel.app.

**Likely questions:**

| Question | Answer |
|---|---|
| Why SQLite and not Postgres? | One file, read far more than written, shipped with the app, no server to run; the indexes keep queries in milliseconds (slides 3 and 5). |
| How do you know the indexes help? | `EXPLAIN QUERY PLAN` shows each one used; dropping them on a copy turns the previous-year join from 50 ms into 33 s (slide 5). |
| What if an import fails halfway? | It's one transaction (from Phase 1), so nothing is kept, and the data version doesn't change. |
| Can stored results go stale? | No: each carries the data version, and every import changes it (slide 6). |
| Why not just use last year's value? | It is the better forecast. The models are for what-if (slide 12). |
| Why do the models disagree? | The tree splits mostly on heat input and last year's rate, so it barely responds to SCR or fuel; Ridge gives every input a fixed effect (slide 13). |
| How is Top N computed? | A `ROW_NUMBER()` window function per state, added as one more filter; the analysis query uses the same WHERE clause (slide 5). |
| Why not k-fold cross-validation? | Random folds would put a unit's neighbouring years on both sides, the same leak as a random split. Re-scoring year by year (a rolling split) would be the next step (slide 8). |
| Is the SCR comparison causal? | No. The fleets differ, and the tests treat unit-years as independent (slide 11). |
| Why not Flask? | We extended the Phase 1 app instead of rewriting it; Python still trains the models. |

## If something goes wrong

- **The numbers don't match these notes:** a rehearsal changed the database. Stop the server, run
  `git restore db.sqlite`, and start it again.
- **A page is slow the first time:** you're running `npm run dev`. Use `npm run build && npm start`.
- **The description search doesn't fill the chips:** open
  `/analyze?stateCode=KY&primaryFuel=Coal&yearMin=2015&yearMax=2025&operatingHoursMin=0&operatingHoursMinStrict=1`.
- **The Ghent suggestion doesn't appear:** add `&facilityId=1356` to the TRACI URL.
- **No network:** everything works except the map tiles and web fonts.
