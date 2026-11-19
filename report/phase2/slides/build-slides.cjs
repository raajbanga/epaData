// @ts-nocheck -- standalone build script; pptxgenjs is installed only to run it.
// Builds epaData-slides.pptx in the app's own "Latte" palette.
// From the repository root:
//   npm install --no-save pptxgenjs@3.12.0
//   node report/phase2/slides/build-slides.cjs
// Screenshots come from report/phase2/figures (the report's) and report/phase2/slides/img
// (slide-only crops). Speaker notes are generated from slides-outline.md, so they always match.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const pptxgen = require("pptxgenjs");

const HERE = __dirname;
const FIG = path.join(HERE, "..", "figures");
const IMG = path.join(HERE, "img");
const OUT = path.join(HERE, "epaData-slides.pptx");

// ── Theme: the app's light palette ───────────────────────────────────────
const K = {
  bg: "EFE6DA", // page
  card: "F4EDE4", // cards and diagram boxes
  paper: "FAF6F0", // light fill
  ink: "2A1F16", // titles and body
  ink2: "4A3A2C",
  muted: "6B5948", // kickers, captions, footer
  rule: "D3C2AD", // hairlines and borders
  blue: "1D4ED8",
  green: "15803D",
  amber: "B45309",
  red: "B91C1C",
  ridge: "6683B0", // model colors as in the app
  tree: "A0628E",
  base: "9B8B7A",
  persist: "15803D",
  code: "2A1F16",
  codeText: "E5D9C9",
};
const SANS = "IBM Plex Sans";
const MONO = "IBM Plex Mono";

const pres = new pptxgen();

// IBM Plex has no "ₓ" glyph, and the fallback sits below the line, so slides say "NOx"; the notes
// (plain text) keep "NOₓ".
const plain = (t) => (typeof t === "string" ? t.replaceAll("NOₓ", "NOx") : t);
const plainRuns = (v) => (Array.isArray(v) ? v.map((r) => (typeof r === "string" ? plain(r) : r && typeof r === "object" && "text" in r ? { ...r, text: plain(r.text) } : r)) : plain(v));
const addSlide = (opts) => {
  const slide = pres.addSlide(opts);
  const addText = slide.addText.bind(slide);
  const addTable = slide.addTable.bind(slide);
  slide.addText = (t, o) => addText(plainRuns(t), o);
  slide.addTable = (rows, o) => addTable(rows.map(plainRuns), o);
  return slide;
};
pres.layout = "LAYOUT_WIDE";
pres.title = "epaData";
pres.author = "Raaj Banga, Arnav Bawankule";
pres.company = "CS396";
pres.theme = { headFontFace: SANS, bodyFontFace: SANS };

pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: K.bg },
  slideNumber: { x: 12.13, y: 7.0, w: 0.6, h: 0.28, fontFace: SANS, fontSize: 10, color: K.muted, align: "right" },
});
pres.defineSlideMaster({ title: "TITLE", background: { color: K.bg } });

// ── Helpers ──────────────────────────────────────────────────────────────
const dims = (file) => {
  const out = execSync(`sips -g pixelWidth -g pixelHeight "${file}"`).toString();
  const [w, h] = [...out.matchAll(/pixel\w+: (\d+)/g)].map((m) => Number(m[1]));
  return { w, h };
};
const fig = (name) => path.join(FIG, `${name}.jpg`);
const img = (name) => path.join(IMG, `${name}.jpg`);

/** A screenshot fitted inside the box (x, y, w, h), top-aligned, with a hairline frame. */
function shot(slide, file, x, y, w, h, align = "center") {
  const d = dims(file);
  const scale = Math.min(w / d.w, h / d.h);
  const iw = d.w * scale;
  const ih = d.h * scale;
  const ix = align === "left" ? x : align === "right" ? x + w - iw : x + (w - iw) / 2;
  slide.addImage({ path: file, x: ix, y, w: iw, h: ih, altText: path.basename(file) });
  slide.addShape(pres.shapes.RECTANGLE, { x: ix, y, w: iw, h: ih, fill: { type: "none" }, line: { color: K.rule, width: 0.75 } });
  return { x: ix, y, w: iw, h: ih };
}

/** A content slide: kicker, title, one-line subtitle, and the speaker's name top right. */
function frame(kicker, title, section, speaker, subtitle) {
  const s = addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(kicker, { x: 0.6, y: 0.4, w: 9.5, h: 0.32, fontSize: 13, color: K.muted, margin: 0, isTextBox: true });
  if (speaker) {
    const w = 0.35 + speaker.length * 0.105;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 12.73 - w, y: 0.38, w, h: 0.36, rectRadius: 0.18, fill: { color: K.paper }, line: { color: K.rule, width: 0.75 } });
    s.addText(speaker, { x: 12.73 - w, y: 0.38, w, h: 0.36, fontSize: 12, color: K.ink2, align: "center", valign: "middle", margin: 0, isTextBox: true });
  }
  s.addText(title, { x: 0.6, y: 0.74, w: 12.1, h: 0.72, fontSize: 30, bold: true, color: K.ink, margin: 0, valign: "middle", isTextBox: true });
  if (subtitle)
    s.addText(subtitle, { x: 0.6, y: 1.46, w: 12.1, h: 0.38, fontSize: 16, color: K.muted, margin: 0, valign: "middle", isTextBox: true });
  return s;
}

/** Bullets: a bold lead, then plain text; an optional muted sub-line with a dash. items: [{ b, t, sub }] */
function bullets(slide, items, x, y, w, h, size = 17) {
  const runs = [];
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    runs.push({ text: it.b, options: { bold: true, bullet: { characterCode: "25AA", indent: 18 }, breakLine: false, paraSpaceBefore: i ? 9 : 0 } });
    runs.push({ text: it.t ? ` ${it.t}` : "", options: { breakLine: !!it.sub || !last } });
    if (it.sub)
      runs.push({ text: it.sub, options: { fontSize: size - 3, color: K.muted, bullet: { characterCode: "2013", indent: 14 }, indentLevel: 1, breakLine: !last, paraSpaceBefore: 2 } });
  });
  slide.addText(runs, { x, y, w, h, fontSize: size, color: K.ink, valign: "top", margin: 0, isTextBox: true });
}

/** A big number with a label under it and a hairline above. */
function stat(slide, x, y, value, label, color = K.ink, w = 2.7) {
  slide.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: K.rule, width: 0.75 } });
  const size = value.length > 11 ? 20 : value.length > 8 ? 24 : value.length > 6 ? 27 : 32;
  slide.addText(value, { x, y: y + 0.18, w, h: 0.62, fontSize: size, bold: true, color, margin: 0, valign: "middle", isTextBox: true });
  slide.addText(label, { x, y: y + 0.84, w, h: 0.55, fontSize: 13, color: K.muted, margin: 0, valign: "top", isTextBox: true });
}

/** A rounded diagram box with a bold first line. */
function node(slide, x, y, w, h, head, body, opts = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: opts.fill ?? K.paper },
    line: { color: opts.line ?? K.rule, width: opts.lineW ?? 1, dashType: opts.dash ?? "solid" },
  });
  slide.addText(
    [
      { text: head, options: { bold: true, fontSize: opts.headSize ?? 14, color: K.ink, breakLine: !!body } },
      ...(body ? [{ text: body, options: { fontSize: opts.bodySize ?? 11, color: K.muted, fontFace: opts.bodyMono ? MONO : SANS } }] : []),
    ],
    { x, y, w, h, align: opts.align ?? "center", valign: "middle", margin: 6, isTextBox: true },
  );
}

/** A numbered step box (flow diagrams): number badge, bold head, muted body. */
function step(slide, x, y, w, h, n, head, body, opts = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: opts.fill ?? K.paper }, line: { color: opts.line ?? K.rule, width: opts.lineW ?? 1 } });
  slide.addShape(pres.shapes.OVAL, { x: x + 0.15, y: y + 0.15, w: 0.36, h: 0.36, fill: { color: K.ink }, line: { color: K.ink } });
  slide.addText(String(n), { x: x + 0.15, y: y + 0.15, w: 0.36, h: 0.36, fontSize: 12, bold: true, color: K.paper, align: "center", valign: "middle", margin: 0, isTextBox: true });
  slide.addText(head, { x: x + 0.6, y: y + 0.12, w: w - 0.7, h: 0.42, fontSize: 14, bold: true, color: K.ink, margin: 0, valign: "middle", isTextBox: true });
  slide.addText(body, { x: x + 0.18, y: y + 0.62, w: w - 0.3, h: h - 0.72, fontSize: 12, color: K.ink2, margin: 0, valign: "top", isTextBox: true });
}

function arrow(slide, x1, y1, x2, y2, label, dash = "solid") {
  slide.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color: K.muted, width: 1, endArrowType: "triangle", dashType: dash },
  });
  if (label)
    slide.addText(label, { x: (x1 + x2) / 2 + 0.08, y: (y1 + y2) / 2 - 0.14, w: 2.6, h: 0.28, fontFace: MONO, fontSize: 10, color: K.muted, margin: 0, isTextBox: true });
}

/** A dark code panel, as tall as its lines plus even padding (h is ignored). Returns its height. */
function code(slide, x, y, w, _h, lines, size = 13) {
  const pad = 0.2, textH = (lines.length * size * 1.2) / 72;
  const h = textH + 2 * pad;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: K.code }, line: { color: K.code } });
  slide.addText(lines.map((t, i, a) => ({ text: t, options: { breakLine: i < a.length - 1 } })), { x: x + 0.25, y: y + pad, w: w - 0.5, h: textH, fontFace: MONO, fontSize: size, color: K.codeText, margin: 0, valign: "middle", lineSpacingMultiple: 1.0, isTextBox: true });
  return h;
}

/** A card in a grid: heading, text, and an optional tag line ("Fix", "So"). */
function card(slide, x, y, w, head, text, tagLabel, tagText, tagColor = K.green) {
  slide.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: K.rule, width: 0.75 } });
  slide.addText(head, { x, y: y + 0.18, w, h: 0.4, fontSize: 16, bold: true, color: K.ink, margin: 0, isTextBox: true });
  slide.addText(text, { x, y: y + 0.62, w, h: 0.9, fontSize: 13, color: K.ink2, margin: 0, valign: "top", isTextBox: true });
  if (tagLabel)
    slide.addText(
      [
        { text: `${tagLabel}   `, options: { bold: true, color: tagColor } },
        { text: tagText, options: { color: K.ink2 } },
      ],
      { x, y: y + 1.55, w, h: 0.32, fontSize: 12, margin: 0, isTextBox: true },
    );
}

const hdr = (t) => ({ text: t, options: { bold: true, color: K.ink, fill: { color: K.card } } });
const strong = (t) => ({ text: t, options: { bold: true, color: K.ink } });
const table = (s, rows, opts) => s.addTable(rows, { fontFace: SANS, color: K.ink2, border: { type: "solid", color: K.rule, pt: 0.75 }, valign: "middle", ...opts });
const caption = (s, t, x, y, w) => s.addText(t, { x, y, w, h: 0.3, fontSize: 11, italic: true, color: K.muted, margin: 0, isTextBox: true });

// ── 1. Title ─────────────────────────────────────────────────────────────
pres.addSection({ title: "Introduction" });
{
  const s = addSlide({ masterName: "TITLE", sectionTitle: "Introduction" });
  s.addText("CS396 · Database management · December 2026", { x: 0.6, y: 1.55, w: 5.8, h: 0.35, fontSize: 15, color: K.muted, margin: 0, isTextBox: true });
  s.addText("epaData", { x: 0.6, y: 1.95, w: 5.6, h: 1.1, fontSize: 54, bold: true, color: K.ink, margin: 0, isTextBox: true });
  s.addText("EPA power-plant emissions: stored, checked, analyzed, and predicted", {
    x: 0.6, y: 3.1, w: 5.5, h: 1.0, fontSize: 18, color: K.ink2, margin: 0, valign: "top", isTextBox: true,
  });
  [["RB", "Raaj Banga", "Back end and database", 4.45], ["AB", "Arnav Bawankule", "Front end and charts", 5.2]].forEach(([ini, name, role, y]) => {
    s.addShape(pres.shapes.OVAL, { x: 0.6, y, w: 0.52, h: 0.52, fill: { color: K.ink }, line: { color: K.ink } });
    s.addText(ini, { x: 0.6, y, w: 0.52, h: 0.52, fontSize: 12, bold: true, color: K.paper, align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText([{ text: name, options: { bold: true, fontSize: 15, color: K.ink, breakLine: true } }, { text: role, options: { fontSize: 12, color: K.muted } }],
      { x: 1.27, y: y - 0.04, w: 3.5, h: 0.6, margin: 0, valign: "middle", isTextBox: true });
  });
  const r = shot(s, img("title"), 6.55, 1.45, 6.2, 4.2);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: r.x + r.w / 2 - 2.35, y: r.y + r.h + 0.3, w: 4.7, h: 0.42, rectRadius: 0.08, fill: { color: K.paper }, line: { color: K.rule, width: 1 } });
  s.addText("epadata.vercel.app · SQLite · Next.js", { x: r.x + r.w / 2 - 2.35, y: r.y + r.h + 0.3, w: 4.7, h: 0.42, fontFace: MONO, fontSize: 12, color: K.ink2, align: "center", valign: "middle", margin: 0, isTextBox: true });
}

// ── 2. Questions ─────────────────────────────────────────────────────────
{
  const s = frame("Introduction", "Four questions, one database", "Introduction", "Arnav", "Phase 1 could find records. Phase 2 answers questions about them.");
  bullets(s, [
    { b: "Q1 Trends.", t: "How did emissions change 2015–2025, and how much is coal giving way to gas?" },
    { b: "Q2 Controls.", t: "How much lower is the NOₓ rate of units with SCR?" },
    { b: "Q3 Impacts.", t: "Which states contribute most to each TRACI impact category?" },
    { b: "Q4 Prediction.", t: "How well can a unit's NOₓ be predicted, and how does it respond to changes?" },
  ], 0.6, 2.15, 6.3, 4.4);
  stat(s, 7.4, 2.15, "57,414", "unit-years stored: one unit's record for one year");
  stat(s, 10.25, 2.15, "6,031", "units at 1,777 plants");
  stat(s, 7.4, 4.15, "45,441", "analyzed by default: 2015–2025, units that ran");
  stat(s, 10.25, 4.15, "9 tables", "in one SQLite file", K.amber);
}

// ── 3. Architecture ──────────────────────────────────────────────────────
pres.addSection({ title: "The database" });
{
  const s = frame("The database · architecture", "How it fits together", "The database", "Raaj", "One SQLite file holds everything; every write goes through one import path.");
  node(s, 0.6, 2.15, 3.6, 1.05, "Retrieve · Upload", "EPA CAMPD API · CSV and Excel,\nchecked by Python first");
  node(s, 4.85, 2.15, 3.6, 1.05, "Import path", "check → approve → one transaction", { fill: K.card });
  node(s, 4.85, 3.85, 3.6, 1.35, "SQLite · db.sqlite (35 MB)", "records · provenance · TRACI factors\nmodels · stored results", { line: K.blue, lineW: 1.75, headSize: 15 });
  node(s, 9.1, 3.85, 3.6, 1.35, "Next.js 16 · tRPC", "Drizzle ORM over libSQL;\nstatistics computed here");
  node(s, 9.1, 2.15, 3.6, 1.05, "Browser", "gets results, never rows");
  node(s, 0.6, 3.85, 3.6, 1.35, "Offline scripts", "ml/train.py → models\nimport_traci → traci_factors\ndb:precompute → result_cache", { dash: "dash", bodyMono: true, bodySize: 10 });
  node(s, 4.85, 5.75, 3.6, 0.85, "Vercel", "read-only copy of the file", { dash: "dash" });
  arrow(s, 4.2, 2.68, 4.85, 2.68);
  arrow(s, 6.65, 3.2, 6.65, 3.85);
  arrow(s, 8.45, 4.52, 9.1, 4.52);
  arrow(s, 10.9, 3.85, 10.9, 3.2);
  s.addText("rows", { x: 8.45, y: 4.16, w: 0.65, h: 0.3, fontFace: MONO, fontSize: 10, color: K.muted, align: "center", margin: 0, isTextBox: true });
  s.addText("results", { x: 11.0, y: 3.38, w: 1.2, h: 0.3, fontFace: MONO, fontSize: 10, color: K.muted, margin: 0, isTextBox: true });
  arrow(s, 4.2, 4.52, 4.85, 4.52, null, "dash");
  arrow(s, 6.65, 5.2, 6.65, 5.75, null, "dash");
  s.addText("Writes happen locally; the hosted copy only reads.", { x: 9.1, y: 5.85, w: 3.6, h: 0.6, fontSize: 13, color: K.muted, margin: 0, valign: "top", isTextBox: true });
}

// ── 4. Schema ────────────────────────────────────────────────────────────
{
  const s = frame("The database · schema", "One row per unit per year", "The database", "Raaj", "Nine tables; the keys enforce what the data means.");
  const box = (x, y, w, h, name, n, lines, opts = {}) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.05, fill: { color: opts.fill ?? K.paper }, line: { color: opts.line ?? K.rule, width: opts.lineW ?? 1, dashType: opts.dash ?? "solid" } });
    s.addText([{ text: name, options: { bold: true, fontFace: MONO, fontSize: 13, color: K.ink } }, { text: `  ${n}`, options: { fontSize: 11, color: K.muted, breakLine: true } }, ...lines.map((t, i) => ({ text: t, options: { fontSize: 11, color: K.ink2, breakLine: i < lines.length - 1 } }))],
      { x: x + 0.1, y: y + 0.06, w: w - 0.2, h: h - 0.12, margin: 0, valign: "top", isTextBox: true });
  };
  box(0.6, 2.15, 2.75, 1.05, "facilities", "1,777", ["PK: the EPA facility ID", "state, county, location"]);
  box(3.85, 2.15, 2.75, 1.05, "units", "6,031", ["unique (facility, unit ID)", "fuel, type, capacity"]);
  box(7.1, 2.15, 2.95, 1.6, "annual_records", "57,414", ["unique (unit, year)", "→ unit, facility, dataset", "superseded_upload_id", "metrics: NULL, never 0"], { line: K.blue, lineW: 1.75 });
  box(10.55, 2.15, 2.2, 1.05, "datasets", "153", ["one row per import", "counts, file or query"]);
  box(7.1, 4.25, 2.95, 0.85, "data_audit_logs", "7,603", ["sanity flags on kept records"]);
  box(10.55, 4.25, 2.2, 0.85, "import_issues", "", ["rejected, repeated rows"]);
  s.addText("Analysis tables", { x: 0.6, y: 3.95, w: 6, h: 0.3, fontSize: 12, bold: true, color: K.muted, margin: 0, isTextBox: true });
  box(0.6, 4.25, 1.95, 0.85, "traci_factors", "6", ["version, CAS, unit"], { dash: "dash" });
  box(2.7, 4.25, 1.95, 0.85, "models", "3", ["each model as JSON"], { dash: "dash" });
  box(4.8, 4.25, 1.95, 0.85, "result_cache", "67", ["stored results"], { dash: "dash" });
  arrow(s, 3.35, 2.68, 3.85, 2.68);
  arrow(s, 6.6, 2.68, 7.1, 2.68);
  arrow(s, 10.55, 2.68, 10.05, 2.68);
  arrow(s, 8.58, 3.75, 8.58, 4.25);
  arrow(s, 11.65, 3.2, 11.65, 4.25);
  card(s, 0.6, 5.45, 3.8, "Cascade", "Deleting a facility removes its units and their records.");
  card(s, 4.75, 5.45, 3.8, "Set null", "Deleting an upload only clears superseded_upload_id.");
  card(s, 8.9, 5.45, 3.8, "NULL, never 0", "A missing measurement stays missing, so averages stay honest.");
}

// ── 5. Imports ───────────────────────────────────────────────────────────
{
  const s = frame("The database · writing data", "Getting data in: one transaction per import", "The database", "Arnav", "Nothing is written until the report is approved; a failure leaves nothing behind.");
  const w = 2.3, g = 0.15;
  const steps = [
    ["Parse and check", "Python reads CSV or Excel; rejects rows with a reason, lists repeats."],
    ["Compare", "Each record vs what's stored: New, Updated, Unchanged. Reads 500 IDs at a time."],
    ["Approve", "The report shows every count. Cancel writes nothing."],
    ["One transaction", "dataset → issues → facilities, units → records (upsert on unit, year) → flags"],
    ["New data version", "Stored results from older data stop being served."],
  ];
  steps.forEach(([h, b], i) => {
    const x = 0.6 + i * (w + g);
    step(s, x, 2.2, w, 2.0, i + 1, h, b, i === 3 ? { fill: K.card, line: K.blue, lineW: 1.5 } : {});
    if (i < steps.length - 1) arrow(s, x + w, 3.2, x + w + g, 3.2);
  });
  card(s, 0.6, 4.65, 3.8, "Upsert, not reload", "ON CONFLICT (unit, year) DO UPDATE: only changed rows change.");
  card(s, 4.75, 4.65, 3.8, "Chunks of 50 rows", "SQLite caps the values one statement can bind.");
  card(s, 8.9, 4.65, 3.8, "Provenance per record", "dataset_id says which import last wrote each row.");
}

// ── 6. Indexes ───────────────────────────────────────────────────────────
{
  const s = frame("The database · indexes", "Indexes chosen from query plans", "The database", "Raaj", "Read EXPLAIN QUERY PLAN for each slow query, then add the index it needs.");
  table(s, [
    [hdr("Query"), hdr("Index"), hdr("Without"), hdr("With")],
    [strong("Each plant's CO₂ in 2024 (ranking, map)"), "annual_records (facility_id, year)", "2.67 s", { text: "3.8 ms", options: { bold: true, color: K.green } }],
    [strong("Each record's previous year (year-over-year)"), "annual_records (unit, year), unique", "33 s", { text: "50 ms", options: { bold: true, color: K.green } }],
    [strong("Every Analyze selection; CO₂ ranking"), "annual_records (year, co2_mass_tons)", "—", "range scan"],
  ], { x: 0.6, y: 2.15, w: 12.1, colW: [4.6, 4.2, 1.6, 1.7], fontSize: 14, rowH: 0.55 });
  code(s, 0.6, 4.55, 7.1, 1.95, [
    "EXPLAIN QUERY PLAN … previous-year join",
    "SEARCH a USING INDEX annual_record_year_co2_idx (year>? AND year<?)",
    "SEARCH p USING INDEX annual_record_unit_year_idx",
    "         (unit_internal_id=? AND year=?) LEFT-JOIN",
  ], 11);
  bullets(s, [
    { b: "17 indexes,", t: "each serving a query we can name." },
    { b: "The unique (unit, year) index", t: "is a rule and a join index at once." },
    { b: "Measured", t: "with sqlite3's timer on a copy with the index dropped." },
  ], 8.1, 4.55, 4.6, 2.0, 15);
}

// ── 7. Stored results ────────────────────────────────────────────────────
{
  const s = frame("The database · reading data", "Read once, then store the result", "The database", "Arnav", "A tab's views share one read; finished results live in the database itself.");
  const y = 2.25, w = 2.75, g = 0.4;
  [["Memory", "this server's last results"], ["result_cache table", "key: procedure + input JSON\nstamped with the data version"], ["Compute", "one join per selection,\nshared by every view"], ["Store", "for every later visit\nand every server"]].forEach(([h, b], i) => {
    const x = 0.6 + i * (w + g);
    node(s, x, y, w, 1.25, h, b, i === 1 ? { fill: K.card, line: K.blue, lineW: 1.5 } : {});
    if (i < 3) {
      arrow(s, x + w, y + 0.62, x + w + g, y + 0.62);
      if (i < 2) s.addText("miss", { x: x + w, y: y + 0.28, w: g, h: 0.28, fontSize: 10, color: K.muted, align: "center", margin: 0, isTextBox: true });
    }
  });
  stat(s, 0.6, 4.05, "8 ms vs 1,100 ms", "a stored result vs computing it", K.green, 3.8);
  stat(s, 4.75, 4.05, "4.4 s → 0.25 s", "Analyze on a cold server, before and after", K.green, 3.8);
  stat(s, 8.9, 4.05, "1.5 s → < 1 ms", "caching rows instead of a lazy query", K.amber, 3.8);
  s.addText([
    { text: "Never stale: ", options: { bold: true, color: K.ink } },
    { text: "every import changes the data version, so older results are never served. " },
    { text: "Shipped: ", options: { bold: true, color: K.ink } },
    { text: "npm run db:precompute refreshes them, and the read-only host serves the committed file." },
  ], { x: 0.6, y: 5.75, w: 12.1, h: 0.8, fontSize: 14, color: K.ink2, margin: 0, valign: "top", isTextBox: true });
}

// ── 8. Prediction ────────────────────────────────────────────────────────
pres.addSection({ title: "The analysis" });
{
  const s = frame("The analysis · prediction", "Predicting NOₓ on years the models never saw", "The analysis", "Raaj", "Split by year; models trained offline and stored as rows.");
  const ty = 2.2;
  const seg = [["Train 2016–2021", 25116, K.ridge, 4.6], ["Validate 2022–23", 7970, K.base, 1.9], ["Test 2024–25", 7755, K.amber, 1.9]];
  let x = 0.6;
  seg.forEach(([label, n, color, w]) => {
    s.addShape(pres.shapes.RECTANGLE, { x, y: ty, w, h: 0.55, fill: { color }, line: { color: K.bg, width: 2 } });
    s.addText(label, { x, y: ty, w, h: 0.55, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText(`${n.toLocaleString("en-US")} unit-years`, { x, y: ty + 0.6, w, h: 0.3, fontSize: 11, color: K.muted, align: "center", margin: 0, isTextBox: true });
    x += w;
  });
  caption(s, "tune on validation → refit on 2016–2023 → score once on test", 0.6, ty + 0.98, 8.4);
  bullets(s, [
    { b: "Target:", t: "a unit's yearly NOₓ, in short tons.", sub: "NOₓ depends on controls; CO₂ is nearly fuel × a constant" },
    { b: "No leakage:", t: "no same-year NOₓ or anything computed from it." },
    { b: "Stored as rows:", t: "each model is JSON in the models table.", sub: "replayed in the browser; matches scikit-learn to 10⁻⁶" },
  ], 0.6, 3.65, 8.4, 3.0, 15);
  [["Baseline", "median by fuel and unit type", K.base], ["Ridge regression", "log target, α = 10", K.ridge], ["Decision tree", "depth ≤ 20, leaf ≥ 20", K.tree], ["Persistence (reference)", "last year's rate × this year's fuel", K.persist]].forEach(([h, t, c], i) => {
    const yy = 2.2 + i * 1.08;
    s.addShape(pres.shapes.OVAL, { x: 9.45, y: yy + 0.1, w: 0.22, h: 0.22, fill: { color: c }, line: { color: c } });
    s.addText([{ text: h, options: { bold: true, fontSize: 15, color: K.ink, breakLine: true } }, { text: t, options: { fontSize: 12, color: K.muted } }], { x: 9.85, y: yy, w: 3.0, h: 0.8, margin: 0, valign: "top", isTextBox: true });
  });
}

// ── 9. Demo overview ────────────────────────────────────────────────────
pres.addSection({ title: "Demo" });
{
  const s = frame("Demo", "Eight steps, four questions", "Demo", "Arnav", "One plant ties them together: Ghent, Kentucky.");
  const steps = [
    ["Build a dataset", "Filters as a sentence"], ["CO₂ trend by fuel", "Visualization 1 · Q1"], ["NOₓ rate by fuel", "Visualization 2 · statistics"], ["SCR vs no control", "Comparison · Q2"],
    ["TRACI impacts", "Impacts · Q3"], ["Models vs baseline", "Prediction · Q4"], ["Sensitivity", "One input varied"], ["What-if and export", "Scenarios · ZIP"],
  ];
  steps.forEach(([h, t], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 0.6 + col * 3.1, y = 2.2 + row * 1.75;
    s.addShape(pres.shapes.LINE, { x, y, w: 2.8, h: 0, line: { color: K.rule, width: 0.75 } });
    s.addShape(pres.shapes.OVAL, { x, y: y + 0.2, w: 0.42, h: 0.42, fill: { color: K.paper }, line: { color: K.rule, width: 1 } });
    s.addText(String(i + 1), { x, y: y + 0.2, w: 0.42, h: 0.42, fontSize: 13, bold: true, color: K.ink, align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText(h, { x, y: y + 0.75, w: 2.8, h: 0.38, fontSize: 16, bold: true, color: K.ink, margin: 0, isTextBox: true });
    s.addText(t, { x, y: y + 1.13, w: 2.8, h: 0.3, fontSize: 12, color: K.muted, margin: 0, isTextBox: true });
  });
  s.addText([{ text: "Ghent: ", options: { bold: true } }, { text: "Kentucky's largest coal emitter in step 1, the TRACI example checked by hand in step 5, and the unit we change in steps 7–8." }],
    { x: 0.6, y: 5.95, w: 12.1, h: 0.6, fontSize: 15, color: K.ink, margin: 0, valign: "top", isTextBox: true });
}

// ── Demo steps ───────────────────────────────────────────────────────────
const kicker = (n, what) => `Demo · step ${n} of 8 · ${what}`;

// 10. Step 1
{
  const s = frame(kicker(1, "build a dataset"), "Filters from a sentence", "Demo", "Arnav", "“coal units in Kentucky” becomes two filter chips.");
  bullets(s, [
    { b: "Chips:", t: "State KY · Fuel Coal.", sub: "plus the defaults: 2015–2025, units that ran" },
    { b: "358 unit-years,", t: "17 plants, 46 units." },
    { b: "CO₂ fell 30 %", t: "(76.5M → 53.7M t).", sub: "Ghent alone is 20 %" },
    { b: "Data quality", t: "says why values are missing." },
    { b: "The URL is the analysis:", t: "reload it or share it." },
  ], 0.6, 2.15, 5.2, 4.6, 16);
  shot(s, img("kycoal"), 6.2, 2.15, 6.5, 4.5, "right");
}

// 11. Step 2
{
  const s = frame(kicker(2, "visualization 1 · Q1"), "Gas overtook coal in 2023; coal came back in 2025", "Demo", "Arnav", "CO₂ mass by year, one line per fuel class.");
  shot(s, fig("p2-trend"), 0.6, 2.0, 12.1, 3.2, "center");
  stat(s, 0.6, 5.4, "−22 %", "all CO₂, 2015 → 2025 (2.10B → 1.64B t)", K.ink, 2.8);
  stat(s, 3.7, 5.4, "798 vs 760M", "gas vs coal CO₂ in 2023", K.ink, 2.8);
  stat(s, 6.8, 5.4, "≈ 2,040", "coal lb CO₂/MWh, flat all decade", K.amber, 2.8);
  s.addText([{ text: "So: ", options: { bold: true } }, { text: "coal didn't get cleaner; power moved from coal to gas." }],
    { x: 9.9, y: 5.4, w: 2.85, h: 1.3, fontSize: 13, color: K.ink2, margin: 0, valign: "top", isTextBox: true });
}

// 12. Step 3
{
  const s = frame(kicker(3, "visualization 2 · statistics"), "NOₓ rate by fuel: typical values differ 17-fold", "Demo", "Arnav", "A box plot per fuel, on a log scale, with a key for reading a box.");
  shot(s, fig("p2-box"), 0.6, 2.0, 12.1, 3.3, "center");
  stat(s, 0.6, 5.5, "0.034", "gas median, lb/MMBtu", K.ink, 2.3);
  stat(s, 3.1, 5.5, "0.136", "coal median", K.ink, 2.3);
  stat(s, 5.6, 5.5, "0.574", "oil median", K.ink, 2.3);
  s.addText([{ text: "Median, not mean: ", options: { bold: true } }, { text: "the average is 2.5× the median because a few huge values pull it up; 3,178 unit-years (7 %) are unusually large." }],
    { x: 8.2, y: 5.5, w: 4.55, h: 1.3, fontSize: 12, color: K.ink2, margin: 0, valign: "top", isTextBox: true });
}

// 13. Step 4
{
  const s = frame(kicker(4, "comparison · Q2"), "SCR units emit NOₓ at a fraction of the rate", "Demo", "Arnav", "Compare groups: SCR vs no NOₓ control, 2015–2025.");
  bullets(s, [
    { b: "Pooled:", t: "0.1746 vs 0.0495 lb/MMBtu.", sub: "no control is 252.6 % higher" },
    { b: "Per unit-year:", t: "0.4767 vs 0.03446 on average.", sub: "13.83 times as much" },
    { b: "Not chance:", t: "both tests give p < 0.001." },
    { b: "Association, not effect:", t: "the fleets differ in fuel, size, hours." },
  ], 0.6, 2.15, 4.9, 4.6, 16);
  shot(s, img("compare-all"), 5.85, 2.15, 6.85, 3.0, "right");
  stat(s, 5.85, 5.35, "+252.6 %", "no-control rate vs SCR, pooled", K.amber, 3.2);
  stat(s, 9.4, 5.35, "p < 0.001", "Welch t and Mann–Whitney U", K.ink, 3.3);
}

// 14. Step 5
{
  const s = frame(kicker(5, "TRACI impacts · Q3"), "Texas leads in total; Nebraska per MWh", "Demo", "Raaj", "2024, by state. Totals show where; per MWh shows how dirty each MWh is.");
  shot(s, img("impacts-mwh"), 0.6, 2.05, 7.3, 3.2, "left");
  caption(s, "Per MWh of power, 2024", 0.6, 5.3, 7.3);
  bullets(s, [
    { b: "Total:", t: "Texas leads all four categories." },
    { b: "Per MWh (acidification):", t: "NE 2.322, ND 1.83, MO 1.569 kg SO₂ eq." },
    { b: "Impact = kg × TRACI factor,", t: "summed within one category.", sub: "six factors, stored as rows; NOₓ → nitrogen oxides" },
  ], 8.3, 2.1, 4.45, 3.2, 15);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 5.7, w: 12.1, h: 1.1, rectRadius: 0.06, fill: { color: K.paper }, line: { color: K.rule, width: 1 } });
  s.addText([
    { text: "Ghent, 2024, by hand:  ", options: { bold: true, color: K.ink } },
    { text: "(9,157.169 t SO₂ × 1 + 6,987.671 t NOₓ × 0.7) × 907.18474 = 12,744,620 kg SO₂ eq", options: { fontFace: MONO, color: K.ink2 } },
    { text: "\n÷ 11,580,029 MWh = 1.101 kg SO₂ eq/MWh. The page shows 12.74M and 1.101.", options: { color: K.ink2 } },
  ], { x: 0.85, y: 5.7, w: 11.7, h: 1.1, fontSize: 14, margin: 0, valign: "middle", isTextBox: true });
}

// 15. Step 6
{
  const s = frame(kicker(6, "prediction · Q4"), "The tree beats the baseline; persistence beats both", "Demo", "Raaj", "Error per unit-year on 2024–25, years no model saw.");
  s.addText("Mean absolute error per unit-year (short tons NOx)", { x: 0.6, y: 2.1, w: 6.4, h: 0.35, fontSize: 13, bold: true, color: K.ink, margin: 0, isTextBox: true });
  const maes = [["Baseline (median)", 109.4, K.base], ["Ridge regression", 58.5, K.ridge], ["Decision tree", 26.3, K.tree], ["Persistence (reference)", 18.5, K.persist]];
  maes.forEach(([label, v, color], i) => {
    const y = 2.6 + i * 0.68;
    s.addText(label, { x: 0.6, y, w: 2.25, h: 0.48, fontSize: 13, color: K.ink2, align: "right", valign: "middle", margin: 0, isTextBox: true });
    const w = (v / 109.4) * 3.3;
    s.addShape(pres.shapes.RECTANGLE, { x: 3.0, y: y + 0.06, w, h: 0.36, fill: { color }, line: { color } });
    s.addText(`${v.toFixed(1)} t`, { x: 3.0 + w + 0.1, y, w: 1.0, h: 0.48, fontSize: 13, bold: true, color: K.ink, valign: "middle", margin: 0, isTextBox: true });
  });
  s.addShape(pres.shapes.LINE, { x: 3.0, y: 2.55, w: 0, h: 2.75, line: { color: K.rule, width: 0.75 } });
  stat(s, 0.6, 5.55, "R² 0.951", "tree (95 % interval 0.937–0.963)", K.ink, 6.2);
  bullets(s, [
    { b: "Tree:", t: "76 % less error than the baseline.", sub: "training, validation, and test agree" },
    { b: "Persistence wins:", t: "last year's rate × this year's fuel." },
    { b: "Coal has the largest errors;", t: "the models under-predict it." },
    { b: "So the models are for", t: "what-if, not the best forecast." },
  ], 7.3, 2.15, 5.45, 4.6, 15);
}

// 16. Step 7
{
  const s = frame(kicker(7, "sensitivity"), "Ghent unit 2: change heat input, hold the rest", "Demo", "Arnav", "± 50 % heat input; every other input stays as reported.");
  shot(s, fig("p2-sensitivity"), 0.6, 2.05, 7.6, 4.7, "left");
  bullets(s, [
    { b: "Reported 4,146 t;", t: "Ridge 2,972, tree 2,738.", sub: "the rate jumped; the models see last year's" },
    { b: "−50 % fuel:", t: "Ridge −35 %, tree −57 %." },
    { b: "+50 % fuel:", t: "both +29 %." },
    { b: "The tree is a staircase:", t: "8 thresholds in this range." },
    { b: "Shaded:", t: "values the models never saw." },
  ], 8.55, 2.1, 4.2, 4.6, 14);
}

// 17. Step 8
{
  const s = frame(kicker(8, "what-if · export"), "The models agree on fuel use, not on controls", "Demo", "Raaj", "“What if Ghent unit 2 added SCR in 2024?”, then every other change.");
  s.addText("Predicted NOx, Ghent unit 2, 2024 (short tons): as it is → with SCR", { x: 0.6, y: 2.05, w: 7.6, h: 0.32, fontSize: 13, bold: true, color: K.ink, margin: 0, isTextBox: true });
  const X0 = 2.2, PX = 5.6 / 4500, xs = (v) => X0 + v * PX;
  [0, 1500, 3000, 4500].forEach((v) => {
    s.addShape(pres.shapes.LINE, { x: xs(v), y: 2.55, w: 0, h: 1.75, line: { color: K.rule, width: 0.5 } });
    s.addText(v.toLocaleString("en-US"), { x: xs(v) - 0.4, y: 4.3, w: 0.8, h: 0.25, fontSize: 10, color: K.muted, align: "center", margin: 0, isTextBox: true });
  });
  s.addShape(pres.shapes.LINE, { x: xs(4146), y: 2.5, w: 0, h: 1.8, line: { color: K.ink, width: 1, dashType: "dash" } });
  s.addText("reported 4,146", { x: xs(4146) - 0.6, y: 4.55, w: 1.2, h: 0.25, fontSize: 10, color: K.ink2, align: "center", margin: 0, isTextBox: true });
  [["Ridge", 2972, 1222, K.ridge, "2,972 → 1,222  (−59 %)"], ["Tree", 2738, 2738, K.tree, "2,738 either way"]].forEach(([name, a, b, c, lbl], i) => {
    const y = 2.85 + i * 0.75;
    s.addText(name, { x: 0.6, y: y - 0.2, w: 1.45, h: 0.4, fontSize: 14, bold: true, color: K.ink, align: "right", valign: "middle", margin: 0, isTextBox: true });
    if (a !== b) s.addShape(pres.shapes.LINE, { x: xs(b), y, w: xs(a) - xs(b), h: 0, flipH: true, line: { color: c, width: 2.5, endArrowType: "triangle" } });
    s.addShape(pres.shapes.OVAL, { x: xs(a) - 0.08, y: y - 0.08, w: 0.16, h: 0.16, fill: { color: c }, line: { color: c } });
    s.addText(lbl, { x: xs(Math.min(a, b)) - 2.6, y: y + 0.08, w: 2.5, h: 0.3, fontSize: 11, color: K.ink2, align: "right", margin: 0, isTextBox: true });
  });
  table(s, [
    [hdr("Change"), hdr("Ridge"), hdr("Tree")],
    ["Add SCR", "−58.9 %", "0.0 %"],
    ["Switch to gas", "−68.8 %", "0.0 %"],
    ["5 % less fuel", "−3.2 %", "−9.1 %"],
    ["Run 10 % more", "+6.2 %", "+10.1 %"],
  ], { x: 0.6, y: 5.0, w: 7.6, colW: [3.6, 2.0, 2.0], fontSize: 12, rowH: 0.3 });
  bullets(s, [
    { b: "Ridge: −59 % (1.7K t),", t: "far above its 58 t typical miss." },
    { b: "The tree doesn't move:", t: "none of its questions here is about SCR." },
    { b: "For scale:", t: "5 % of Kentucky's power-plant NOₓ." },
    { b: "Download:", t: "CSV, PNG, and metadata.json.", sub: "model, inputs, split years, commit, database snapshot" },
  ], 8.55, 2.1, 4.2, 4.7, 14);
}

// ── 18. Limitations ──────────────────────────────────────────────────────
pres.addSection({ title: "Wrap-up" });
{
  const s = frame("Wrap-up", "What these results don't show", "Wrap-up", "Arnav", "Each one is said on the page where it applies.");
  const cells = [
    ["Potential, not actual harm", "TRACI ignores stack height, weather, and who lives nearby. Three pollutants only."],
    ["Associations, not effects", "SCR vs none compares different fleets; what-if moves one input at a time."],
    ["Optimistic p-values", "The same unit appears in many years; the tests treat unit-years as independent."],
    ["Persistence beats the models", "Last year's rate × this year's fuel forecasts better; the models are for what-if."],
    ["Fuel is per unit, not per year", "A unit that switched from coal to gas counts as gas in every year."],
    ["Missing pollutants drop categories", "13.7 % lack CO₂, 10.8 % SO₂; groups sum only complete unit-years."],
  ];
  cells.forEach(([h, t], i) => card(s, 0.6 + (i % 3) * 4.1, 2.15 + Math.floor(i / 3) * 2.3, 3.8, h, t));
}

// ── 19. The main bugs ────────────────────────────────────────────────────
{
  const s = frame("Wrap-up", "The main bugs", "Wrap-up", "Raaj", "Most were in the database; each has its fix.");
  const cells = [
    ["A missing index", "The previous-year join took 33 s.", "Fix", "unique (unit, year) index: 50 ms"],
    ["A cache that didn't cache", "Drizzle queries are lazy: 1.5 s per view.", "Fix", "cache the finished rows: < 1 ms"],
    ["A read-only, cold host", "Each Vercel instance starts empty and can't write.", "Fix", "results stored in the committed file"],
    ["NOₓ vs NO₂ in TRACI", "Both are listed, with smog factors 24.79 vs 16.85.", "Fix", "read the workbook; map exactly"],
  ];
  cells.forEach(([h, t, tag, fix], i) => card(s, 0.6 + (i % 2) * 6.2, 2.15 + Math.floor(i / 2) * 2.3, 5.9, h, t, tag, fix));
}

// ── 20. Questions ────────────────────────────────────────────────────────
{
  const s = frame("Thank you", "Questions?", "Wrap-up", "Raaj + Arnav");
  s.addText("What we found", { x: 0.6, y: 1.95, w: 6, h: 0.4, fontSize: 18, bold: true, color: K.ink, margin: 0, isTextBox: true });
  [["Q1 Trends", "CO₂ fell 22 %; coal's intensity stayed flat, so the mix shifted to gas"],
   ["Q2 Controls", "uncontrolled units: a 252.6 % higher NOₓ rate than SCR units"],
   ["Q3 Impacts", "Texas leads in total; Nebraska, North Dakota, Missouri per MWh"],
   ["Q4 Prediction", "the tree cuts the baseline's error 76 %; persistence still forecasts best"]].forEach(([h, t], i) => {
    s.addText([{ text: h, options: { bold: true, color: K.ink, breakLine: true } }, { text: t, options: { color: K.muted, fontSize: 13 } }], { x: 0.6, y: 2.5 + i * 0.85, w: 6.2, h: 0.8, fontSize: 15, margin: 0, valign: "top", isTextBox: true });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.4, y: 1.95, w: 5.3, h: 2.55, rectRadius: 0.06, fill: { color: K.paper }, line: { color: K.rule, width: 1 } });
  s.addText([
    { text: "Raaj", options: { bold: true, color: K.ink, breakLine: true } },
    { text: "schema, indexes, imports, stored results, statistics, TRACI, models, report", options: { color: K.ink2, fontSize: 13, breakLine: true } },
    { text: " ", options: { fontSize: 6, breakLine: true } },
    { text: "Arnav", options: { bold: true, color: K.ink, breakLine: true } },
    { text: "Analyze and Predict pages, charts, zoom and export, filter chips, readings, this deck", options: { color: K.ink2, fontSize: 13, breakLine: true } },
    { text: " ", options: { fontSize: 6, breakLine: true } },
    { text: "Together: ", options: { bold: true, color: K.ink } },
    { text: "the questions, testing, the demo, documentation", options: { color: K.ink2, fontSize: 13 } },
  ], { x: 7.65, y: 2.1, w: 4.8, h: 2.5, fontSize: 15, margin: 0, valign: "top", isTextBox: true });
  s.addImage({ path: img("leaf").replace(/\.jpg$/, ".png"), x: 7.4, y: 4.75, w: 0.34, h: 0.34, altText: "epaData leaf icon" });
  s.addText("github.com/raajbanga/epaData", { x: 7.86, y: 4.73, w: 4.8, h: 0.38, fontFace: MONO, fontSize: 14, bold: true, color: K.ink, margin: 0, valign: "middle", hyperlink: { url: "https://github.com/raajbanga/epaData" }, isTextBox: true });
  code(s, 7.4, 5.27, 5.3, 0, ["$ npm install && npm run build && npm start", "$ npm test", "$ npm run ml:train      # retrain models", "$ npm run db:precompute # refresh stored results"], 11);
  s.addText("Live: epadata.vercel.app · every step in README.md", { x: 0.6, y: 6.1, w: 6.5, h: 0.4, fontSize: 12, italic: true, color: K.muted, margin: 0, isTextBox: true });
}

// ── Speaker notes: generated from slides-outline.md, so they always match ──
// Each "### N. Title — Speaker (time)" section becomes slide N's notes, in plain text (Markdown
// marks removed, bullets and steps kept).
{
  const md = fs.readFileSync(path.join(HERE, "slides-outline.md"), "utf8");
  const sections = new Map();
  let cur = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^### (\d+)\. (.*)$/);
    if (h) { cur = { n: Number(h[1]), lines: [`${h[1]}. ${h[2]}`, ""] }; sections.set(cur.n, cur); continue; }
    if (/^#{1,2} /.test(line)) { cur = null; continue; }
    if (!cur) continue;
    if (/^\*\*Likely questions/.test(line)) { cur.lines.push("", "Likely questions:"); continue; }
    if (/^\s*\|[-| ]+\|$/.test(line)) continue;
    const row = line.match(/^\s*\| (.+?) \|(.+)\|$/);
    if (row) {
      const cells = row[2].split("|").map((c) => c.trim());
      if (!/^(Question|Change)$/.test(row[1])) cur.lines.push(`- ${row[1]}: ${cells.join(", ")}`);
      continue;
    }
    // A hard-wrapped continuation (indented, not a new bullet or step) joins the line above.
    const prev = cur.lines.length - 1;
    if (/^\s+\S/.test(line) && !/^\s*(- |\d+\. )/.test(line) && cur.lines[prev].trim()) cur.lines[prev] += " " + line.trim();
    else cur.lines.push(line);
  }
  const plainText = (s) => s
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/(^|\W)_(.+?)_(?=\W|$)/g, "$1$2")
    .replace(/^(\s*)- /, "$1• ").replace(/^(\s{2,})• /, "$1– ");
  const slides = pres._slides;
  if (slides.length !== sections.size) throw new Error(`${slides.length} slides but ${sections.size} script sections`);
  slides.forEach((slide, i) => {
    const sec = sections.get(i + 1);
    if (!sec) throw new Error(`no script section for slide ${i + 1}`);
    slide.addNotes(sec.lines.map(plainText).join("\n").replace(/\n{3,}/g, "\n\n").trim());
  });
}

pres.writeFile({ fileName: OUT }).then(() => console.log("wrote", OUT));
