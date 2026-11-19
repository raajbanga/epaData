# epaData presentation notes

Notes for [`epaData-slides.pptx`](epaData-slides.pptx) ([PDF](epaData-slides.pdf)), built by
[`build-slides.cjs`](build-slides.cjs). The slides carry the headline. These notes carry the detail
behind each one: why it's built that way, the numbers, and the answers to follow-up questions. Read
them before presenting; glance at them while presenting. Each slide's speaker notes are generated
from its section here, so the two always match.

- **Timing:** about 15:00 in total.
  - Slides before the demo: about 6:55.
  - The demo: about 6:15.
  - Slides after the demo: about 1:55.
  - If time is short, skip slide 9 (the demo overview) and slide 19 (the main bugs). That saves
    about 0:50.
- **Speakers, by role:**

  | Speaker | Slides | Time |
  |---|---|---|
  | Raaj | 1, 3, 4, 6, 8, 14, 15, 17, 19, 20: intro, the architecture, schema, and indexes, the models, TRACI, what-if, and the main bugs | about 7:00 |
  | Arnav | 2, 5, 7, 9, 10, 11, 12, 13, 16, 18, 20: the questions, imports, stored results, the first demo steps, sensitivity, and limitations | about 7:00 |

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

- epaData stores the EPA's yearly emissions records for U.S. power plants and answers questions
  about them.
- Phase 1 brought the data in: retrieval from the EPA, file uploads, validation, and search.
- Phase 2 analyzes it: statistics, charts, the EPA's TRACI impact factors, and models that predict
  a unit's NOₓ and answer what-if questions.
- Order of the talk:
  - the questions
  - how the database is designed and kept fast
  - how the analysis works
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
- **What's stored:** 57,414 unit-years from 6,031 units at 1,777 plants.
  - A unit-year is one generating unit's record for one year.
  - By default the analysis uses 45,441 of them: the complete years 2015–2025, units that ran.
- **Who it's for:** people who know the subject but not statistics software. Every chart opens
  with a plain sentence saying what it shows.

## The database

### 3. How it fits together — Raaj (0:45)

- **One SQLite file** (`db.sqlite`, 35 MB) holds everything: the records, where each came from,
  the TRACI factors, the trained models, and stored analysis results.
  - SQLite because the data is read far more than written, fits in one file, and ships with the
    app. There's no database server to run.
- **The server** is Next.js 16 with tRPC. Drizzle ORM writes the queries; the libSQL client runs
  them.
  - The browser never sees rows, only results: a chart gets its numbers, not 45,000 records.
- **Writers** all go through the same import path (slide 5):
  - Retrieve pulls from the EPA's CAMPD API.
  - Upload reads CSV and Excel files; Python (`scripts/parse_import.py`) parses and checks them.
- **Offline scripts** also write to it:
  - `ml/train.py` stores the trained models as rows.
  - `scripts/import_traci.ts` stores the six TRACI factors.
  - `npm run db:precompute` refreshes the stored results (slide 7).
- **Hosting:** Vercel serves a read-only copy of the committed file. Retrieve and Upload say they're
  disabled there; everything else works.

### 4. The schema: one row per unit per year — Raaj (0:50)

- **Nine tables.** The three core ones:
  - `facilities` (1,777): the key is the EPA's own facility ID.
  - `units` (6,031): unique on (facility, unit ID).
  - `annual_records` (57,414): unique on (unit, year). This is the row everything counts.
- **Provenance:**
  - `datasets` (153): one row per import, with its counts and its parameters or file name.
  - Every record points to the dataset that last wrote it.
  - `superseded_upload_id` remembers an upload that a later EPA retrieval replaced, so the Upload
    page can say "Replaced by API".
- **Quality:**
  - `data_audit_logs` (7,603): physical-sanity flags on records that are kept, such as power reported
    from a unit that ran 0 hours.
  - `import_issues`: rejected and repeated rows, with the reason.
- **Analysis tables:**
  - `traci_factors` (6): with version, substance, CAS number, and unit.
  - `models` (3): each trained model as JSON.
  - `result_cache` (67): stored analysis results (slide 7).
- **Rules the schema enforces:**
  - Deleting a facility cascades to its units and records.
  - Deleting an upload only clears `superseded_upload_id`; the records stay.
  - A missing measurement is NULL, never 0. Zero would drag every average down.

### 5. Getting data in: one transaction per import — Arnav (0:50)

- **Check before writing.** An upload is parsed and checked first; nothing is stored yet.
  - Rejected rows come back with a reason; repeated rows are listed.
  - Each record is compared with what's stored: New, Updated, or Unchanged.
  - The stored records are read in chunks of 500 IDs, because SQLite limits how many values one
    query can bind.
- **Approve, then one transaction:**
  - the dataset row
  - the rejected rows (`import_issues`)
  - facilities and units, upserted
  - the records, upserted on (unit, year) in 50-row chunks
  - the audit flags and the dataset's final counts.
  - If any step fails, nothing is kept. The original file is archived only after the commit.
- **Upsert, not delete and reload.** Re-importing a year updates the rows that changed and leaves
  the rest alone, so each record's history stays correct.
- **Retrieve** from the EPA uses the same transaction and upsert.
- **Every import changes the data version** (the newest import time). Stored results from older
  versions stop being used at once (slide 7).

### 6. Indexes chosen from query plans — Raaj (0:50)

- **Method:** for each slow query, read SQLite's `EXPLAIN QUERY PLAN`, then add the index it
  needs. There are 17 indexes, and each one serves a query we can name.
- **(facility_id, year) on annual_records:**
  - Used by "each plant's CO₂ in 2024", which ranks plants and fills the map.
  - With only a year index, SQLite scanned every 2024 record once per plant: 2.67 s.
  - With the pair, it looks up one plant's year directly: 3.8 ms, about 700 times faster.
- **(unit, year), unique, on annual_records:**
  - It enforces one record per unit per year.
  - It also serves the self-join that finds each record's previous year, which every
    year-over-year change needs.
  - Without it: 33 s for the default selection. With it: 50 ms.
- **(year, co2_mass_tons):** the year range every Analyze selection starts from, and the CO₂ ranking
  on Explore.
- These timings were measured with `sqlite3`'s timer on a copy of the database with the index
  dropped.
- **Ranking stays in SQL too:** Explore's "top N per state" is one `ROW_NUMBER()` window function,
  partitioned by state, added to the query as one more filter. So it works with paging, the map,
  and Analyze.

### 7. Read once, then store the result — Arnav (0:55)

- **Read once:** each Analyze tab asks for several results about the same selection.
  - The server loads the selection's rows once (one join with units, plants, and the previous
    year), and every result is computed from that copy.
  - The copy is kept for 5 minutes per (filters, data version).
- **The bug that taught us this:** our first cache stored the query itself. Drizzle queries are
  lazy, so each use ran it again: 1.5 s per view. Storing the finished rows: under 1 ms.
- **Why that wasn't enough:** on Vercel each server instance starts empty, so Analyze took about
  4.4 s on almost every visit.
- **Store the result in the database:** the `result_cache` table.
  - The key is the procedure plus its input as JSON with sorted keys, so equal questions get equal
    keys.
  - Each result is stamped with the data version. After an import, old results are never served.
  - A lookup tries memory, then the table, then computes and stores.
- **Shipping it:** `npm run db:precompute` recomputes every stored input for the current data,
  and the committed file carries the results to the read-only host.
- **Result:** a stored result reads in about 8 ms instead of about 1,100 ms. Every page now shows
  in 0.1–0.25 s on a production build.
- **The browser gets results, not rows:** a chart receives its numbers, not 45,000 records. Bar
  charts arrive as HTML from the server; scatter plots draw on one canvas (Predict went from about
  9,700 page elements to about 680).

## The analysis

### 8. Predicting NOₓ on years the models never saw — Raaj (0:45)

- **Target:** a unit's yearly NOₓ, in short tons. NOₓ depends on controls, so "add SCR" means
  something. CO₂ is nearly a fixed multiple of fuel burned.
- **Split by year, not at random:** train 2016–2021, tune on 2022–23, refit, then score once on
  2024–25. A random split would let a model learn a unit's 2024 from its own 2025.
- **No leakage:** no input is this year's NOₓ or computed from it. Last year's rate is allowed,
  because it's known in advance.
- **Models:** a median baseline (by fuel and unit type), Ridge regression, and a decision tree. We
  also report persistence: last year's rate × this year's fuel.
- **Stored as rows:** Python trains them offline. Each model is saved in `models` as JSON (its
  preprocessing and its coefficients or tree).
  - A TypeScript module replays that JSON in the browser. A test checks it matches scikit-learn on
    200 rows to within one in a million.
  - So What-if needs no Python server, and works on the read-only host.

## Demo

### 9. Eight steps, four questions — Arnav (0:15)

- Each step matches a requirement of the assignment and answers one of the questions.
- One plant ties them together: Ghent, in Kentucky.
  - It's Kentucky's largest coal emitter in step 1.
  - It's the TRACI example checked by hand in step 5.
  - Its unit 2 is the one we change in steps 7 and 8.
- Whoever built a part presents it.

### 10. Step 1: build a dataset — Arnav (0:45)

1. Analyze, Overview tab. The default chips are Reporting year 2015–2025 and Operating time > 0 hr.
2. Type `coal units in Kentucky` in the search box and press Enter.
3. Open **Data quality and variables**.
4. Remove the State and Fuel chips.

- The sentence becomes two chips, State KY and Fuel Coal: a filter, not a text search.
- **358 unit-years** from 17 plants and 46 units. CO₂ fell 30 % from 2015 to 2025 (76.5M → 53.7M
  short tons). Ghent alone is 20 % (125M).
- Data quality says why values are missing: NOₓ-only programs, cogeneration units with no gross
  load, and units with no previous year. Missing is never counted as 0.
- The whole analysis is in the URL, so it can be reloaded or shared.

### 11. Step 2: CO₂ trend by fuel — Arnav (0:40)

1. Overview, showing CO₂ mass by year and fuel class.
2. Hover 2015, 2023, and 2025.
3. Switch the question to CO₂ intensity.

- Total CO₂ fell 22 %, from 2.10 to 1.64 billion short tons.
- 2015: coal 1,393M, gas 688M. 2023: gas 798M, coal 760M, so gas passed coal. 2025: coal is ahead
  again, 825M to 799M.
- Coal's intensity stays near 2,040 lb/MWh all decade; gas falls from 1,051 to 926.
- So coal plants didn't get cleaner: the total fell because power moved from coal to gas. That
  answers Q1.
- Drag across the chart to zoom. **Download** gives a ZIP with the CSV, the PNG, and the metadata.

### 12. Step 3: NOₓ rate by fuel — Arnav (0:40)

1. Distribution tab: NOₓ emission rate, split by fuel class, box plot, log scale.

- A box plot shows each group's typical value and spread side by side. The key above it says how
  to read a box. Log scale, because rates span four orders of magnitude.
- Typical (median) rates: gas 0.034, coal 0.136, oil 0.574 lb/MMBtu.
- 45.2K unit-years have a value. The average, 0.1508, is 2.5× the median, because a few huge
  values pull it up. So the median describes most units better.
- 3,178 unit-years (7 %) are unusually large.
- If asked about correlation: Relationships shows Pearson and Spearman side by side. For CO₂
  intensity and heat rate they disagree (0.9998 vs 0.765), because a few units with almost no load
  drive Pearson.

### 13. Step 4: SCR vs no control — Arnav (0:40)

1. Compare groups tab. Click the example **SCR vs no NOₓ control**.

- The bars pool every unit-year: 0.1746 lb/MMBtu with no control, 0.0495 with SCR (252.6 %
  higher).
- Per unit-year on average: 0.4767 vs 0.03446, so a typical uncontrolled unit-year emits at 13.83
  times the rate.
- "Too big to be chance": Welch's t-test and Mann–Whitney both give p < 0.001. **Numbers and
  tests** shows them.
- The third sentence matters: the groups differ in more than SCR. SCR units are mostly
  combined-cycle gas; uncontrolled ones are mostly gas and oil peakers. So it's an association, not
  the effect of SCR alone. That answers Q2.

### 14. Step 5: TRACI impacts — Raaj (0:50)

1. TRACI impacts tab. Set the years to 2024–2024.
2. Switch the question from "in total" to "per MWh of power".
3. Search `Ghent` and pick Ghent (1356).
4. Open **TRACI 2.2 factors used**.

- **How it's computed:** tons × 907.18474 kg per ton × the TRACI factor, summed only within one
  category. The six factors that apply to CAMPD's three pollutants are rows in `traci_factors`.
  - The mapping is exact, not by name: CAMPD reports NOₓ, so we use TRACI's nitrogen oxides (smog
    24.79), not nitrogen dioxide (16.85).
  - Categories have different units, so they're never added together.
- In total, Texas leads all four categories, because it generates the most power.
- Per MWh, Nebraska (2.322), North Dakota (1.83), and Missouri (1.569 kg SO₂ eq) lead
  acidification. Totals show where impacts happen; per MWh shows how dirty each MWh is.
- **Ghent by hand:** (9,157.169 t SO₂ × 1 + 6,987.671 t NOₓ × 0.7) × 907.18474 = 12,744,620 kg SO₂ eq.
  The page shows 12.74M. Divided by 11,580,029 MWh, that's 1.101 per MWh, which the page also shows.
- Potential impacts, not measured harm. That answers Q3.

### 15. Step 6: models vs the baseline — Raaj (0:50)

1. Predict, Models tab.
2. Scroll to **Average error by fuel**.

- On 2024–25, which no model saw, the baseline is off by 109.4 t per unit-year, Ridge by 58.5, and
  the tree by 26.3: 76 % less error than the baseline.
- The tree's R² is 0.951 (95 % interval 0.937–0.963, from resampling units). Training, validation,
  and test agree, so it isn't overfitting.
- **The honest part:** last year's rate × this year's fuel is off by only 18.5 t. Persistence beats
  both models. A unit's rate barely changes from year to year.
- Coal units have the largest errors, and the models under-predict them.
- So the models aren't the best forecast. What they add is a response to load, controls, and fuel,
  which persistence can't give. That's the What-if tab.

### 16. Step 7: sensitivity — Arnav (0:45)

1. What-if tab. It opens on "What if Ghent unit 2 added SCR in 2024?".
2. Scroll to **How the prediction responds to one input**: heat input, ± 50 %.

- Ghent unit 2 is a 556 MW coal unit with no SCR. It reported 4,146 t of NOₓ in 2024; Ridge
  predicts 2,972 and the tree 2,738.
  - Both are low because the unit's rate jumped that year, and the models see last year's.
- Every other input stays as reported. The dot is how it is now.
- With 50 % less fuel, Ridge predicts 35 % less NOₓ and the tree 57 % less. With 50 % more, both
  predict 29 % more.
- Ridge's line is smooth. The tree's is a staircase: it changes only when heat input crosses one of
  its 8 thresholds.
- Shaded areas are values the models never saw in training, so they're guesses.

### 17. Step 8: what-if and export — Raaj (0:50)

1. Scroll back up to the answer for "added SCR".
2. Point at **What if they made a different change?**
3. Click **Download** on any chart.

- Ridge predicts 59 % less NOₓ (1.7K t); the tree predicts no change. The page says to treat the
  size of the effect as uncertain.
  - Ridge's change is far bigger than its typical miss (58 t), so it isn't noise.
  - For scale, it's 5 % of all power-plant NOₓ in Kentucky that year (32.3K t).
  - Smog, acid-rain, and particle potential fall by the same share.
- **Why the tree doesn't move:** its yes/no questions about this unit don't include SCR, so it
  predicts 2,738 t either way.
- **Other changes, same unit:**

  | Change | Ridge | Tree |
  |---|---|---|
  | Add SCR | −58.9 % | 0.0 % |
  | Switch to gas | −68.8 % | 0.0 % |
  | 5 % less fuel | −3.2 % | −9.1 % |
  | Run 10 % more | +6.2 % | +10.1 % |

  - They agree on fuel use and disagree on controls and fuel type. The disagreement is the finding.
- The ZIP has the CSV, the PNG, and `metadata.json`: the model, its inputs and split years, the
  commit, and the database snapshot.
- These are model responses, not causal effects. That answers Q4.

## Wrap-up

### 18. What these results don't show — Arnav (0:40)

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

### 19. The main bugs — Raaj (0:35, skippable)

- **A missing index:** the previous-year join took 33 s until the unique (unit, year) index served
  it (slide 6).
- **A cache that didn't cache:** Drizzle queries are lazy, so storing the query re-ran it.
  Storing the result fixed it: 1.5 s to under 1 ms (slide 7).
- **A read-only host:** each Vercel instance starts cold and can't write. Results stored in the
  committed database solved both (slide 7).
- **NOₓ vs NO₂ in TRACI:** both are listed, with different smog factors. Reading the workbook
  itself got us the right one.

### 20. Thank you. Questions? — Raaj + Arnav (0:40)

- **What we found:**
  - Q1: CO₂ fell 22 %; coal's intensity stayed flat, so the fall is the shift to gas.
  - Q2: uncontrolled units emit NOₓ at a 252.6 % higher pooled rate than SCR units.
  - Q3: Texas leads every category in total; Nebraska, North Dakota, and Missouri per MWh.
  - Q4: the tree cuts the baseline's error by 76 %, but last year's rate still forecasts best.
- **Who built what:**
  - Raaj: the database schema, indexes, imports, stored results, the variable list and
    statistics, TRACI, the models, and the report.
  - Arnav: the Analyze and Predict pages, the charts, zoom and export, the filter chips and plain
    readings, and this presentation.
  - Together: the questions, testing, the demo, and the documentation.
- **Reproducing it:** the README has every step; the database and models are committed. The site
  is live at epadata.vercel.app.

**Likely questions:**

| Question | Answer |
|---|---|
| Why SQLite and not Postgres? | One file, read far more than written, shipped with the app, no server to run; the indexes keep queries in milliseconds (slides 3 and 6). |
| How do you know the indexes help? | `EXPLAIN QUERY PLAN` shows each one used; dropping them on a copy turns 3.8 ms into 2.67 s and 50 ms into 33 s (slide 6). |
| What if an import fails halfway? | It's one transaction, so nothing is kept (slide 5). |
| Can stored results go stale? | No: each carries the data version, and every import changes it (slide 7). |
| Why not just use last year's value? | It is the better forecast. The models are for what-if (slide 15). |
| Why do the models disagree? | The tree splits mostly on heat input and last year's rate, so it barely responds to SCR or fuel; Ridge gives every input a fixed effect (slide 17). |
| How is Top N computed? | A `ROW_NUMBER()` window function per state, added as one more filter (slide 6). |
| Is the SCR comparison causal? | No. The fleets differ, and the tests treat unit-years as independent (slide 13). |
| Why not Flask? | We extended the Phase 1 app instead of rewriting it; Python still trains the models. |

## If something goes wrong

- **The numbers don't match these notes:** a rehearsal changed the database. Stop the server, run
  `git restore db.sqlite`, and start it again.
- **A page is slow the first time:** you're running `npm run dev`. Use `npm run build && npm start`.
- **The description search doesn't fill the chips:** open
  `/analyze?stateCode=KY&primaryFuel=Coal&yearMin=2015&yearMax=2025&operatingHoursMin=0&operatingHoursMinStrict=1`.
- **The Ghent suggestion doesn't appear:** add `&facilityId=1356` to the TRACI URL.
- **No network:** everything works except the map tiles and web fonts.
