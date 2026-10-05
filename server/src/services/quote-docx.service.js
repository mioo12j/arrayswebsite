// =============================================================================
//  ARRAYS INGENIERIA — Word (.docx) document suite
//  Native, fully-editable Word rendering of the same document suite the PDF
//  generator produces (proposal brochure · commercial quotation · BOQ · scope).
//
//  This is NOT a PDF-to-image dump: every heading, table, price and paragraph is
//  real, selectable, editable Word content. It mirrors the PDF section-for-
//  section using the same brand palette, the same embedded brand fonts, the same
//  copy and the same real photography — laid out with Word tables/paragraphs
//  (a flow model) instead of the PDF's absolute canvas, so alignment stays intact
//  when the file is opened or emailed.
//
//  Entry point: buildQuoteDocx(data, parts) -> Buffer  (see quotes.routes.js)
// =============================================================================
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink,
  Table, TableRow, TableCell, TableLayoutType,
  WidthType, BorderStyle, AlignmentType, VerticalAlign,
  Header, Footer, PageNumber, PageBreak, ShadingType,
} from 'docx';
import { KIT } from './proposal-pdf.service.js';

const { num, inr, inrShort, model, addressLines, titleCaseCover, V } = KIT;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, '../assets/fonts');
const BRAND = path.join(HERE, '../assets/brand');

// -----------------------------------------------------------------------------
//  Palette (hex WITHOUT '#', as Word expects) — identical to the PDF's palette.
// -----------------------------------------------------------------------------
const T = {
  ink: '0c1f17', body: '38493f', mute: '6b7d74', faint: '93a49b',
  line: 'e2ece6', paper: 'ffffff', mint: 'f4faf7', mint2: 'e9f8f1',
  cream: 'fff7e6', emer: '0a6045', emerD: '07281d', emerM: '0e7a57',
  gold: 'b8860b', goldB: 'e7a719', sun: 'f2a51c', sky: '22a9e0',
  navy: '1c3a86', grn: '3aa935', white: 'ffffff',
};

// Brand fonts (embedded below, so the file renders identically on any machine).
const F = {
  serifH: 'Cormorant Garamond',   // display headings
  serif: 'EB Garamond',           // running text
  ui: 'Inter',                    // labels / data
  uiSB: 'Inter SemiBold',         // semibold labels / data
  script: 'TeX Gyre Chorus',      // one chancery flourish
};

// Fixed company bank account (same for every quote) — mirror of the PDF's block.
const DEFAULT_BANK = {
  bank_name: 'IDBI Bank',
  bank_branch: 'Greater Noida, Gautam Buddha Nagar',
  account_name: 'ARRAYS INGENIERIA PRIVATE LIMITED',
  account_no: '0875102000012290',
  ifsc: 'IBKL0000875',
};

// -----------------------------------------------------------------------------
//  Geometry — A4 in twips (1 pt = 20 twips; 1 px @96dpi = 15 twips).
// -----------------------------------------------------------------------------
const PAGE_W = 11906, PAGE_H = 16838;
const MARGIN = 760;                         // ~0.53"
const CONTENT = PAGE_W - 2 * MARGIN;        // usable width in twips
const CONTENT_PX = Math.round(CONTENT / 15);

const HP = (pt) => Math.round(pt * 2);      // points -> half-points (font size)
const TW = (pt) => Math.round(pt * 20);     // points -> twips
const CS = (pt) => Math.round(pt * 20);     // letter-spacing points -> twips

// -----------------------------------------------------------------------------
//  Assets
// -----------------------------------------------------------------------------
const has = (f) => { try { return fs.existsSync(f); } catch { return false; } };
const photo = (n) => path.join(BRAND, 'photos', n + '.jpg');
const press = (n) => path.join(BRAND, 'press', n + '.jpg');
const cert = (n) => path.join(BRAND, 'certs', n + '.jpg');
const news = (n) => path.join(BRAND, 'news', n + '.jpg');
const LOGO_C = path.join(BRAND, 'logo-color.png');

function fontBuf(file) { try { return fs.readFileSync(path.join(FONT_DIR, file)); } catch { return null; } }
function embeddedFonts() {
  const want = [
    [F.serifH, 'Cormorant-SemiBold.ttf'],
    [F.serif, 'EBGaramond-Regular.ttf'],
    [F.ui, 'Inter-Regular.ttf'],
    [F.uiSB, 'Inter-SemiBold.ttf'],
    [F.script, 'TeXGyreChorus.otf'],
  ];
  const out = [];
  for (const [name, file] of want) { const data = fontBuf(file); if (data) out.push({ name, data }); }
  return out;
}

// An ImageRun sized in pixels, or null when the asset is missing (graceful skip).
function img(file, wPx, hPx) {
  if (!has(file)) return null;
  try {
    const data = fs.readFileSync(file);
    const type = file.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    return new ImageRun({ type, data, transformation: { width: Math.round(wPx), height: Math.round(hPx) } });
  } catch { return null; }
}
function imgPara(file, wPx, hPx, opts = {}) {
  const r = img(file, wPx, hPx);
  if (!r) return null;
  return new Paragraph({ alignment: opts.align || AlignmentType.LEFT, spacing: { after: TW(opts.after ?? 4) }, children: [r] });
}

// -----------------------------------------------------------------------------
//  Text / paragraph primitives
// -----------------------------------------------------------------------------
function run(text, o = {}) {
  return new TextRun({
    text: text == null ? '' : String(text),
    font: o.font || F.serif,
    size: HP(o.size || 10.5),
    bold: !!o.bold,
    italics: !!o.italic,
    color: o.color || T.body,
    characterSpacing: o.cs ? CS(o.cs) : undefined,
    allCaps: !!o.caps,
    break: o.break || undefined,
  });
}
function P(children, o = {}) {
  const leftB = o.leftBorder ? { left: { style: BorderStyle.SINGLE, size: o.leftBorderSize || 22, color: o.leftBorder, space: 8 } } : null;
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: o.align,
    spacing: {
      before: o.before != null ? TW(o.before) : undefined,
      after: o.after != null ? TW(o.after) : TW(4),
      line: o.line ? Math.round(o.line * 240) : undefined,
    },
    indent: (o.indentLeft != null || o.indentRight != null) ? { left: o.indentLeft != null ? TW(o.indentLeft) : undefined, right: o.indentRight != null ? TW(o.indentRight) : undefined } : undefined,
    keepNext: o.keepNext,
    pageBreakBefore: o.pageBreakBefore,
    shading: o.shadingFill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shadingFill } : undefined,
    border: o.border || leftB || undefined,
  });
}
const spacer = (pt = 6) => new Paragraph({ children: [], spacing: { after: TW(pt) } });

// A borderless "panel": a run of shaded paragraphs sharing a left accent bar —
// the Word-native way to get the PDF's soft panels WITHOUT table gridlines.
// `lines` = array of { runs, align, line, after }.
function panel(lines, o = {}) {
  const fill = o.fill || T.mint, accent = o.accent, n = lines.length;
  return lines.map((ln, i) => new Paragraph({
    children: ln.runs,
    alignment: ln.align,
    spacing: { before: TW(i === 0 ? (o.padTop ?? 6) : (ln.before ?? 1)), after: TW(i === n - 1 ? (o.padBottom ?? 6) : (ln.after ?? 4)), line: ln.line ? Math.round(ln.line * 240) : undefined },
    indent: { left: TW(o.indent ?? 12), right: TW(o.indentRight ?? 12) },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    border: accent ? { left: { style: BorderStyle.SINGLE, size: o.accentSize || 22, color: accent, space: 8 } } : undefined,
  }));
}

// A thin full-width rule (paragraph bottom-border).
function rule(color = T.line, size = 6, after = 6) {
  return new Paragraph({
    children: [], spacing: { after: TW(after) },
    border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 1 } },
  });
}

// Gold + emerald + sky tri-colour underline (mirrors the PDF's triTick) — drawn
// as coloured block glyphs in one paragraph (no table, so no gridlines in Word).
// Arial is used because it reliably carries the full-block glyph on every system.
function triTick(width = 1500, align) {
  const seg = '█████';
  const bar = (c) => new TextRun({ text: seg, font: 'Arial', size: HP(4.5), color: c });
  const sp = () => new TextRun({ text: ' ', font: 'Arial', size: HP(4.5) });
  return new Paragraph({ alignment: align, spacing: { after: 0, line: 200 }, children: [bar(T.gold), sp(), bar(T.emer), sp(), bar(T.sky)] });
}

// Section heading: eyebrow kicker + big serif title + tri-tick.
function headingBlock(kicker, title, o = {}) {
  const out = [];
  if (kicker) out.push(P(run(kicker, { font: F.uiSB, size: 8.5, color: o.kickColor || T.gold, caps: true, cs: 2.4 }), { after: 3, pageBreakBefore: o.pageBreakBefore }));
  out.push(P(run(title, { font: o.script ? F.script : F.serifH, size: o.size || 24, color: o.ink || T.ink, bold: !o.script }), { after: 4, pageBreakBefore: kicker ? false : o.pageBreakBefore }));
  out.push(triTick(o.tickW || 1500));
  out.push(spacer(o.after ?? 8));
  return out;
}
function eyebrow(text, color = T.gold, o = {}) {
  return P(run(text, { font: F.uiSB, size: 8.5, color, caps: true, cs: 2 }), { after: o.after ?? 5, before: o.before, pageBreakBefore: o.pageBreakBefore });
}
function para(text, o = {}) {
  return P(run(text, { font: o.font || F.serif, size: o.size || 10.4, color: o.color || T.body, italic: o.italic }), { after: o.after ?? 8, align: o.align, line: o.line ?? 1.15 });
}

// -----------------------------------------------------------------------------
//  Table primitives
// -----------------------------------------------------------------------------
function noBorders() {
  const n = { style: BorderStyle.NIL, size: 0, color: 'auto' };
  return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
}
const CELL_M = { top: 120, bottom: 120, left: 160, right: 160 };

// A "card": shaded cell with a single accent bar (left by default, or top).
// No box outline — the fill alone reads as a soft panel, like the PDF.
function cardCell(width, children, o = {}) {
  const accent = o.accent;
  const b = (c, sz) => ({ style: BorderStyle.SINGLE, size: sz, color: c, space: 0 });
  const none = { style: BorderStyle.NIL, size: 0, color: 'auto' };
  const borders = {
    top: o.accentSide === 'top' && accent ? b(accent, 22) : none,
    bottom: none,
    left: o.accentSide !== 'top' && accent ? b(accent, 22) : none,
    right: none,
  };
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: o.margins || CELL_M, borders,
    verticalAlign: o.valign,
    columnSpan: o.span,
    children: Array.isArray(children) ? (children.length ? children : [P([], { after: 0 })]) : [children],
  });
}
const gapCell = (w) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: noBorders(), margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [P([], { after: 0 })] });

// A row of equal cards separated by gutters. `cards` = array of {accent,fill,accentSide,stroke,children}.
function cardRow(cards, o = {}) {
  const gutter = o.gutter != null ? o.gutter : 150;
  const n = cards.length;
  const cardW = Math.floor((CONTENT - gutter * (n - 1)) / n);
  const cols = [], cells = [];
  cards.forEach((c, i) => {
    cols.push(cardW); cells.push(cardCell(cardW, c.children, c));
    if (i < n - 1) { cols.push(gutter); cells.push(gapCell(gutter)); }
  });
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    columnWidths: cols, borders: noBorders(),
    rows: [new TableRow({ children: cells })],
  });
}

// Key/value "meta" card — a shaded panel with a left gold bar and stacked rows.
function metaPanel(rows, o = {}) {
  const width = o.width || CONTENT;
  const inner = [];
  rows.forEach((r, i) => {
    inner.push(P(run(String(r[0]).toUpperCase(), { font: F.ui, size: 7.5, color: T.mute, cs: 0.7 }), { after: 1, before: i ? 5 : 0 }));
    const val = r[1];
    if (Array.isArray(val)) val.forEach((ln, k) => inner.push(P(run(ln, { font: F.uiSB, size: 9, color: T.ink }), { after: k === val.length - 1 ? 3 : 0 })));
    else inner.push(P(run(V(val), { font: F.uiSB, size: 9.5, color: T.ink }), { after: 3 }));
  });
  return new Table({
    width: { size: width, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [width], borders: noBorders(),
    rows: [new TableRow({ children: [cardCell(width, inner, { fill: o.fill || T.mint, accent: o.accent || T.gold })] })],
  });
}

// Generic data table (BOQ, track record, warranty, specs). `cols` = [{label,width,align,color,font,size}].
function dataTable(cols, rows, o = {}) {
  const headFill = o.headFill || T.emer;
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const headCells = cols.map((c) => new TableCell({
    width: { size: c.width, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: headFill },
    margins: { top: 70, bottom: 70, left: 90, right: 90 }, borders: noBorders(),
    children: [P(run(c.label, { font: F.uiSB, size: 8, color: T.white }), { after: 0, align: c.align })],
  }));
  const body = rows.map((r, ri) => new TableRow({
    children: r.map((cellVal, ci) => {
      const c = cols[ci];
      const runs = Array.isArray(cellVal) ? cellVal : [run(cellVal, { font: c.font || F.serif, size: c.size || 9.6, color: c.color || T.body })];
      return new TableCell({
        width: { size: c.width, type: WidthType.DXA },
        shading: ri % 2 ? { type: ShadingType.CLEAR, color: 'auto', fill: T.mint } : undefined,
        margins: { top: 80, bottom: 80, left: 90, right: 90 },
        borders: noBorders(),   // no row lines — alternating shading gives the structure
        children: [P(runs, { after: 0, align: c.align, line: 1.1 })],
      });
    }),
  }));
  return new Table({
    width: { size: totalW, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: cols.map((c) => c.width),
    borders: noBorders(), alignment: o.align,
    rows: [new TableRow({ children: headCells }), ...body],
  });
}

// A check-tick bullet list inside a scope column card.
function checkItems(list, accent) {
  return list.map((t) => P([
    run('✓  ', { font: F.uiSB, size: 9.5, color: accent }),
    run(t, { font: F.serif, size: 9, color: T.body }),
  ], { after: 4, line: 1.12 }));
}
function bulletItems(list, o = {}) {
  return list.map((t) => P([
    run('•  ', { font: F.uiSB, size: 9.5, color: o.dot || T.gold }),
    run(t, { font: F.serif, size: o.size || 9.2, color: o.color || T.body }),
  ], { after: 4, line: 1.15 }));
}

// Emerald stat band: evenly split big number + caption cells.
function statBand(stats, o = {}) {
  const fill = o.fill || T.emer;
  const w = Math.floor(CONTENT / stats.length);
  const cells = stats.map((s, i) => new TableCell({
    width: { size: w, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    margins: { top: 140, bottom: 140, left: 40, right: 40 }, verticalAlign: VerticalAlign.CENTER,
    borders: { left: i ? { style: BorderStyle.SINGLE, size: 3, color: '2f7a60' } : { style: BorderStyle.NIL }, top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } },
    children: [
      P(run(s[0], { font: F.uiSB, size: 18, color: T.white, bold: true }), { after: 2, align: AlignmentType.CENTER }),
      P(run(String(s[1]).toUpperCase(), { font: F.ui, size: 7.4, color: 'bfe7d6', cs: 1 }), { after: 0, align: AlignmentType.CENTER }),
    ],
  }));
  return new Table({ width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: stats.map(() => w), borders: noBorders(), rows: [new TableRow({ children: cells })] });
}

// -----------------------------------------------------------------------------
//  Financial helpers (self-contained mirror of the quotation logic)
// -----------------------------------------------------------------------------
function money(n) { return n || n === 0 ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'; }

function commercials(data) {
  const items = Array.isArray(data.line_items) ? data.line_items : [];
  const subtotal = num(data.subtotal, 0) || items.reduce((s, i) => s + num(i.amount, 0), 0);
  const contingency = num(data.contingency_amount, 0);
  const margin = num(data.margin_amount, 0);
  const taxable = num(data.taxable_amount, 0) || subtotal + contingency + margin;
  const gst = num(data.gst_amount, 0) || Math.round(taxable * 0.138);
  const total = num(data.total_amount, 0) || taxable + gst;
  const subsidy = num(data.subsidy_amount, 0);
  const net = num(data.net_cost, 0) || total - subsidy;
  const kwp = num(data.capacity_kw || data.capacity_kwp, 0);
  const perW = num(data.per_watt, 0) || (kwp ? total / (kwp * 1000) : 0);
  const perWBasic = num(data.per_watt_basic, 0) || (kwp ? taxable / (kwp * 1000) : 0);
  return { items, subtotal, contingency, margin, taxable, gst, total, subsidy, net, kwp, perW, perWBasic };
}
function gstRows(c, data) {
  const pct = c.taxable ? Math.round((c.gst / c.taxable) * 10000) / 100 : 0;
  if (String(data.gst_split || '').toLowerCase() === 'igst') return [[`IGST (${pct}%)`, c.gst]];
  const half = c.gst / 2, hpct = Math.round(pct / 2 * 100) / 100;
  return [[`CGST (${hpct}%)`, half], [`SGST (${hpct}%)`, half]];
}
function distributeMargin(items, margin) {
  const alloc = new Map(items.map((i) => [i, 0]));
  if (!(margin > 0) || !items.length) return alloc;
  const isCivil = (i) => /civil/i.test(i.item);
  const isInstall = (i) => !isCivil(i) && /install|commission/i.test(i.item);
  const civil = items.filter(isCivil);
  const install = items.filter(isInstall);
  const rest = items.filter((i) => !isCivil(i) && !isInstall(i));
  let pC = civil.length ? 0.4 : 0, pI = install.length ? 0.4 : 0, pR = rest.length ? 0.2 : 0;
  const tot = pC + pI + pR;
  if (tot <= 0) { items.forEach((i) => alloc.set(i, margin / items.length)); return alloc; }
  pC /= tot; pI /= tot; pR /= tot;
  const give = (list, amt) => {
    if (!list.length || amt <= 0) return;
    const s = list.reduce((a, i) => a + i.amount, 0);
    list.forEach((i) => alloc.set(i, alloc.get(i) + amt * (s > 0 ? i.amount / s : 1 / list.length)));
  };
  give(civil, margin * pC); give(install, margin * pI); give(rest, margin * pR);
  return alloc;
}
function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (v && String(v).trim()) return String(v).split(/\n+/).map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  return null;
}
function parseTitleBody(s) {
  const str = String(s).trim();
  const m = str.match(/^([^:\n]{2,44}):\s*([\s\S]+)$/);
  return m ? { title: m[1].trim(), body: m[2].trim() } : { title: '', body: str };
}
function normalizeTerms(t) {
  if (Array.isArray(t)) {
    const a = t.map((x) => (typeof x === 'string' ? parseTitleBody(x)
      : { title: String(x.title || '').trim(), body: String(x.body || x.text || x.description || '').trim() }))
      .filter((x) => x.body || x.title);
    return a.length ? a : null;
  }
  if (t && String(t).trim()) {
    const a = String(t).split(/\n{1,}/).map((l) => l.trim()).filter(Boolean).map(parseTitleBody);
    return a.length ? a : null;
  }
  return null;
}
function normalizeSchedule(s) {
  if (!Array.isArray(s) || !s.length) return null;
  const a = s.map((p) => ({
    pct: String(p.pct ?? p.percent ?? p.percentage ?? '').replace(/%*$/, '') + '%',
    stage: String(p.stage ?? p.label ?? p.milestone ?? '').trim(),
    against: String(p.against ?? p.note ?? p.description ?? '').trim(),
  })).filter((p) => p.stage || p.against);
  return a.length ? a : null;
}
function defaultTerms() {
  return [
    { title: 'GST & Taxes', body: 'GST is charged extra at prevailing rates as applicable on the date of invoicing, over and above the quoted value.' },
    { title: 'Warranty', body: 'Solar modules and inverter carry the respective manufacturer / brand warranty and are supplied as per the requirement of the client.' },
    { title: 'Delivery & Timeline', body: 'Delivery and commissioning commence from receipt of the advance, a technically clear order and continuous unobstructed access to a ready site.' },
    { title: 'Insurance', body: 'Transit and erection-all-risk cover, where required, is arranged at actuals. The client shall insure the plant after handover.' },
    { title: 'Force Majeure', body: 'Neither party shall be liable for delay or non-performance due to events beyond reasonable control — weather, strikes, regulatory change, grid unavailability or acts of God.' },
    { title: 'Jurisdiction & Confidentiality', body: 'This quotation is confidential, remains our property, and any dispute is subject to the jurisdiction of the courts at our registered office.' },
  ];
}
const scopeFlags = (data) => ({
  panel: data.scope_panel !== false && String(data.scope_panel) !== 'false',
  inverter: data.scope_inverter !== false && String(data.scope_inverter) !== 'false',
  inc: data.scope_inc !== false && String(data.scope_inc) !== 'false',
});

// -----------------------------------------------------------------------------
//  Page chrome — per-section header & footer
// -----------------------------------------------------------------------------
function makeHeader(tag) {
  const logo = img(LOGO_C, 44, 44);
  const left = new TableCell({
    width: { size: 1500, type: WidthType.DXA }, borders: noBorders(), verticalAlign: VerticalAlign.CENTER,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [logo ? new Paragraph({ children: [logo], spacing: { after: 0 } }) : P(run('ARRAYS', { font: F.uiSB, size: 10, color: T.emer }), { after: 0 })],
  });
  const mid = new TableCell({
    width: { size: CONTENT - 3200, type: WidthType.DXA }, borders: noBorders(), verticalAlign: VerticalAlign.CENTER,
    children: [P(run(String(tag || 'Techno-Commercial Proposal').toUpperCase(), { font: F.uiSB, size: 9, color: T.mute, cs: 2.4 }), { after: 0, align: AlignmentType.CENTER })],
  });
  const right = new TableCell({
    width: { size: 1700, type: WidthType.DXA }, borders: noBorders(), verticalAlign: VerticalAlign.CENTER,
    children: [P(run('ARRAYS INGENIERIA', { font: F.ui, size: 7.5, color: T.faint }), { after: 0, align: AlignmentType.RIGHT })],
  });
  const t = new Table({
    width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [1500, CONTENT - 3200, 1700],
    borders: { top: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL }, insideVertical: { style: BorderStyle.NIL }, insideHorizontal: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.SINGLE, size: 6, color: T.line } },
    rows: [new TableRow({ children: [left, mid, right] })],
  });
  return new Header({ children: [t, P([], { after: 0 })] });
}
function makeFooter() {
  const left = new TableCell({
    width: { size: Math.floor(CONTENT * 0.55), type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: T.emerD },
    margins: { top: 70, bottom: 70, left: 140, right: 60 }, borders: noBorders(), verticalAlign: VerticalAlign.CENTER,
    children: [P(run('Developing Green Energy for the Nation', { font: F.serif, size: 9, italic: true, color: 'cfe9df' }), { after: 0 })],
  });
  const right = new TableCell({
    width: { size: CONTENT - Math.floor(CONTENT * 0.55), type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: T.emerD },
    margins: { top: 70, bottom: 70, left: 60, right: 140 }, borders: noBorders(), verticalAlign: VerticalAlign.CENTER,
    children: [P([
      run('ISO 9001 · 14001 · 45001   ·   ', { font: F.ui, size: 7.3, color: 'a7cfc0' }),
      run('Page ', { font: F.ui, size: 7.3, color: 'a7cfc0' }),
      new TextRun({ children: [PageNumber.CURRENT], font: F.ui, size: HP(7.3), color: 'a7cfc0' }),
    ], { after: 0, align: AlignmentType.RIGHT })],
  });
  const t = new Table({
    width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    columnWidths: [Math.floor(CONTENT * 0.55), CONTENT - Math.floor(CONTENT * 0.55)], borders: noBorders(),
    rows: [new TableRow({ children: [left, right] })],
  });
  return new Footer({ children: [t] });
}

// A small closing notice for standalone transactional documents.
function autoGenNote(kind) {
  return [
    rule(T.line, 4, 4),
    P(run(`This is a computer-generated ${kind} produced by the Arrays Ingenieria system and is valid without a physical signature. Figures are indicative and subject to the terms stated herein.`,
      { font: F.ui, size: 7, color: T.mute }), { after: 0, align: AlignmentType.CENTER, line: 1.1 }),
  ];
}

// =============================================================================
//  QUOTATION
// =============================================================================
function quotationChildren(data) {
  const c = commercials(data);
  const sc = scopeFlags(data);
  const out = [];
  out.push(...headingBlock('Priced Offer', 'Commercial Quotation'));

  // meta + system config, side by side (two card columns).
  const addr = addressLines(data);
  const metaRows = [
    ['Client', data.client_name || data.client_full_name || data.customer_name],
    ['Address', addr.length ? addr : null],
    ['Project', data.project_name || data.site_name],
    ['Capacity', num(data.capacity_kw, 0) ? num(data.capacity_kw, 0) + ' kWp' : null],
    ['Reference', data.quote_number],
    ['Date', new Date(data.issue_date || data.date || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
    ['Valid Until', data.valid_until ? new Date(data.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '30 days from issue'],
  ].filter((r) => r[1]);
  const dcCap = num(data.dc_capacity, 0);
  const cfg = [
    ...(sc.panel ? [['Solar Module', data.module_config || '545 Wp Mono PERC / latest equivalent technology']] : []),
    ...(sc.panel && data.panel_type ? [['Panel Type', data.panel_type === 'DCR'
      ? 'DCR — Domestic Content Requirement (India-made cells & modules)'
      : data.panel_type === 'Non-DCR' ? 'Non-DCR — imported cells / modules permitted' : String(data.panel_type)]] : []),
    ...(sc.inverter ? [['Inverter', data.inverter_config || 'Three-phase grid-connected string inverter (as per design)']] : []),
    ...(dcCap > 0 ? [['DC Capacity', dcCap + ' kWp']] : []),
    ['Mounting (MMS)', data.mms_config || data.structure_type || 'Aluminium / GI structure suitable for rooftop'],
    ['System', data.system_config || 'Grid-connected rooftop solar system'],
    ['Net Metering', data.net_metering === 'included' ? 'Included' : 'Not included'],
    ['Battery Backup', data.battery_backup === 'included' ? 'Included' : 'Not included'],
  ].filter((r) => r[1]);

  const colW = Math.floor((CONTENT - 220) / 2);
  const metaInner = [];
  metaRows.forEach((r, i) => {
    metaInner.push(P(run(String(r[0]).toUpperCase(), { font: F.ui, size: 7.5, color: T.mute, cs: 0.7 }), { after: 1, before: i ? 5 : 0 }));
    if (Array.isArray(r[1])) r[1].forEach((ln, k) => metaInner.push(P(run(ln, { font: F.uiSB, size: 9, color: T.ink }), { after: k === r[1].length - 1 ? 3 : 0 })));
    else metaInner.push(P(run(V(r[1]), { font: F.uiSB, size: 9.5, color: T.ink }), { after: 3 }));
  });
  const cfgInner = [P(run('SYSTEM CONFIGURATION', { font: F.uiSB, size: 8.5, color: T.emer, cs: 1 }), { after: 6 })];
  cfg.forEach((r) => {
    cfgInner.push(P(run(String(r[0]).toUpperCase(), { font: F.ui, size: 7.5, color: T.mute, cs: 0.6 }), { after: 1 }));
    cfgInner.push(P(run(String(r[1]), { font: F.serif, size: 9.4, color: T.ink }), { after: 5, line: 1.15 }));
  });
  out.push(new Table({
    width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [colW, 220, CONTENT - colW - 220], borders: noBorders(),
    rows: [new TableRow({ children: [
      cardCell(colW, metaInner, { fill: T.mint, accent: T.gold, accentSide: 'top', valign: VerticalAlign.TOP }),
      gapCell(220),
      cardCell(CONTENT - colW - 220, cfgInner, { fill: T.mint, accent: T.emer, accentSide: 'top', valign: VerticalAlign.TOP }),
    ] })],
  }));
  out.push(spacer(10));

  // commercial offer table
  out.push(eyebrow('Commercial Offer', T.gold));
  const scInc = sc.inc;
  const defaultOffer = scInc
    ? 'Design, Engineering, Supply, Installation, Testing & Commissioning of Solar PV System'
    : 'Design, Engineering & Supply of Solar PV System materials';
  const offerLabel = data.commercial_scope || data.supply_description || defaultOffer;
  const priceRow = (label, val, o = {}) => new TableRow({
    children: [
      new TableCell({
        width: { size: CONTENT - 2600, type: WidthType.DXA }, shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
        margins: { top: o.big ? 130 : 90, bottom: o.big ? 130 : 90, left: 150, right: 90 }, verticalAlign: VerticalAlign.CENTER,
        borders: { bottom: { style: BorderStyle.NIL }, top: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } },
        children: [P(run(label, { font: o.big ? F.uiSB : F.ui, size: o.big ? 11 : 10, color: o.big ? T.white : T.body }), { after: 0, line: 1.1 })],
      }),
      new TableCell({
        width: { size: 2600, type: WidthType.DXA }, shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
        margins: { top: o.big ? 130 : 90, bottom: o.big ? 130 : 90, left: 90, right: 150 }, verticalAlign: VerticalAlign.CENTER,
        borders: { bottom: { style: BorderStyle.NIL }, top: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } },
        children: [P(run(money(val), { font: o.big ? F.uiSB : F.uiSB, size: o.big ? 15 : 10.5, color: o.big ? T.white : (o.accent || T.ink), bold: o.big }), { after: 0, align: AlignmentType.RIGHT })],
      }),
    ],
  });
  const rows = [priceRow(offerLabel, c.taxable)];
  gstRows(c, data).forEach(([l, v]) => rows.push(priceRow(l, v)));
  rows.push(priceRow('Total Investment (incl. GST)', c.total, { big: true, fill: T.emer }));
  if (c.subsidy) { rows.push(priceRow('Less: Government Subsidy', -c.subsidy, { accent: T.emer })); rows.push(priceRow('Net Investment After Subsidy', c.net, { big: true, fill: T.emerD })); }
  out.push(new Table({ width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [CONTENT - 2600, 2600], borders: noBorders(), rows }));

  // effective price (basic per-watt + incl-GST)
  if (c.kwp && c.perWBasic) {
    out.push(spacer(6));
    out.push(...panel([{ runs: [
      run('EFFECTIVE PRICE     ', { font: F.uiSB, size: 9, color: T.gold, cs: 0.6 }),
      run(`₹ ${c.perWBasic.toFixed(2)} / Watt basic`, { font: F.uiSB, size: 10.5, color: T.ink }),
      run(`      (₹ ${c.perW.toFixed(2)} / Watt incl. GST)`, { font: F.ui, size: 9, color: T.mute }),
    ] }], { fill: T.cream, accent: T.gold }));
  }
  out.push(para('All figures in Indian Rupees. This quotation is subject to the terms, validity and exclusions set out on the following pages.', { italic: true, size: 8, color: T.mute, after: 10 }));

  // ---- Payment & Returns ----
  const mm = model(data);
  out.push(...headingBlock('Terms of Business', 'Payment & Returns', { pageBreakBefore: true }));
  out.push(eyebrow('Payment Schedule', T.gold));
  const sched = normalizeSchedule(data.payment_schedule) || [
    { pct: '30%', stage: 'Advance', against: 'Along with the confirmed Purchase Order' },
    { pct: '60%', stage: 'On Material Readiness', against: 'Against readiness of modules, inverter & balance-of-system for dispatch (prior to delivery)' },
    { pct: '5%', stage: 'On Installation', against: 'On completion of mechanical installation at site' },
    { pct: '5%', stage: 'On Commissioning', against: 'On successful testing, commissioning & handover' },
  ];
  sched.forEach((s) => {
    out.push(new Table({
      width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [1200, CONTENT - 1200], borders: noBorders(),
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: T.mint }, margins: { top: 110, bottom: 110, left: 120, right: 60 }, verticalAlign: VerticalAlign.CENTER, borders: { left: { style: BorderStyle.SINGLE, size: 26, color: T.gold }, top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } }, children: [P(run(s.pct, { font: F.uiSB, size: 18, color: T.emer, bold: true }), { after: 0 })] }),
        new TableCell({ width: { size: CONTENT - 1200, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: T.mint }, margins: { top: 100, bottom: 100, left: 120, right: 140 }, verticalAlign: VerticalAlign.CENTER, borders: noBorders(), children: [P(run(s.stage, { font: F.uiSB, size: 10.5, color: T.ink }), { after: 2 }), P(run(s.against, { font: F.serif, size: 9, color: T.body }), { after: 0, line: 1.2 })] }),
      ] })],
    }));
    out.push(spacer(4));
  });

  // return on investment
  out.push(spacer(4));
  out.push(eyebrow('Your Return on Investment', T.gold));
  out.push(cardRow([
    { accent: T.emer, fill: T.mint, stroke: true, children: [P(run('ANNUAL SAVINGS', { font: F.ui, size: 7.3, color: T.mute, cs: 0.5 }), { after: 2 }), P(run(inrShort(mm.save1), { font: F.uiSB, size: 15, color: T.ink, bold: true }), { after: 0 })] },
    { accent: T.gold, fill: T.mint, stroke: true, children: [P(run('PAYBACK PERIOD', { font: F.ui, size: 7.3, color: T.mute, cs: 0.5 }), { after: 2 }), P(run(mm.paybackYrs.toFixed(1) + ' yrs', { font: F.uiSB, size: 15, color: T.ink, bold: true }), { after: 0 })] },
    { accent: T.emerM, fill: T.mint, stroke: true, children: [P(run('25-YEAR SAVINGS', { font: F.ui, size: 7.3, color: T.mute, cs: 0.5 }), { after: 2 }), P(run(inrShort(mm.cum25), { font: F.uiSB, size: 15, color: T.ink, bold: true }), { after: 0 })] },
    { accent: T.navy, fill: T.mint, stroke: true, children: [P(run('NET INVESTMENT', { font: F.ui, size: 7.3, color: T.mute, cs: 0.5 }), { after: 2 }), P(run(inrShort(mm.netInvest), { font: F.uiSB, size: 15, color: T.ink, bold: true }), { after: 0 })] },
  ], { gutter: 120 }));
  out.push(para(`Indicative only — calculated at ₹${mm.tariff}/unit with ~${Math.round(mm.gen1).toLocaleString('en-IN')} units/year (3.5% tariff escalation, 0.6%/yr degradation). Not a guarantee; actual savings vary with consumption, weather, tariff revisions and DISCOM policy.`, { italic: true, size: 7.6, color: T.mute, after: 10 }));

  // scope of work + exclusions
  out.push(...scopeAndExclusions(data));

  if (data.notes && String(data.notes).trim()) {
    out.push(eyebrow('Extra Technical Requirements / Notes', T.gold, { before: 4 }));
    out.push(...panel([{ runs: [run(String(data.notes), { font: F.serif, size: 9.4, color: T.body })], line: 1.3 }], { fill: T.mint, accent: T.emer }));
    out.push(spacer(6));
  }

  // Terms
  out.push(...headingBlock('Please Read Carefully', 'Terms & Conditions', { pageBreakBefore: true }));
  (normalizeTerms(data.terms) || defaultTerms()).forEach((t) => {
    const runs = [];
    if (t.title) runs.push(run(t.title + '. ', { font: F.uiSB, size: 9.8, color: T.ink }));
    runs.push(run(t.body, { font: F.serif, size: 9.2, color: T.body }));
    out.push(P([run('•  ', { font: F.uiSB, size: 9.5, color: T.gold }), ...runs], { after: 7, line: 1.25 }));
  });

  // Payment & company details, bank, acceptance
  out.push(...companyBankBlock(data));
  out.push(...acceptanceBlock(data));
  out.push(...autoGenNote('quotation'));
  return out;
}

function scopeAndExclusions(data) {
  const out = [];
  const ours = asList(data.scope_ours) || [
    'Design, engineering, drawings & single-line diagram (SLD)',
    'Supply of solar modules, inverter & balance-of-system as per client requirement',
    'Module mounting structure, DC/AC cabling, earthing & lightning protection',
    'Installation, testing & commissioning',
    'DISCOM liaison & net-metering application',
    'Datasheets, test certificates & O&M orientation',
  ];
  const client = asList(data.scope_client) || [
    'Clear, secure, shadow-free site with structural adequacy',
    'Construction power & water and safe storage at site',
    'Sanctioned load details, latest electricity bill & KYC',
    'DISCOM deposits, feasibility & statutory fees (at actuals)',
    'Timely release of payments as per the agreed schedule',
  ];
  out.push(eyebrow('Scope of Work', T.gold));
  const colW = Math.floor((CONTENT - 160) / 2);
  const colChildren = (title, list, accent, chip) => [
    P(run(title, { font: F.uiSB, size: 10, color: T.white }), { after: 5, shadingFill: accent }),
    ...checkItems(list, accent),
  ];
  out.push(new Table({
    width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [colW, 160, CONTENT - colW - 160], borders: noBorders(),
    rows: [new TableRow({ children: [
      cardCell(colW, colChildren('Arrays Ingenieria Scope', ours, T.emer), { fill: T.mint, stroke: true, valign: VerticalAlign.TOP }),
      gapCell(160),
      cardCell(CONTENT - colW - 160, colChildren('Client Scope', client, T.gold), { fill: T.mint, stroke: true, valign: VerticalAlign.TOP }),
    ] })],
  }));
  out.push(spacer(8));
  const exc = asList(data.exclusions) || [
    'Anything not expressly listed under our Scope of Work, or agreed by us in writing, is deemed to be in the client’s scope and is chargeable at actuals.',
    'DISCOM deposits, metering charges, feasibility and any statutory / approval fees are at actuals.',
  ];
  const excLines = [{ runs: [run('EXCLUSIONS', { font: F.uiSB, size: 8.5, color: T.emer, cs: 1 })], after: 4 }];
  exc.forEach((e) => excLines.push({ runs: [run('•  ', { font: F.uiSB, size: 9, color: T.emer }), run(e, { font: F.serif, size: 9, color: T.body })], line: 1.2 }));
  out.push(...panel(excLines, { fill: T.mint, accent: T.emer }));
  out.push(spacer(8));
  return out;
}

function companyBankBlock(data) {
  const out = [];
  out.push(eyebrow('Payment & Company Details', T.gold));
  const colW = Math.floor((CONTENT - 160) / 2);
  const supplier = [
    ['Company', data.company_name || 'Arrays Ingenieria Pvt. Ltd.'],
    ['GSTIN', data.company_gstin || '—'],
    ['Office', [data.office_name, data.office_place].filter(Boolean).join(' · ') || '—'],
  ];
  const bank = [
    ['Bank / Branch', [DEFAULT_BANK.bank_name, DEFAULT_BANK.bank_branch].filter(Boolean).join(', ')],
    ['Account Name', DEFAULT_BANK.account_name],
    ['Account No.', DEFAULT_BANK.account_no],
    ['IFSC', DEFAULT_BANK.ifsc],
  ];
  const kv = (title, rows) => {
    const inner = [P(run(title, { font: F.uiSB, size: 8, color: T.emer, cs: 0.8 }), { after: 5 })];
    rows.forEach((r) => { inner.push(P(run(String(r[0]).toUpperCase(), { font: F.ui, size: 7.2, color: T.mute, cs: 0.5 }), { after: 1 })); inner.push(P(run(String(r[1]), { font: F.uiSB, size: 9, color: T.ink }), { after: 4 })); });
    return inner;
  };
  out.push(new Table({
    width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [colW, 160, CONTENT - colW - 160], borders: noBorders(),
    rows: [new TableRow({ children: [
      cardCell(colW, kv('SUPPLIER', supplier), { fill: T.mint, accent: T.gold, accentSide: 'top', stroke: true, valign: VerticalAlign.TOP }),
      gapCell(160),
      cardCell(CONTENT - colW - 160, kv('BANK DETAILS FOR PAYMENT', bank), { fill: T.mint, accent: T.emer, accentSide: 'top', stroke: true, valign: VerticalAlign.TOP }),
    ] })],
  }));
  out.push(spacer(6));
  const pmText = `Payment is credited only against our Proforma Invoice. No GST tax invoice is issued until the payment is received in our account. Delay beyond the due date attracts interest at ${data.delay_interest || '18% per annum'}.`;
  out.push(...panel([
    { runs: [run('PAYMENT METHOD', { font: F.uiSB, size: 8, color: T.gold, cs: 0.8 })], after: 3 },
    { runs: [run(pmText, { font: F.serif, size: 9, color: T.body })], line: 1.2 },
  ], { fill: T.cream, accent: T.gold }));
  out.push(spacer(8));
  return out;
}

function acceptanceBlock(data) {
  const clientNm = data.client_name || data.client_full_name || data.customer_name || 'the Client';
  // Signature line: an empty paragraph with only a bottom rule, inset from the
  // right so the line spans part of the width. Label sits below it. No boxes.
  const signLine = (rightGap, color = T.ink, size = 8) => new Paragraph({ children: [], spacing: { after: TW(2) }, indent: { right: TW(rightGap) }, border: { bottom: { style: BorderStyle.SINGLE, size, color } } });
  const field = (label, rightGap) => [signLine(rightGap, T.line, 6), P(run(label.toUpperCase(), { font: F.ui, size: 7, color: T.mute, cs: 0.5 }), { after: 12 })];
  return [
    P(run('ACCEPTED BY THE CLIENT', { font: F.uiSB, size: 8.5, color: T.gold, cs: 0.8 }), { after: 4, before: 6 }),
    P(run('We have read and accept the scope, pricing and terms set out in this quotation.', { font: F.serif, size: 9, color: T.body }), { after: 12, line: 1.2 }),
    P(run(`For ${clientNm}`, { font: F.serif, size: 10.5, italic: true, color: T.ink }), { after: 40 }),
    signLine(Math.floor(CONTENT * 0.45)),
    P(run('AUTHORISED SIGNATORY  ·  SIGN & COMPANY SEAL', { font: F.ui, size: 7.5, color: T.mute, cs: 0.4 }), { after: 16 }),
    ...field('Name', Math.floor(CONTENT * 0.45)),
    ...field('Designation', Math.floor(CONTENT * 0.45)),
    ...field('Date', Math.floor(CONTENT * 0.45)),
    ...field('Place', Math.floor(CONTENT * 0.45)),
    spacer(6),
  ];
}

// =============================================================================
//  BILL OF QUANTITIES
// =============================================================================
function boqChildren(data) {
  const c = commercials(data);
  const out = [];
  out.push(...headingBlock('Detailed Scope', 'Bill of Quantities'));
  out.push(para(`A component-level breakdown for the proposed ${c.kwp ? c.kwp + ' kWp ' : ''}grid-connected solar PV system — every item, quantity and rate, in full transparency.`, { size: 10.4, after: 8 }));

  const rawItems = c.items.length ? c.items : null;
  const items = rawItems || [{ item: 'Complete Solar PV System — Supply, Installation & Commissioning', qty: 1, unit: 'Lot', rate: c.taxable, amount: c.taxable }];
  const itemsSum = items.reduce((s, i) => s + num(i.amount, 0), 0);
  const needMargin = rawItems && c.taxable > 0 && itemsSum < c.taxable - 1;
  const margin = needMargin ? Math.max(0, (c.taxable || 0) - (c.subtotal || 0)) : 0;
  const alloc = distributeMargin(items, margin);

  const cols = [
    { label: '#', width: 500, align: AlignmentType.LEFT, color: T.gold, font: F.uiSB, size: 9 },
    { label: 'DESCRIPTION', width: CONTENT - 500 - 1100 - 1200 - 1900, align: AlignmentType.LEFT, color: T.ink, font: F.serif, size: 9.6 },
    { label: 'UNIT', width: 1100, align: AlignmentType.LEFT, color: T.mute, font: F.ui, size: 9 },
    { label: 'QTY', width: 1200, align: AlignmentType.RIGHT, color: T.body, font: F.ui, size: 9 },
    { label: 'RATE', width: 1900, align: AlignmentType.RIGHT, color: T.body, font: F.ui, size: 9 },
    { label: 'AMOUNT', width: 1900, align: AlignmentType.RIGHT, color: T.ink, font: F.uiSB, size: 9.4 },
  ];
  // recompute description width so columns sum to CONTENT
  const fixed = 500 + 1100 + 1200 + 1900 + 1900;
  cols[1].width = CONTENT - fixed;
  const rows = items.map((it, i) => {
    const qtyD = num(it.qty, 0) || 1;
    const dispAmount = num(it.amount, 0) + (alloc.get(it) || 0);
    const dispRate = dispAmount / qtyD;
    return [
      [run(String(i + 1), { font: F.uiSB, size: 9, color: T.gold })],
      [run(String(it.item || '—'), { font: F.serif, size: 9.6, color: T.ink })],
      [run(V(it.unit, '—'), { font: F.ui, size: 9, color: T.mute })],
      [run(num(it.qty, 0).toLocaleString('en-IN'), { font: F.ui, size: 9, color: T.body })],
      [run(money(dispRate), { font: F.ui, size: 9, color: T.body })],
      [run(money(dispAmount), { font: F.uiSB, size: 9.4, color: T.ink })],
    ];
  });
  out.push(dataTable(cols, rows));
  out.push(spacer(8));

  // totals (right-aligned block)
  const totRow = (label, val, fill) => new TableRow({
    children: [
      gapCell(CONTENT - 4600),
      new TableCell({ width: { size: 2400, type: WidthType.DXA }, shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined, margins: { top: fill ? 120 : 70, bottom: fill ? 120 : 70, left: 130, right: 60 }, verticalAlign: VerticalAlign.CENTER, borders: noBorders(), children: [P(run(label, { font: fill ? F.uiSB : F.ui, size: fill ? 10.5 : 9.6, color: fill ? T.white : T.body }), { after: 0 })] }),
      new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined, margins: { top: fill ? 120 : 70, bottom: fill ? 120 : 70, left: 60, right: 130 }, verticalAlign: VerticalAlign.CENTER, borders: noBorders(), children: [P(run(money(val), { font: F.uiSB, size: fill ? 13 : 10, color: fill ? T.white : T.ink, bold: true }), { after: 0, align: AlignmentType.RIGHT })] }),
    ],
  });
  const totRows = [totRow('Sub-Total (before GST)', c.taxable)];
  gstRows(c, data).forEach(([l, v]) => totRows.push(totRow(l, v)));
  totRows.push(totRow('Grand Total (incl. GST)', c.total, T.emer));
  out.push(new Table({ width: { size: CONTENT, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [CONTENT - 4600, 2400, 2200], borders: noBorders(), rows: totRows }));
  out.push(spacer(6));
  out.push(para('Quantities, makes and specifications are as per the requirement of the client. Errors & omissions excepted.', { italic: true, size: 8, color: T.mute, after: 6 }));
  out.push(...autoGenNote('bill of quantities'));
  return out;
}

// =============================================================================
//  ORCHESTRATION
//  Word (.docx) is produced ONLY for the Commercial Quotation and the Bill of
//  Quantities — individually, or the two together. Everything else in the
//  document suite (the proposal brochure, the complete package, and any
//  combination that includes the proposal) stays PDF-only.
// =============================================================================
const DOCX_ORDER = ['quotation', 'boq'];
const DOCX_LABEL = { quotation: 'Quotation', boq: 'BOQ' };

function stdSection(tag, children) {
  return {
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1520, bottom: 1180, left: MARGIN, right: MARGIN, header: 560, footer: 340 } } },
    headers: { default: makeHeader(tag) },
    footers: { default: makeFooter() },
    children,
  };
}

// Build the Word document for the requested commercial parts (quotation / boq).
export function buildQuoteDocx(data = {}, requestedParts = ['quotation', 'boq']) {
  const parts = DOCX_ORDER.filter((p) => requestedParts.includes(p));
  const use = parts.length ? parts : ['quotation'];
  const sections = [];
  if (use.includes('quotation')) sections.push(stdSection('Commercial Quotation', quotationChildren(data)));
  if (use.includes('boq')) sections.push(stdSection('Bill of Quantities', boqChildren(data)));
  return new Document({
    creator: 'Arrays Ingenieria',
    title: `${DOCX_LABEL[use[0]] || 'Quotation'} — ${data.quote_number || ''}`.trim(),
    fonts: embeddedFonts(),
    sections,
  });
}

// Build the .docx and return a Buffer.
export async function renderQuoteDocxBuffer(data = {}, parts) {
  return Packer.toBuffer(buildQuoteDocx(data, parts));
}

// Suggested download filename.
export function docxFilename(quoteNumber, requestedParts) {
  const parts = DOCX_ORDER.filter((p) => requestedParts.includes(p));
  const ref = String(quoteNumber || 'quote').replace(/[^A-Za-z0-9._-]+/g, '_');
  const name = parts.length === DOCX_ORDER.length ? 'Quotation-BOQ' : (DOCX_LABEL[parts[0]] || 'Quotation');
  return `${name}_${ref}.docx`;
}

export { quotationChildren, boqChildren };
