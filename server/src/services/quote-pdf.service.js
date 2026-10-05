// Branded, client-ready quotation PDF for ARRAYS INGENIERIA.
// Branding (logo / signature / stamp / header / footer / terms / disclaimer /
// watermark) flows in from the Branding Manager, matching the GST PDF engine.
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { company } from '../config/company.js';
import { UPLOAD_ROOT } from '../middleware/upload.js';
import { applyPdfLang } from './pdf-i18n.js';

function brandFile(branding, key) {
  const name = branding?.[key];
  if (!name) return null;
  const p = path.join(UPLOAD_ROOT, name);
  return fs.existsSync(p) ? p : null;
}
function fitImage(doc, file, x, y, boxW, boxH) {
  if (!file) return false;
  try { doc.image(file, x, y, { fit: [boxW, boxH], align: 'center', valign: 'center' }); return true; }
  catch { return false; }
}
function quoteWatermark(doc, text) {
  if (!text) return;
  const sx = doc.x, sy = doc.y;
  doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fontSize(70).fillColor(WM).fillOpacity(0.05)
    .text(String(text).toUpperCase(), 0, doc.page.height / 2 - 44, { width: doc.page.width, align: 'center', lineBreak: false });
  doc.fillOpacity(1).restore();
  doc.x = sx; doc.y = sy;
}

// ── PDF theme — fully customizable from the Branding Manager ────────────────
const DEFAULT_BRAND = '#' + (company.brandColor || '1d4ed8');
let BRAND = DEFAULT_BRAND;   // accent: section titles, totals, charts
let INK = '#0f172a';         // body text
let MUTE = '#64748b';        // secondary text
let LINE = '#e2e8f0';        // rules & borders
let HEADER_BG = DEFAULT_BRAND;
let HEADER_TX = '#ffffff';
let SUBTX = '#dbeafe';
let THEAD_BG = DEFAULT_BRAND;
let THEAD_TX = '#ffffff';
let WM = DEFAULT_BRAND;
const validHex = (c) => (/^#?[0-9a-fA-F]{6}$/.test(String(c || '').trim()) ? (String(c).trim()[0] === '#' ? String(c).trim() : '#' + String(c).trim()) : null);
const mix2 = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + [m(16), m(8), m(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
};
function setTheme(b = {}) {
  BRAND = validHex(b.pdfColor) || DEFAULT_BRAND;
  INK = validHex(b.textColor) || '#0f172a';
  MUTE = validHex(b.mutedColor) || '#64748b';
  LINE = validHex(b.lineColor) || '#e2e8f0';
  HEADER_BG = validHex(b.headerBgColor) || BRAND;
  HEADER_TX = validHex(b.headerTextColor) || '#ffffff';
  SUBTX = mix2(HEADER_TX, HEADER_BG, 0.28);
  THEAD_BG = validHex(b.tableHeadBgColor) || BRAND;
  THEAD_TX = validHex(b.tableHeadTextColor) || '#ffffff';
  WM = validHex(b.watermarkColor) || BRAND;
}
// pdfkit's standard Helvetica (WinAnsi) has no ₹ glyph (it prints as "¹"); use
// an ASCII "Rs " prefix that renders correctly on every platform.
const inr = (n) => 'Rs ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n || 0));
const TYPE_LABEL = {
  residential: 'Residential Rooftop', rooftop: 'Rooftop Solar', commercial: 'Commercial',
  industrial: 'Industrial', institutional: 'Institutional', government: 'Government',
  ground_mount: 'Ground Mount', utility: 'Utility-Scale',
};

export function streamQuotePdf(res, quote, branding = {}, lang = 'en') {
  setTheme(branding);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  applyPdfLang(doc, lang);
  const safe = String(quote.quote_number || 'quote').replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
  doc.pipe(res);

  const M = doc.page.margins.left;
  const W = doc.page.width - M * 2;
  const bottom = () => doc.page.height - 70;
  const ensure = (need) => { if (doc.y + need > bottom()) doc.addPage(); };

  // ── Header band (logo + company) ──────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 96).fill(HEADER_BG);
  let hx = M;
  if (fitImage(doc, brandFile(branding, 'logoFile'), M, 22, 52, 52)) hx = M + 62;
  const lw = W - 160 - (hx - M);   // name width — must stay clear of the right-side QUOTATION title
  const fullW = W - (hx - M);      // sub-lines sit BELOW the title → full content width (W is already page-2M)
  doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(18).text(branding.headerText || company.pdfName, hx, 20, { width: lw, height: 22, ellipsis: true });
  doc.font('Helvetica').fontSize(7.5).fillColor(SUBTX)
    .text(company.tagline, hx, 44, { width: fullW, height: 9, ellipsis: true })
    .text(`GSTIN ${branding.gstin || company.gstin}  |  CIN ${branding.cin || company.cin}`, hx, 56, { width: fullW, height: 9, ellipsis: true })
    .text(branding.headerAddr || company.address, hx, 67, { width: fullW, height: 9, ellipsis: true })
    .text(`${branding.contactInfo || company.email}  |  ${company.certifications.join(' · ')}`, hx, 78, { width: fullW, height: 9, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(22).fillColor(HEADER_TX).text('QUOTATION', M, 24, { width: W, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(SUBTX)
    .text(quote.quote_number + (quote.version > 1 ? `  (Rev ${quote.version})` : ''), M, 50, { width: W, align: 'right' });
  doc.y = 112;
  quoteWatermark(doc, branding.watermark);

  // ── Meta grid ─────────────────────────────────────────────────────────────
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const meta = [
    ['Client', quote.client_name || '—'], ['Issue Date', fmtDate(quote.issue_date)],
    ['Project', quote.project_name || '—'], ['Valid Until', fmtDate(quote.valid_until)],
    ['Site', quote.site_name || '—'], ['System Size', `${quote.capacity_kw} kW`],
    ['Type', TYPE_LABEL[quote.project_type] || quote.project_type], ['Per Watt', quote.per_watt ? inr(quote.per_watt) : '—'],
  ];
  let my = doc.y;
  doc.fontSize(8.5);
  for (let i = 0; i < meta.length; i += 2) {
    metaCell(doc, M, my, meta[i][0], meta[i][1], W / 2 - 6);
    if (meta[i + 1]) metaCell(doc, M + W / 2 + 6, my, meta[i + 1][0], meta[i + 1][1], W / 2 - 6);
    my += 17;
  }
  doc.y = my + 8;

  // ── Opening letter ────────────────────────────────────────────────────────
  openingLetter(doc, quote, branding);

  // ── BOQ table ─────────────────────────────────────────────────────────────
  section(doc, 'Scope & Bill of Quantities');
  const cols = [
    { h: 'Item', w: 0.36, k: 'item', a: 'left' },
    { h: 'Qty', w: 0.12, k: 'qty', a: 'right' },
    { h: 'Unit', w: 0.10, k: 'unit', a: 'left' },
    { h: 'Rate', w: 0.20, k: 'rate', a: 'right', m: true },
    { h: 'Amount', w: 0.22, k: 'amount', a: 'right', m: true },
  ];
  drawTableHeader(doc, cols, W, M);
  doc.font('Helvetica').fontSize(8.5).fillColor(INK);
  const itemW = cols[0].w * W - 10;
  (quote.line_items || []).forEach((row, idx) => {
    // Row height grows to fit the wrapped Item description — no cut-off.
    doc.font('Helvetica').fontSize(8.5);
    const rowH = Math.max(16, doc.heightOfString(String(row.item ?? ''), { width: itemW }) + 7);
    if (doc.y + rowH > bottom()) { doc.addPage(); drawTableHeader(doc, cols, W, M); }
    const y = doc.y;
    if (idx % 2 === 0) doc.rect(M, y, W, rowH).fill('#f1f5f9');
    let cx = M;
    cols.forEach((c) => {
      let v = row[c.k];
      v = c.m ? inr(v) : c.k === 'qty' ? new Intl.NumberFormat('en-IN').format(Number(v || 0)) : String(v ?? '');
      if (c.k === 'item') doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(v, cx + 5, y + 4, { width: c.w * W - 10 });
      else doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(v, cx + 5, y + 4, { width: c.w * W - 10, align: c.a, ellipsis: true, lineBreak: false });
      cx += c.w * W;
    });
    doc.y = y + rowH;
  });

  // ── Commercial summary ────────────────────────────────────────────────────
  ensure(150);
  doc.moveDown(0.6);
  const boxX = M + W * 0.5;
  const boxW = W * 0.5;
  let ty = doc.y;
  const totals = [
    ['Subtotal', quote.subtotal], ['Contingency', quote.contingency_amount],
    ['Margin', quote.margin_amount], ['Taxable Value', quote.taxable_amount], ['GST', quote.gst_amount],
  ];
  doc.fontSize(9);
  totals.forEach((t) => {
    doc.fillColor(MUTE).font('Helvetica').text(t[0], boxX, ty, { width: boxW * 0.5 });
    doc.fillColor(INK).font('Helvetica').text(inr(t[1]), boxX + boxW * 0.5, ty, { width: boxW * 0.5, align: 'right' });
    ty += 15;
  });
  doc.rect(boxX, ty + 2, boxW, 22).fill(THEAD_BG);
  doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(11)
    .text('Grand Total (incl. GST)', boxX + 6, ty + 8, { width: boxW * 0.55 })
    .text(inr(quote.total_amount), boxX, ty + 8, { width: boxW - 6, align: 'right' });
  ty += 30;

  // Subsidy section (if any)
  if (Number(quote.subsidy_amount) > 0) {
    doc.fontSize(9);
    [['Gross Cost', quote.total_amount], ['Govt. Subsidy', -quote.subsidy_amount], ['Net Effective Cost', quote.net_cost]].forEach((t, i) => {
      doc.fillColor(i === 1 ? '#059669' : MUTE).font(i === 2 ? 'Helvetica-Bold' : 'Helvetica').text(t[0], boxX, ty, { width: boxW * 0.5 });
      doc.fillColor(i === 2 ? INK : (i === 1 ? '#059669' : INK)).font(i === 2 ? 'Helvetica-Bold' : 'Helvetica').text(inr(t[1]), boxX + boxW * 0.5, ty, { width: boxW * 0.5, align: 'right' });
      ty += 15;
    });
  }

  // Cost-breakdown mini bar chart on the left
  costBreakdownChart(doc, M, doc.y, W * 0.46, quote.line_items || []);
  doc.y = Math.max(doc.y, ty) + 10;

  // ── Why Solar — value, ROI & environmental impact ─────────────────────────
  {
    const st = solarStats(quote);
    ensure(190);
    section(doc, 'Why Go Solar — Returns & Environmental Impact');

    // headline financial cards
    const cards = [
      ['Annual Savings', inr(st.annualSave), 'on your electricity bill'],
      ['Payback Period', `${st.payback.toFixed(1)} yrs`, 'to recover the investment'],
      ['25-Year Savings', inr(st.lifeSave), 'cumulative, with tariff rise'],
      ['Lifetime ROI', `${st.roi.toFixed(0)}%`, 'return on net investment'],
    ];
    const cw = W / 4, cy = doc.y;
    cards.forEach((c, i) => {
      const x = M + i * cw;
      doc.roundedRect(x + 3, cy, cw - 6, 50, 6).fill('#eff6ff');
      doc.fillColor(MUTE).font('Helvetica').fontSize(7).text(c[0].toUpperCase(), x + 9, cy + 7, { width: cw - 18 });
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(13).text(c[1], x + 9, cy + 18, { width: cw - 18, lineBreak: false });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5).text(c[2], x + 9, cy + 37, { width: cw - 18, lineBreak: false });
    });
    doc.y = cy + 60;

    // environmental + generation strip
    const env = [
      ['Clean Energy / yr', `${Math.round(st.genYear).toLocaleString('en-IN')} units`],
      ['CO2 Avoided / yr', `${st.co2Year.toFixed(1)} tonnes`],
      ['25-yr CO2 Avoided', `${Math.round(st.co2Life)} tonnes`],
      ['Trees Equivalent', `${Math.round(st.trees).toLocaleString('en-IN')} trees`],
      ['Effective Cost', `Rs ${st.effUnit.toFixed(2)}/unit`],
    ];
    const ew = W / env.length, ey = doc.y;
    env.forEach((c, i) => {
      const x = M + i * ew;
      doc.roundedRect(x + 2, ey, ew - 4, 40, 5).fill('#f0fdf4');
      doc.fillColor('#15803d').font('Helvetica').fontSize(6.5).text(c[0].toUpperCase(), x + 7, ey + 7, { width: ew - 14 });
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(10.5).text(c[1], x + 7, ey + 19, { width: ew - 14, lineBreak: false });
    });
    doc.y = ey + 50;

    // 25-year cumulative savings chart
    ensure(86);
    const chTop = doc.y, chH = 64, chW = W;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND).text('Cumulative Savings over 25 Years (indicative)', M, chTop);
    const pts = st.cumulative;            // [{year, value}] at 5-year milestones
    const maxV = Math.max(...pts.map((p) => p.value), 1);
    const baseY = chTop + 14 + chH, bw = chW / pts.length;
    pts.forEach((p, i) => {
      const bh = Math.max(2, (p.value / maxV) * chH);
      const x = M + i * bw + bw * 0.2;
      doc.rect(x, baseY - bh, bw * 0.6, bh).fill(i === pts.length - 1 ? '#059669' : BRAND);
      doc.fillColor(MUTE).font('Helvetica').fontSize(6.5).text(`Yr ${p.year}`, M + i * bw, baseY + 3, { width: bw, align: 'center' });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(6.5).text(compactInr(p.value), M + i * bw, baseY - bh - 9, { width: bw, align: 'center', lineBreak: false });
    });
    doc.y = baseY + 14;

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTE).text(
      `A ${quote.capacity_kw} kW solar plant generates clean power for 25+ years, cutting your grid dependency and rising tariff exposure. ` +
      `After a ${st.payback.toFixed(1)}-year payback it effectively delivers electricity at about Rs ${st.effUnit.toFixed(2)}/unit — a fraction of grid rates — ` +
      'while avoiding significant CO2 emissions. Figures are indicative estimates based on typical Indian generation, tariff escalation and grid-emission factors.',
      M, doc.y, { width: W });
    doc.moveDown(0.6);
  }

  // ── Annexures — scope matrix, technical spec, assumptions & exclusions ─────
  doc.addPage();
  scopeMatrix(doc, quote);
  technicalSpec(doc, quote);
  assumptionsExclusions(doc, quote);

  // ── Terms / scope / exclusions ────────────────────────────────────────────
  [['Technical Scope', quote.notes || branding.quoteScope], ['Commercial Terms', quote.terms || branding.quoteTerms || defaultTerms()], ['Exclusions', quote.exclusions || branding.quoteExclusions || defaultExclusions()]]
    .forEach(([h, body]) => {
      if (!body) return;
      ensure(60);
      section(doc, h);
      doc.font('Helvetica').fontSize(8).fillColor('#334155').text(body, M, doc.y, { width: W });
      doc.moveDown(0.6);
    });

  // ── Signature block (with branded signature + stamp) ──────────────────────
  ensure(76);
  doc.moveDown(1);
  const sy = doc.y;
  fitImage(doc, brandFile(branding, 'stampFile'), M + W - 250, sy, 60, 48);
  fitImage(doc, brandFile(branding, 'signatureFile'), M + W - 175, sy, 110, 44);
  doc.font('Helvetica').fontSize(8).fillColor(MUTE).text(`For ${branding.headerText || company.pdfName}`, M + W - 200, sy - 2, { width: 200, align: 'right', lineBreak: false });
  doc.moveTo(M + W - 200, sy + 46).lineTo(M + W, sy + 46).strokeColor('#94a3b8').lineWidth(0.6).stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.5).text('Authorized Signatory', M + W - 200, sy + 50, { width: 200, align: 'right' });
  doc.y = sy + 64;

  // ── Footer on every page ──────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;   // footer sits in the margin band — stop pdfkit from auto-paginating
    const fy = doc.page.height - 50;
    doc.moveTo(M, fy).lineTo(M + W, fy).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(MUTE)
      .text(`${company.bank.name}  •  A/c ${company.bank.accountNumber}  •  ${company.bank.branch}`, M, fy + 6, { width: W * 0.8, lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, M, fy + 6, { width: W, align: 'right', lineBreak: false })
      .text(branding.footerText || `Prices valid until the date stated. System-generated by ${company.shortName} ERP.`, M, fy + 17, { width: W, lineBreak: false });
    if (branding.disclaimer) doc.fontSize(6).fillColor('#94a3b8').text(branding.disclaimer, M, fy + 27, { width: W, lineBreak: false });
  }
  doc.flushPages();
  doc.end();
}

// Indicative solar generation / savings / environmental model (Indian averages).
function solarStats(quote) {
  const cap = Number(quote.capacity_kw || 0);
  const YIELD = 1450;                       // kWh per kWp per year
  const CO2 = 0.82;                         // kg CO2 per kWh (India grid)
  const ESC = 0.03;                         // 3% annual tariff escalation
  const genYear = cap * YIELD;
  const genLife = genYear * 25 * 0.91;      // ~9% cumulative degradation over 25y
  const annualSave = Number(quote.annual_savings) || genYear * 8;       // fallback ₹8/unit
  const netCost = Number(quote.net_cost) || Number(quote.total_amount) || 0;
  const payback = Number(quote.payback_years) || (annualSave ? netCost / annualSave : 0);
  const cumAt = (yrs) => annualSave * ((Math.pow(1 + ESC, yrs) - 1) / ESC);   // growing annuity
  const lifeSave = Number(quote.lifetime_savings) || cumAt(25);
  const roi = netCost ? (lifeSave / netCost) * 100 : 0;
  const co2Year = (genYear * CO2) / 1000;   // tonnes/yr
  const co2Life = (genLife * CO2) / 1000;
  const trees = co2Life / 0.55;             // ~0.55 t CO2 sequestered per tree over 25y
  const effUnit = genLife ? netCost / genLife : 0;
  const cumulative = [5, 10, 15, 20, 25].map((year) => ({ year, value: cumAt(year) }));
  return { genYear, genLife, annualSave, netCost, payback, lifeSave, roi, co2Year, co2Life, trees, effUnit, cumulative };
}
function compactInr(n) {
  n = Number(n || 0);
  // Indian numbering: Crore / Lakh, then full Indian-grouped (no Western "k").
  if (n >= 1e7) return 'Rs ' + (n / 1e7).toFixed(1) + 'Cr';
  if (n >= 1e5) return 'Rs ' + (n / 1e5).toFixed(1) + 'L';
  return 'Rs ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
}

function metaCell(doc, x, y, label, value, w) {
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, y, { width: w * 0.38 });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(String(value), x + w * 0.38, y - 1, { width: w * 0.62 });
}
function section(doc, title) {
  const M = doc.page.margins.left;
  const W = doc.page.width - M * 2;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND).text(title, M, doc.y);
  doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).strokeColor(LINE).lineWidth(0.6).stroke();
  doc.moveDown(0.5);
}
function drawTableHeader(doc, cols, W, M) {
  const y = doc.y;
  doc.rect(M, y, W, 18).fill(THEAD_BG);
  doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(8.5);
  let cx = M;
  cols.forEach((c) => { doc.text(c.h, cx + 5, y + 5, { width: c.w * W - 10, align: c.a, lineBreak: false }); cx += c.w * W; });
  doc.y = y + 18;
}
function costBreakdownChart(doc, x, y, w, items) {
  const top = [...items].filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 6);
  if (!top.length) return;
  const max = Math.max(...top.map((i) => i.amount));
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND).text('Cost Breakdown', x, y);
  let by = y + 16;
  doc.fontSize(7).font('Helvetica');
  top.forEach((i) => {
    doc.fillColor('#475569').text(i.item, x, by, { width: w, ellipsis: true });
    by += 10;
    const bw = Math.max(2, (i.amount / max) * w);
    doc.rect(x, by, bw, 7).fill(BRAND);
    doc.fillColor('#475569').fontSize(6.5).text(inr(i.amount), x + bw + 4, by, { width: 80 });
    by += 13;
    doc.fontSize(7);
  });
  doc.y = Math.max(doc.y, by);
}
// ── Opening acknowledgement letter (adds the warm, professional preamble) ────
function openingLetter(doc, quote, branding) {
  const M = doc.page.margins.left, W = doc.page.width - M * 2;
  const name = quote.client_name || 'Sir / Madam';
  doc.roundedRect(M, doc.y, W, 6, 0);            // spacer
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`Kind Attention: ${name}`, M, doc.y + 4, { width: W });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(8.7).fillColor('#334155').text(
    (branding.quoteIntro
      || `${branding.headerText || company.pdfName} is a trusted provider of innovative solar and renewable-energy solutions, delivering efficient, reliable and sustainable systems for residential, commercial and industrial applications. Driven by discipline, innovation and excellence, we are committed to accelerating the transition to a cleaner, greener future.`),
    M, doc.y, { width: W, align: 'justify' });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(8.7).fillColor('#334155').text(
    `We sincerely acknowledge receipt of your enquiry and thank you for the opportunity. With reference to the same, we are pleased to submit our competitive proposal for a ${quote.capacity_kw} kW ${(TYPE_LABEL[quote.project_type] || quote.project_type || 'solar')} plant, detailed below.`,
    M, doc.y, { width: W, align: 'justify' });
  doc.moveDown(0.6);
}

// ── Reusable bordered data-table with wrapping cells, striping, group rows and
//    automatic page breaks. `rows` items may be { group: 'Heading' } or an
//    array of cell values matching `cols`. Cells can be { text, badge } objects.
function dataTable(doc, cols, rows, opts = {}) {
  const M = doc.page.margins.left, W = doc.page.width - M * 2;
  const bottom = () => doc.page.height - 70;
  const fs = opts.fontSize || 8.2, pad = 5;
  const colW = (i) => cols[i].w * W;
  const header = () => {
    const y = doc.y;
    doc.rect(M, y, W, 18).fill(THEAD_BG);
    doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(fs);
    let cx = M;
    cols.forEach((c) => { doc.text(c.h, cx + pad, y + 5, { width: colW(cols.indexOf(c)) - pad * 2, align: c.a || 'left', lineBreak: false }); cx += colW(cols.indexOf(c)); });
    doc.y = y + 18;
  };
  header();
  let stripe = 0;
  rows.forEach((r) => {
    // Group heading row
    if (r && r.group) {
      if (doc.y + 16 > bottom()) { doc.addPage(); header(); }
      doc.rect(M, doc.y, W, 15).fill(mix2(BRAND, '#ffffff', 0.86));
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(fs).text(r.group, M + pad, doc.y + 4, { width: W - pad * 2, lineBreak: false });
      doc.y += 15;
      return;
    }
    const cells = r;
    // measure row height from wrapping text cells
    let h = 15;
    cells.forEach((cell, i) => {
      const t = cell && typeof cell === 'object' ? (cell.text || '') : String(cell ?? '');
      doc.font('Helvetica').fontSize(fs);
      h = Math.max(h, doc.heightOfString(t, { width: colW(i) - pad * 2 }) + 8);
    });
    if (doc.y + h > bottom()) { doc.addPage(); header(); stripe = 0; }
    const y = doc.y;
    if (stripe % 2 === 0) doc.rect(M, y, W, h).fill('#f8fafc');
    doc.rect(M, y, W, h).lineWidth(0.4).strokeColor(LINE).stroke();
    let cx = M;
    cells.forEach((cell, i) => {
      const isObj = cell && typeof cell === 'object';
      const t = isObj ? (cell.text || '') : String(cell ?? '');
      if (isObj && cell.badge) {
        const tone = cell.badge === 'client' ? ['#fef3c7', '#92400e'] : ['#dcfce7', '#166534'];
        const label = cell.badge === 'client' ? 'CLIENT' : (isObj && cell.text ? cell.text : 'ARRAYS');
        doc.roundedRect(cx + pad, y + (h - 12) / 2, 48, 12, 6).fill(tone[0]);
        doc.fillColor(tone[1]).font('Helvetica-Bold').fontSize(6.6).text(label, cx + pad, y + (h - 12) / 2 + 3, { width: 48, align: 'center', lineBreak: false });
      } else {
        doc.fillColor(cols[i].bold ? INK : '#334155').font(cols[i].bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs)
          .text(t, cx + pad, y + 4, { width: colW(i) - pad * 2, align: cols[i].a || 'left' });
      }
      cx += colW(i);
    });
    doc.y = y + h;
    stripe++;
  });
  doc.moveDown(0.5);
}

// ── Annexure 1 — Scope Matrix (supply & responsibility split) ───────────────
function scopeMatrix(doc) {
  section(doc, 'Annexure 1 — Scope Matrix');
  const cols = [
    { h: 'Sl.', w: 0.08, a: 'center' },
    { h: 'Supply Item', w: 0.62, bold: false },
    { h: 'Responsibility', w: 0.30, a: 'center' },
  ];
  const A = { badge: 'arrays' }, C = { badge: 'client' };
  const rows = [
    { group: '1. Array Yard' },
    ['1.1', 'Solar PV Modules', A], ['1.2', 'Grid-tie / Hybrid Inverter', A],
    { group: '2. Mechanical & Civil (BOS)' },
    ['2.1', 'Module Mounting Structure (MMS)', A], ['2.2', 'MMS & Module Fasteners', A], ['2.3', 'Civil Foundation (if applicable)', A],
    { group: '3. Electrical (BOS)' },
    ['3.1', 'Solar DC Cable (Array to Inverter)', A], ['3.2', 'AC Cable (Inverter to LT panel)', A],
    ['3.3', 'Module & Inverter Earthing Cable', A], ['3.4', 'DCDB / ACDB / MCCB', A],
    { group: '4. Evacuation (BOS)' },
    ['4.1', 'Spare evacuation point at each roof', C], ['4.2', 'Technical specification & drawings', A],
    { group: '5. Protection (BOS)' },
    ['5.1', 'Earthing system', A], ['5.2', 'Lightning-arrestor system', A],
    { group: '6. Hardware / Miscellaneous (BOS)' },
    ['6.1', 'PVC pipe for cable laying', A], ['6.2', 'Lugs & glands', A],
    ['6.3', 'Cement / sand / aggregate / civil works, technician lodging, net-metering / LTCT cost', C],
    { group: '7. Services (BOS)' },
    ['7.1', 'Installation & Commissioning', A],
  ];
  dataTable(doc, cols, rows);
}

// ── Annexure 2 — Technical Specification of the plant ───────────────────────
function technicalSpec(doc, quote) {
  section(doc, 'Annexure 2 — Technical Specification of Plant');
  const cap = quote.capacity_kw || '—';
  const roof = /ground/i.test(quote.project_type || '') ? 'Ground-mounted' : 'RCC Rooftop';
  const cols = [
    { h: 'Sl.', w: 0.07, a: 'center' },
    { h: 'Activity', w: 0.34, bold: true },
    { h: 'UoM', w: 0.12, a: 'center' },
    { h: 'Qty.', w: 0.15, a: 'center' },
    { h: 'Specification / Make', w: 0.32 },
  ];
  const rows = [
    ['1', 'Inverter Capacity (On-Grid)', 'kVA', String(cap), 'Grid-tie string inverter, IEC-certified'],
    ['2', 'DC Capacity', 'kWp', String(cap), 'Mono-PERC / Bifacial DCR modules'],
    ['3', 'Type of Installation', '—', '—', roof],
    ['4', 'Power Evacuation', '—', '—', '440 V / 3-phase at main LT panel'],
    ['5', 'Module Mounting', '—', '—', 'Hot-dip galvanised (Tata / Jindal grade)'],
    ['6', 'Monitoring', '—', '—', 'Remote Wi-Fi / GPRS data logging'],
    ['7', 'Warranty', 'Years', '25 / 5', 'Module performance 25 yrs · inverter 5 yrs'],
  ];
  dataTable(doc, cols, rows);
}

// ── Annexure 3 — Assumptions & Exclusions ───────────────────────────────────
function assumptionsExclusions(doc) {
  section(doc, 'Annexure 3 — Assumptions & Exclusions');
  const cols = [
    { h: 'S.No.', w: 0.09, a: 'center' },
    { h: 'Activity', w: 0.28, bold: true },
    { h: 'Assumption / Exclusion', w: 0.63 },
  ];
  const rows = [
    ['1', 'PV Capacity', 'Proposed capacity & bill of material may vary from actual site conditions after detailed engineering.'],
    ['2', 'Site Accessibility', 'A shadow-free rooftop area suitable for installation, with easy access for erection & maintenance, to be provided by the client.'],
    ['3', 'Load Bearing', 'Roof load-bearing capacity must be adequate to carry the MMS system considering the applicable wind-zone load.'],
    ['4', 'Component Makes', 'Best-evaluated vendor items are packaged & delivered; equivalent makes may be substituted on availability.'],
    ['5', 'DC Cabling', 'Module inter-connection may be partially routed through PVC conduits as per site.'],
    ['6', 'Standards', 'All works as per the relevant IEC / IS codes.'],
    ['7', 'Water & Electricity', 'Construction water & power to be arranged by the client at site.'],
    ['8', 'Connectivity', 'LAN / Wi-Fi to be provided by the client for the remote-monitoring system during commissioning.'],
    ['9', 'AMC / Warranty', '2 years free AMC · 25-year module performance warranty.'],
  ];
  dataTable(doc, cols, rows);
}

function defaultTerms() {
  return '1. Payment: 30% advance, 60% against material delivery, 10% on commissioning. ' +
    '2. Delivery: 4–6 weeks from PO & advance. 3. Warranty: OEM (modules 25 yrs performance, inverter 5 yrs). ' +
    '4. Prices exclusive of statutory levies introduced after the quotation date.';
}
function defaultExclusions() {
  return 'Net-metering liaisoning & DISCOM fees, civil work beyond standard scope, DG/grid synchronization, ' +
    'storage/batteries, and any work not explicitly listed above.';
}
