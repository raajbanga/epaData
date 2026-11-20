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
  s.addText("epaData", { x: 0.6, y: 1.6, w: 5.6, h: 1.1, fontSize: 54, bold: true, color: K.ink, margin: 0, isTextBox: true });
  s.addText("Phase 2: analysis, impact factors, and prediction over an EPA emissions database", {
    x: 0.6, y: 2.75, w: 5.5, h: 1.0, fontSize: 18, color: K.ink2, margin: 0, valign: "top", isTextBox: true,
  });
  [["RB", "Raaj Banga", "Back end and database", 4.15], ["AB", "Arnav Bawankule", "Front end and charts", 4.9]].forEach(([ini, name, role, y]) => {
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
  stat(s, 10.25, 4.15, "3 new tables", "traci_factors · models · result_cache", K.amber);
}

// ── 3. What Phase 2 added ────────────────────────────────────────────────
pres.addSection({ title: "What Phase 2 added" });
{
  const s = frame("Phase 2 · architecture", "What Phase 2 added", "What Phase 2 added", "Raaj", "Phase 1's tables stay as they are; Phase 2 reads them and adds three of its own.");
  node(s, 0.6, 2.15, 3.3, 3.3, "Kept from Phase 1", "core tables and their keys\n17 indexes\nRetrieve and Upload\none-transaction imports\nread-only host on Vercel", { dash: "dash", bodySize: 13, headSize: 15 });
  const blue = { line: K.blue, lineW: 1.75 };
  node(s, 4.3, 2.15, 2.5, 1.2, "Core tables", "facilities · units\nannual_records", { dash: "dash" });
  node(s, 7.2, 2.15, 2.7, 1.2, "Analysis query", "one join per selection\n(slide 5)", blue);
  node(s, 10.3, 2.15, 2.4, 1.2, "Analyze · Predict", "statistics, TRACI, models;\nexports with provenance", blue);
  node(s, 4.3, 4.25, 2.5, 1.2, "Offline scripts", "ml/train.py\nimport_traci · db:precompute", { ...blue, bodyMono: true, bodySize: 10 });
  node(s, 7.2, 4.25, 2.7, 1.2, "Three new tables", "traci_factors · models\nresult_cache (slide 4)", { ...blue, fill: K.card });
  arrow(s, 6.8, 2.75, 7.2, 2.75);
  arrow(s, 9.9, 2.75, 10.3, 2.75);
  arrow(s, 6.8, 4.85, 7.2, 4.85);
  arrow(s, 8.55, 4.25, 8.55, 3.35);
  arrow(s, 9.9, 4.85, 11.5, 4.85);
  arrow(s, 11.5, 4.85, 11.5, 3.35);
  s.addShape(pres.shapes.LINE, { x: 0.6, y: 5.95, w: 0.5, h: 0, line: { color: K.blue, width: 1.75 } });
  s.addText("New in Phase 2. Everything is still one SQLite file, so the hosted copy needs no other service.", { x: 1.25, y: 5.8, w: 11.4, h: 0.3, fontSize: 14, color: K.ink2, margin: 0, valign: "middle", isTextBox: true });
}

// ── 4. Three new tables ──────────────────────────────────────────────────
{
  const s = frame("Phase 2 · schema", "Three new tables", "What Phase 2 added", "Raaj", "Each is written by one script and read by the app, so the hosted copy never writes.");
  [
    ["traci_factors", "6 rows", ["traci_version · pollutant · medium", "impact_category · factor", "factor_unit · substance · cas", "source"], "UNIQUE (version, pollutant, medium, category)", "Factors are data", "A new TRACI version is new rows, not new code. source names the workbook column."],
    ["models", "3 rows", ["id · kind · target · features", "params · metrics", "train / validation / test years", "artifact (JSON) · pipeline_version"], "PK id: nox-baseline, nox-ridge, nox-tree", "Models are rows", "The app replays the JSON in TypeScript, so What-if runs on the read-only host."],
    ["result_cache", "90 rows · 3.8 MB", ["key · procedure · input", "data_version", "value (SuperJSON)", "computed_at"], "PK key = procedure + sorted input JSON", "Results are versioned", "Every import changes data_version, so an old result is never served."],
  ].forEach(([name, n, cols, key, why, text], i) => {
    const x = 0.6 + i * 4.1, w = 3.8;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.15, w, h: 1.78, rectRadius: 0.05, fill: { color: K.paper }, line: { color: K.blue, width: 1.5 } });
    s.addText([
      { text: name, options: { bold: true, fontFace: MONO, fontSize: 15, color: K.ink } },
      { text: `  ${n}`, options: { fontSize: 12, color: K.muted, breakLine: true } },
      ...cols.map((c) => ({ text: c, options: { fontFace: MONO, fontSize: 11, color: K.ink2, breakLine: true } })),
      { text: key, options: { fontSize: 11, bold: true, color: K.blue } },
    ], { x: x + 0.18, y: 2.27, w: w - 0.3, h: 1.6, margin: 0, valign: "top", paraSpaceAfter: 3, isTextBox: true });
    card(s, x, 4.3, w, why, text);
  });
}

// ── 5. One query per selection ───────────────────────────────────────────
{
  const s = frame("Phase 2 · queries", "One query per selection", "What Phase 2 added", "Raaj", "Every Analyze view starts from one join, served by indexes Phase 1 already had.");
  const h = code(s, 0.6, 2.15, 7.3, 0, [
    "SELECT r.*, u.primary_fuel, u.unit_type, f.state_code,",
    "       p.nox_mass_tons AS prev_nox, …",
    "FROM annual_records r",
    "JOIN units u      ON u.id = r.unit_internal_id",
    "JOIN facilities f ON f.id = r.facility_id",
    "LEFT JOIN annual_records p",
    "  ON p.unit_internal_id = r.unit_internal_id",
    " AND p.year = r.year - 1",
    "WHERE <Explore's filters, including Top N>",
  ], 12);
  caption(s, "EXPLAIN QUERY PLAN", 0.6, 2.15 + h + 0.12, 7.3);
  code(s, 0.6, 2.15 + h + 0.45, 7.3, 0, [
    "SEARCH r USING INDEX annual_record_year_co2_idx (year>? AND year<?)",
    "SEARCH p USING INDEX annual_record_unit_year_idx (unit_internal_id=? AND year=?)",
  ], 10);
  stat(s, 8.3, 2.15, "33 s → 50 ms", "previous-year join, without and with the unique (unit, year) index", K.green, 4.4);
  stat(s, 8.3, 3.75, "1.5 s → < 1 ms", "per view: caching the finished rows, not the lazy query", K.green, 4.4);
  bullets(s, [
    { b: "Same WHERE as Explore:", t: "every filter and Top N mean the same on every page." },
    { b: "Previous year", t: "gives the 8 year-over-year variables." },
  ], 8.3, 5.35, 4.4, 1.3, 14);
}

// ── 6. Stored results ────────────────────────────────────────────────────
{
  const s = frame("Phase 2 · stored results", "Store the result in the database", "What Phase 2 added", "Arnav", "Each server starts empty on Vercel, so finished results live in the database itself.");
  const y = 2.25, w = 2.75, g = 0.4;
  [["Memory", "this server's last results"], ["result_cache table", "key: procedure + input JSON\nstamped with the data version"], ["Compute", "one query per selection\n(slide 5)"], ["Store", "for every later visit\nand every server"]].forEach(([h, b], i) => {
    const x = 0.6 + i * (w + g);
    node(s, x, y, w, 1.25, h, b, i === 1 ? { fill: K.card, line: K.blue, lineW: 1.5 } : {});
    if (i < 3) {
      arrow(s, x + w, y + 0.62, x + w + g, y + 0.62);
      if (i < 2) s.addText("miss", { x: x + w, y: y + 0.28, w: g, h: 0.28, fontSize: 10, color: K.muted, align: "center", margin: 0, isTextBox: true });
    }
  });
  stat(s, 0.6, 4.05, "8 ms vs 1,100 ms", "a stored result vs computing it", K.green, 3.8);
  stat(s, 4.75, 4.05, "4.4 s → 0.25 s", "Analyze on a cold server, before and after", K.green, 3.8);
  stat(s, 8.9, 4.05, "90 results", "3.8 MB, shipped in the committed file", K.ink, 3.8);
  s.addText([
    { text: "Never stale: ", options: { bold: true, color: K.ink } },
    { text: "every import changes the data version, so older results are never served. " },
    { text: "Shipped: ", options: { bold: true, color: K.ink } },
    { text: "npm run db:precompute refreshes them before each deploy." },
  ], { x: 0.6, y: 5.75, w: 12.1, h: 0.8, fontSize: 14, color: K.ink2, margin: 0, valign: "top", isTextBox: true });
}

// ── 7. TRACI factors ─────────────────────────────────────────────────────
pres.addSection({ title: "Impacts and models" });
{
  const s = frame("Phase 2 · TRACI 2.2", "Six TRACI factors, read from a table", "Impacts and models", "Raaj", "CAMPD measures three pollutants; we use every TRACI 2.2 air factor for those three.");
  const d = { text: "—", options: { color: K.muted } };
  table(s, [
    [hdr("Per kg to air"), hdr("Warming\nkg CO₂ eq"), hdr("Acidification\nkg SO₂ eq"), hdr("Particulate\nkg PM2.5 eq"), hdr("Smog\nkg O₃ eq")],
    [strong("CO₂  (co2_mass_tons)"), "1", d, d, d],
    [strong("SO₂  (so2_mass_tons)"), d, "1", "0.0611", d],
    [strong("NOₓ  (nox_mass_tons)"), d, "0.7", "0.00722", "24.79"],
  ], { x: 0.6, y: 2.15, w: 7.3, colW: [2.5, 1.15, 1.25, 1.25, 1.15], fontSize: 13, rowH: [0.6, 0.42, 0.42, 0.42] });
  caption(s, "EPA TRACI 2.2 workbook, Substances sheet; each row's source cell is stored with it", 0.6, 4.05, 7.3);
  const y = 4.65, w = 1.62, g = 0.3;
  [["annual_records", "mass, short tons"], ["× 907.18474", "kg per short ton"], ["× factor", "a traci_factors row"], ["Σ per category", "4 totals"]].forEach(([h, b], i) => {
    const x = 0.6 + i * (w + g);
    node(s, x, y, w, 0.95, h, b, { headSize: 12, bodySize: 10, ...(i === 3 ? { line: K.amber, lineW: 1.5 } : {}) });
    if (i < 3) arrow(s, x + w, y + 0.47, x + w + g, y + 0.47);
  });
  s.addText("÷ gross load gives 4 more per MWh: 8 TRACI variables, built from the rows at startup.", { x: 0.6, y: 5.75, w: 7.3, h: 0.6, fontSize: 13, color: K.ink2, margin: 0, valign: "top", isTextBox: true });
  bullets(s, [
    { b: "Only what CAMPD measures:", t: "CO₂, SO₂, and NOₓ mass to air." },
    { b: "Every non-empty factor", t: "for those three.", sub: "CO₂: warming only; SO₂: no smog factor" },
    { b: "Matched by exact substance:", t: "NITROGEN OXIDES, not NITROGEN DIOXIDE.", sub: "smog 24.79 vs 16.85 kg O₃ eq per kg" },
    { b: "No factor in the code:", t: "a new TRACI version is new rows." },
    { b: "A missing pollutant", t: "leaves its categories missing, never 0." },
  ], 8.3, 2.15, 4.45, 4.6, 15);
}

// ── 8. Data split ────────────────────────────────────────────────────────
{
  const s = frame("Phase 2 · prediction", "Splitting the data by year", "Impacts and models", "Arnav", "Train on earlier years, tune on the next two, and score once on the newest two.");
  const yrs = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const cw = 12.1 / yrs.length;
  const role = (y) => (y === 2015 || y === 2026 ? null : y <= 2021 ? K.ridge : y <= 2023 ? K.base : K.amber);
  yrs.forEach((yr, i) => {
    const c = role(yr);
    s.addShape(pres.shapes.RECTANGLE, { x: 0.6 + i * cw, y: 2.15, w: cw, h: 0.5, fill: { color: c ?? K.card }, line: { color: K.bg, width: 2 } });
    s.addText(String(yr), { x: 0.6 + i * cw, y: 2.15, w: cw, h: 0.5, fontSize: 13, bold: !!c, color: c ? "FFFFFF" : K.muted, align: "center", valign: "middle", margin: 0, isTextBox: true });
  });
  [[0, 1, "previous year only"], [1, 6, "Train · 25,116 unit-years"], [7, 2, "Validate · 7,970"], [9, 2, "Test · 7,755"], [11, 1, "partial year"]].forEach(([i, n, t]) =>
    s.addText(t, { x: 0.6 + i * cw, y: 2.7, w: n * cw, h: 0.3, fontSize: 12, bold: n > 1, color: n > 1 ? K.ink : K.muted, align: "center", margin: 0, isTextBox: true }));
  const sw = 3.85, sg = 0.275;
  [["Tune", "Fit on 2016–21; pick settings by error on 2022–23. Ridge: 5 strengths; tree: 27 sizes."], ["Refit", "Fit the chosen settings again on 2016–23, so the models use the newest training data."], ["Score once", "On 2024–25. 95 % intervals resample whole units, since a unit's two years aren't independent."]].forEach(([h, b], i) => {
    const x = 0.6 + i * (sw + sg);
    step(s, x, 3.3, sw, 1.45, i + 1, h, b, i === 2 ? { line: K.amber, lineW: 1.5 } : {});
    if (i < 2) arrow(s, x + sw, 4.02, x + sw + sg, 4.02);
  });
  card(s, 0.6, 5.1, 3.85, "Why by year, not at random", "A random split trains on a unit's 2025 and tests on its 2024: scores look better than they are.");
  card(s, 4.725, 5.1, 3.85, "Why 2016 to 2025", "2016 is the first year with a previous year, an input; 2026 isn't finished.");
  card(s, 8.85, 5.1, 3.85, "Why two years each", "About 7,800 unit-years each, and more than one year's conditions.");
}

// ── 9. Models ────────────────────────────────────────────────────────────
{
  const s = frame("Phase 2 · prediction", "Three models, chosen on the validation years", "Impacts and models", "Raaj", "Target: a unit's NOₓ for the year, in short tons. Nothing computed from this year's NOₓ is an input.");
  bullets(s, [
    { b: "This year's activity:", t: "heat input, gross load, hours." },
    { b: "The unit:", t: "capacity, age, fuel, type, and 5 controls.", sub: "SCR, SNCR, low-NOₓ burner, injection, overfire air" },
    { b: "Last year:", t: "NOₓ rate and hours.", sub: "known in advance, so allowed" },
  ], 0.6, 2.15, 4.6, 3.2, 15);
  table(s, [
    [hdr("Model"), hdr("Settings searched"), hdr("Chosen"), hdr("Validation error")],
    [strong("Baseline"), "median by fuel and unit type", "—", "114.2 t"],
    [strong("Ridge regression"), "strength 0.01 to 100, on log tons", "10", "57.9 t"],
    [strong("Decision tree"), "depth 4 to 24 or none × leaf 5, 20, 50", "20 × 20", { text: "26.5 t", options: { bold: true, color: K.green } }],
    [{ text: "Persistence (reference)", options: { color: K.muted } }, "last year's rate × this year's fuel", "—", "18.7 t"],
  ], { x: 5.5, y: 2.15, w: 7.2, colW: [1.95, 2.85, 0.9, 1.5], fontSize: 12, rowH: 0.45 });
  stat(s, 0.6, 5.2, "26.5 → 63.2 t", "tree's validation error without this year's activity", K.amber, 3.9);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.5, y: 5.2, w: 7.2, h: 1.3, rectRadius: 0.06, fill: { color: K.paper }, line: { color: K.blue, width: 1.5 } });
  s.addText([
    { text: "Stored as rows. ", options: { bold: true, color: K.ink } },
    { text: "ml/train.py writes each model's preprocessing and coefficients or tree as JSON in models.artifact. The app replays it in TypeScript; a test matches scikit-learn on 200 rows to 10⁻⁶." },
  ], { x: 5.75, y: 5.2, w: 6.8, h: 1.3, fontSize: 13, color: K.ink2, margin: 0, valign: "middle", isTextBox: true });
}

// ── Demo: two steps per slide ────────────────────────────────────────────
pres.addSection({ title: "Demo" });
/** One demo step in half a slide: label, headline, screenshot (or a drawing), two numbers. */
function half(s, x, n, label, head, draw, stats) {
  const w = 5.9;
  s.addText(`Step ${n} · ${label}`, { x, y: 1.95, w, h: 0.3, fontSize: 12, color: K.muted, margin: 0, isTextBox: true });
  s.addText(head, { x, y: 2.25, w, h: 0.42, fontSize: 18, bold: true, color: K.ink, margin: 0, isTextBox: true });
  if (typeof draw === "string") shot(s, draw, x, 2.8, w, 2.55, "left");
  else draw(x, 2.8, w);
  stats.forEach(([v, l, c], i) => stat(s, x + i * 3.0, 5.55, v, l, c ?? K.ink, 2.8));
}
const demo = (n, title, speaker, subtitle) => frame(`Demo · steps ${n}–${n + 1} of 8`, title, "Demo", speaker, subtitle);

// 10. Steps 1–2
{
  const s = demo(1, "Build a dataset, then follow CO₂", "Arnav", "Q1: how did emissions change, and how much is coal giving way to gas?");
  half(s, 0.6, 1, "a dataset from a sentence", "“coal units in Kentucky”", img("kycoal"), [["358", "unit-years from 17 plants"], ["−30 %", "their CO₂, 2015 → 2025"]]);
  half(s, 6.8, 2, "visualization 1", "Gas passed coal in 2023", fig("p2-trend"), [["−22 %", "all CO₂, 2015 → 2025"], ["≈ 2,040", "coal lb CO₂/MWh, flat", K.amber]]);
}

// 11. Steps 3–4
{
  const s = demo(3, "Spread by fuel, then SCR vs none", "Arnav", "Q2: how much lower is the NOₓ rate of units with SCR?");
  half(s, 0.6, 3, "visualization 2 · statistics", "NOₓ rate by fuel, log scale", fig("p2-box"), [["0.034 · 0.574", "gas and oil medians, lb/MMBtu"], ["2.5×", "mean over median: use the median"]]);
  half(s, 6.8, 4, "comparison", "SCR vs no NOₓ control", img("compare-all"), [["+252.6 %", "no control vs SCR, pooled", K.amber], ["p < 0.001", "Welch t and Mann–Whitney"]]);
}

// 12. Steps 5–6
{
  const s = demo(5, "Impacts by state, then model accuracy", "Raaj", "Q3: which states contribute most? Q4: how well can we predict NOₓ?");
  half(s, 0.6, 5, "TRACI impacts", "Per MWh of power, 2024", img("impacts-mwh"), [["Texas", "leads every total"], ["Nebraska", "leads acidification per MWh"]]);
  half(s, 6.8, 6, "prediction", "Error on years no model saw", img("models-top"), [["26.3 t", "tree, 76 % below baseline", K.green], ["18.5 t", "persistence: still best"]]);
}

// 13. Steps 7–8
{
  const s = demo(7, "Change one input, then ask what-if", "Arnav", "Q4: how does Ghent unit 2's predicted NOₓ respond to changes?");
  half(s, 0.6, 7, "sensitivity", "Heat input ± 50 %", fig("p2-sensitivity"), [["−35 · −57 %", "Ridge, tree at half the fuel"], ["8 steps", "the tree is a staircase"]]);
  half(s, 6.8, 8, "what-if and export", "The models disagree on controls", (x, y, w) => table(s, [
    [hdr("Change"), hdr("Ridge"), hdr("Tree")],
    [strong("Add SCR"), { text: "−58.9 %", options: { bold: true, color: K.ridge } }, "0.0 %"],
    ["Switch to gas", "−68.8 %", "0.0 %"],
    ["5 % less fuel", "−3.2 %", "−9.1 %"],
    ["Run 10 % more", "+6.2 %", "+10.1 %"],
  ], { x, y, w, colW: [2.9, 1.5, 1.5], fontSize: 13, rowH: 0.46 }), [["−59 %", "Ridge for SCR, far over its 58 t miss", K.ridge], ["ZIP", "CSV, PNG, metadata.json"]]);
}

// ── 14. Limitations ──────────────────────────────────────────────────────
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

// ── 15. The main bugs ────────────────────────────────────────────────────
{
  const s = frame("Wrap-up", "The main bugs", "Wrap-up", "Raaj", "Most were in the database; each has its fix.");
  const cells = [
    ["A cache that didn't cache", "Drizzle queries are lazy: 1.5 s per view.", "Fix", "cache the finished rows: < 1 ms"],
    ["A read-only, cold host", "Each Vercel instance starts empty and can't write.", "Fix", "results stored in the committed file"],
    ["NOₓ vs NO₂ in TRACI", "Both are listed, with smog factors 24.79 vs 16.85.", "Fix", "read the workbook; map exactly"],
    ["A tree in 32-bit floats", "The tree from the models table took wrong branches.", "Fix", "Math.fround; a test against scikit-learn"],
  ];
  cells.forEach(([h, t, tag, fix], i) => card(s, 0.6 + (i % 2) * 6.2, 2.15 + Math.floor(i / 2) * 2.3, 5.9, h, t, tag, fix));
}

// ── 16. Questions ────────────────────────────────────────────────────────
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
    { text: "new tables, analysis query, stored results, statistics, TRACI, models, report", options: { color: K.ink2, fontSize: 13, breakLine: true } },
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
  s.addText([
    { text: "Live at  ", options: { fontFace: SANS, bold: false, color: K.muted } },
    { text: "epadata.vercel.app", options: { hyperlink: { url: "https://epadata.vercel.app" } } },
  ], { x: 0.6, y: 6.05, w: 6.5, h: 0.4, fontFace: MONO, fontSize: 14, bold: true, color: K.ink, margin: 0, valign: "middle", isTextBox: true });
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
