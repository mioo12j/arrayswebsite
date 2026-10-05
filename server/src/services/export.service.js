// ============================================================================
//  Export service — professional Excel (exceljs) & PDF (pdfkit) generators.
//  PDF engine: content-aware column widths, text WRAPPING (no truncation),
//  variable row height, branded header/footer on every page, page numbers,
//  totals row. Nothing is ever cut off — it wraps or spills to a new page.
// ============================================================================
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { company } from '../config/company.js';
import { applyPdfLang, translateLabel, normLang } from './pdf-i18n.js';

// Label translator (identity in English; Devanagari labels in Hindi).
const tr = (lang) => (normLang(lang) === 'hi' ? translateLabel : (s) => s);

const DEFAULT_BRAND = (company.brandColor || '1d4ed8').replace('#', '');
// ── PDF/Excel theme — fully customizable from the Branding Manager ──────────
let BRAND = DEFAULT_BRAND;      // 6-hex (no #) for Excel argb
let HBRAND = '#' + BRAND;       // accent (#hex) for PDF
let INK = '#0f172a';            // body text
let MUTE = '#64748b';           // secondary text
let LINE = '#e2e8f0';           // rules & borders
let HEADER_BG = HBRAND;         // page header band bg
let HEADER_TX = '#ffffff';      // page header text
let SUBTX = '#dbeafe';          // page header secondary text (derived)
let THEAD_BG = HBRAND;          // table header bg (PDF)
let THEAD_TX = '#ffffff';       // table header text
let THEAD_BG6 = BRAND;          // table header bg (Excel argb, no #)
let THEAD_TX6 = 'FFFFFF';       // table header text (Excel argb, no #)
const ZEBRA = '#f3f6fb';

const validHex6 = (c) => { const m = String(c || '').trim().replace('#', ''); return /^[0-9a-fA-F]{6}$/.test(m) ? m : null; };
const mix2 = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + [m(16), m(8), m(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

// Load the saved branding so exports match invoices (full theme + header/footer text).
async function loadBranding() {
  let cfg = {};
  try {
    const { pool } = await import('../config/db.js');
    const b = await import('./gst/brandingService.js');
    cfg = (await b.get(pool)) || {};
  } catch { cfg = {}; }
  BRAND = validHex6(cfg.pdfColor) || DEFAULT_BRAND;
  HBRAND = '#' + BRAND;
  INK = '#' + (validHex6(cfg.textColor) || '0f172a');
  MUTE = '#' + (validHex6(cfg.mutedColor) || '64748b');
  LINE = '#' + (validHex6(cfg.lineColor) || 'e2e8f0');
  HEADER_BG = '#' + (validHex6(cfg.headerBgColor) || BRAND);
  HEADER_TX = '#' + (validHex6(cfg.headerTextColor) || 'ffffff');
  SUBTX = mix2(HEADER_TX, HEADER_BG, 0.28);
  THEAD_BG6 = validHex6(cfg.tableHeadBgColor) || BRAND;
  THEAD_TX6 = validHex6(cfg.tableHeadTextColor) || 'FFFFFF';
  THEAD_BG = '#' + THEAD_BG6;
  THEAD_TX = '#' + THEAD_TX6;
  return cfg;
}

const money = (n) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

const safeName = (f) =>
  String(f || 'report').replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').replace(/\s+/g, '-').trim() || 'report';

const cellText = (row, col) => {
  const v = row[col.key];
  if (v == null || v === '') return '';
  return col.money ? money(v) : String(v);
};

// ─────────────────────────────────────────────────────────────────────────────
//  EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export async function streamExcel(res, { title, columns, rows, filename, totals }, lang = 'en') {
  const brand = await loadBranding();
  const T = tr(lang);
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  const ws = wb.addWorksheet((T(title) || 'Report').slice(0, 30));

  ws.mergeCells(1, 1, 1, columns.length);
  const co = ws.getCell(1, 1);
  co.value = brand.headerText || company.name;
  co.font = { size: 15, bold: true, color: { argb: 'FF' + BRAND } };
  ws.getRow(1).height = 22;

  ws.mergeCells(2, 1, 2, columns.length);
  const sub = ws.getCell(2, 1);
  sub.value = `${T(title)}   •   GSTIN ${company.gstin}   •   ${company.email}`;
  sub.font = { size: 9, color: { argb: 'FF64748B' } };

  const headerRowIdx = 4;
  ws.getRow(headerRowIdx).values = columns.map((c) => T(c.header));
  ws.getRow(headerRowIdx).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF' + THEAD_TX6 } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + THEAD_BG6 } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.xlsWidth || c.width || 18;
    ws.getColumn(i + 1).alignment = { wrapText: true, horizontal: c.money ? 'right' : 'left', vertical: 'top' };
    if (c.money) ws.getColumn(i + 1).numFmt = '#,##0.00';
  });

  rows.forEach((r, idx) => {
    const row = ws.addRow(columns.map((c) => r[c.key] ?? ''));
    if (idx % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });

  if (totals) {
    const trow = ws.addRow(columns.map((c) => (c.key in totals ? T(totals[c.key]) : (c === columns[0] ? T('TOTAL') : ''))));
    trow.eachCell((cell) => { cell.font = { bold: true }; cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }; });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(filename)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function streamPdf(res, { title, subtitle, columns, rows, filename, totals }, lang = 'en') {
  const brand = await loadBranding();
  const T = tr(lang);
  const landscape = columns.length > 5;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 32, bufferPages: true });
  applyPdfLang(doc, lang); // remap font→Devanagari & auto-translate drawn labels (Hindi only)
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(filename)}.pdf"`);
  doc.pipe(res);

  const M = doc.page.margins.left;
  const pageW = doc.page.width;
  const contentW = pageW - M * 2;
  const HEADER_H = 96;
  const FOOTER_H = 38;
  const PAD = 8;            // horizontal cell padding (total)
  const VPAD = 5;          // vertical cell padding (top)
  const FONT = 8;
  const HFONT = 8.5;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - FOOTER_H;

  // ── Content-aware column widths ──────────────────────────────────────────
  // Measure the natural width each column needs (header + a sample of rows),
  // cap any single column so it can't dominate, then fit to the page width.
  doc.font('Helvetica-Bold').fontSize(HFONT);
  const headerW = columns.map((c) => doc.widthOfString(T(String(c.header))) + PAD + 6);
  const sample = rows.length > 300 ? rows.filter((_, k) => k % Math.ceil(rows.length / 300) === 0) : rows;
  doc.font('Helvetica').fontSize(FONT);
  const natural = columns.map((c, i) => {
    let w = headerW[i];
    for (const r of sample) {
      const tw = doc.widthOfString(T(cellText(r, c))) + PAD;
      if (tw > w) w = tw;
    }
    return w + 4; // small safety buffer so exact-fit text never wraps
  });
  // Split columns into NARROW (dates, amounts, refs, short labels) which must
  // never wrap, and WIDE/flex (remarks, comments, names) which absorb wrapping.
  // This keeps a date like "02/05/2026" or an amount on a single line while long
  // free-text fields wrap at word boundaries instead.
  const FIXED_MAX = 118;
  const FLEX_MIN = 70;
  const fixedIdx = [];
  const flexIdx = [];
  natural.forEach((w, i) => (w <= FIXED_MAX ? fixedIdx : flexIdx).push(i));

  let widths = natural.slice();
  const fixedSum = fixedIdx.reduce((s, i) => s + natural[i], 0);

  if (flexIdx.length) {
    const remaining = contentW - fixedSum;
    if (remaining >= flexIdx.length * FLEX_MIN) {
      // Fixed columns keep their exact natural width (no wrap on dates/amounts).
      // Flex columns: give each FLEX_MIN, then split the leftover by natural size
      // so the row fills the page exactly without shrinking fixed columns.
      fixedIdx.forEach((i) => { widths[i] = natural[i]; });
      const leftover = remaining - flexIdx.length * FLEX_MIN;
      const flexNat = flexIdx.reduce((s, i) => s + natural[i], 0) || 1;
      flexIdx.forEach((i) => { widths[i] = FLEX_MIN + leftover * (natural[i] / flexNat); });
    } else {
      // Too many/large columns: shrink everything proportionally as a last resort.
      const want = fixedSum + flexIdx.length * FLEX_MIN;
      const scale = contentW / want;
      fixedIdx.forEach((i) => { widths[i] = natural[i] * scale; });
      flexIdx.forEach((i) => { widths[i] = FLEX_MIN * scale; });
    }
  } else {
    const sum = widths.reduce((a, b) => a + b, 0);
    const extra = contentW - sum;
    widths = widths.map((w) => w + (extra > 0 ? extra / widths.length : extra * (w / sum)));
  }
  const colX = [];
  let acc = M;
  widths.forEach((w) => { colX.push(acc); acc += w; });
  const align = (c) => c.align || (c.money ? 'right' : 'left');

  function drawPageHeader() {
    doc.rect(0, 0, pageW, HEADER_H).fill(HEADER_BG);
    const lw = contentW - 170;   // company block width — stays clear of the right-side title/date
    doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(16).text(brand.headerText || company.pdfName, M, 16, { width: lw, height: 18, ellipsis: true });
    doc.font('Helvetica').fontSize(7.5).fillColor(SUBTX)
      .text(`GSTIN: ${company.gstin}    CIN: ${company.cin}`, M, 38, { width: lw, height: 9, ellipsis: true })
      .text(company.address, M, 49, { width: lw, height: 9, ellipsis: true })
      .text(`${company.email}    ${company.certifications.join('  ·  ')}`, M, 60, { width: lw, height: 9, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(HEADER_TX).text(title, M, 20, { width: contentW, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(SUBTX)
      .text(subtitle || `Generated ${new Date().toLocaleDateString('en-GB')}`, M, 40, { width: contentW, align: 'right', lineBreak: false });
    return HEADER_H + 12;
  }

  function drawTableHeader(y) {
    // header height adapts to wrapped header labels
    doc.font('Helvetica-Bold').fontSize(HFONT);
    let hh = FONT + VPAD * 2;
    columns.forEach((c, i) => {
      const h = doc.heightOfString(T(String(c.header)), { width: widths[i] - PAD, align: align(c) }) + VPAD * 2;
      if (h > hh) hh = h;
    });
    doc.rect(M, y, contentW, hh).fill(THEAD_BG);
    doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(HFONT);
    columns.forEach((c, i) => {
      doc.text(String(c.header), colX[i] + PAD / 2, y + VPAD, { width: widths[i] - PAD, align: align(c) });
    });
    return y + hh;
  }

  function rowHeight(r) {
    doc.font('Helvetica').fontSize(FONT);
    let hh = FONT + VPAD * 2;
    columns.forEach((c, i) => {
      const h = doc.heightOfString(T(cellText(r, c)), { width: widths[i] - PAD, align: align(c) }) + VPAD * 2;
      if (h > hh) hh = h;
    });
    return Math.max(18, hh);
  }

  let y = drawPageHeader();
  y = drawTableHeader(y);

  rows.forEach((r, idx) => {
    const rh = rowHeight(r);
    if (y + rh > bottomLimit()) {
      doc.addPage();
      y = drawPageHeader();
      y = drawTableHeader(y);
    }
    if (idx % 2 === 1) doc.rect(M, y, contentW, rh).fill(ZEBRA);
    doc.fillColor(INK).font('Helvetica').fontSize(FONT);
    columns.forEach((c, i) => {
      doc.text(cellText(r, c), colX[i] + PAD / 2, y + VPAD, { width: widths[i] - PAD, align: align(c) });
    });
    doc.moveTo(M, y + rh).lineTo(M + contentW, y + rh).strokeColor(LINE).lineWidth(0.5).stroke();
    y += rh;
  });

  if (totals) {
    const tr = {};
    columns.forEach((c, i) => { tr[c.key] = c.key in totals ? totals[c.key] : (i === 0 ? 'TOTAL' : ''); });
    const rh = Math.max(20, rowHeight(tr));
    if (y + rh > bottomLimit()) { doc.addPage(); y = drawPageHeader(); y = drawTableHeader(y); }
    doc.rect(M, y, contentW, rh).fillAndStroke('#e2e8f0', '#cbd5e1');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(HFONT);
    columns.forEach((c, i) => {
      let v = c.key in totals ? (c.money ? money(totals[c.key]) : totals[c.key]) : (i === 0 ? 'TOTAL' : '');
      doc.text(String(v), colX[i] + PAD / 2, y + VPAD, { width: widths[i] - PAD, align: align(c) });
    });
    y += rh;
  }

  // ── Footer + page numbers on every page ──────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - doc.page.margins.bottom - FOOTER_H + 8;
    doc.moveTo(M, fy).lineTo(M + contentW, fy).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(MUTE);
    doc.text(brand.footerText || `${company.name}  •  ${company.bank.name} A/c ${company.bank.accountNumber}`, M, fy + 6, { width: contentW * 0.7, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, M, fy + 6, { width: contentW, align: 'right', lineBreak: false });
    doc.text(`${company.address}  •  ${company.email}`, M, fy + 17, { width: contentW, lineBreak: false });
  }

  doc.flushPages();
  doc.end();
}
