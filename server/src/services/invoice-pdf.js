// ============================================================================
//  ARRAYS Tax Invoice + Measurement Sheet PDF — A4, branded, print-ready.
//  Shares the visual language of the e-Invoice / e-Way-Bill / Challan engine:
//  a coloured header band, blue-soft info strip, party cards, brand-coloured
//  table headers, a tax-summary panel, a signature strip and a painted footer.
//
//  Page 1 = Tax Invoice (Debited To / Site Address, HSN-SAC items, totals,
//  amount in words). Page 2 = optional Measurement Sheet — the running-account
//  view with Order / Previous / Present / Total quantity and amount per line.
//  Pure local document — no IRN / e-invoice.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { company } from '../config/company.js';
import { UPLOAD_ROOT } from '../middleware/upload.js';
import { applyPdfLang } from './pdf-i18n.js';

// ── PDF theme — set per-document from saved branding (defaults below) ─────────
const SOFT = '#f8fafc';
let BRAND = '#1d4ed8', INK = '#0f172a', MUTE = '#64748b', FAINT = '#94a3b8', LINE = '#e2e8f0', BLUE_SOFT = '#eff6ff';
let HEADER_BG = '#1d4ed8', HEADER_TX = '#ffffff', SUBTX = '#dbeafe', THEAD_BG = '#1d4ed8', THEAD_TX = '#ffffff', WM = '#1d4ed8';
const validHex = (c) => (/^#?[0-9a-fA-F]{6}$/.test(String(c || '').trim()) ? (String(c).trim()[0] === '#' ? String(c).trim() : '#' + String(c).trim()) : null);
const mix2 = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = (x, s) => (x >> s) & 255; const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t); return '#' + [m(16), m(8), m(0)].map((v) => v.toString(16).padStart(2, '0')).join(''); };
function setBrand(b = {}) {
  BRAND = validHex(b.pdfColor) || '#1d4ed8'; INK = validHex(b.textColor) || '#0f172a'; MUTE = validHex(b.mutedColor) || '#64748b';
  FAINT = mix2(MUTE, '#ffffff', 0.35); LINE = validHex(b.lineColor) || '#e2e8f0'; BLUE_SOFT = mix2(BRAND, '#ffffff', 0.92);
  HEADER_BG = validHex(b.headerBgColor) || BRAND; HEADER_TX = validHex(b.headerTextColor) || '#ffffff'; SUBTX = mix2(HEADER_TX, HEADER_BG, 0.28);
  THEAD_BG = validHex(b.tableHeadBgColor) || BRAND; THEAD_TX = validHex(b.tableHeadTextColor) || '#ffffff'; WM = validHex(b.watermarkColor) || BRAND;
}

const M = 40, HEADER_TOP = 18, HEADER_H = 88, CONT_HEADER_H = 28, FOOTER_H = 58;

// Helvetica (WinAnsi) has no ₹ glyph — use an ASCII "Rs " prefix.
const inr = (v) => 'Rs ' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyStr = (v) => { const n = Number(v || 0); return Number.isFinite(n) ? String(parseFloat(n.toFixed(3))) : '0'; };
const dmy = (d) => { if (!d) return '—'; const t = new Date(d); if (Number.isNaN(t.getTime())) return String(d); return `${String(t.getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()]} ${t.getFullYear()}`; };

function brandFile(b, k) { const name = b?.[k]; if (!name) return null; const p = path.join(UPLOAD_ROOT, name); return fs.existsSync(p) ? p : null; }
function fitImage(doc, file, x, y, w, h) { if (!file) return false; try { doc.image(file, x, y, { fit: [w, h], align: 'center', valign: 'center' }); return true; } catch { return false; } }
const toBuffer = (doc) => new Promise((res, rej) => { const c = []; doc.on('data', (d) => c.push(d)); doc.on('end', () => res(Buffer.concat(c))); doc.on('error', rej); });
const bottomLimit = (doc) => doc.page.height - FOOTER_H - 8;

function box(doc, x, y, w, h, fill) { doc.roundedRect(x, y, w, h, 4).lineWidth(0.8).strokeColor(LINE); if (fill) doc.fillAndStroke(fill, LINE); else doc.stroke(); doc.fillColor(INK); }

function watermark(doc, text) {
  if (!text) return;
  const sx = doc.x, sy = doc.y; doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fontSize(70).fillColor(WM).fillOpacity(0.06).text(String(text).toUpperCase(), 0, doc.page.height / 2 - 44, { width: doc.page.width, align: 'center', lineBreak: false });
  doc.fillOpacity(1).restore(); doc.x = sx; doc.y = sy;
}

// Full-width first-page header band (company block left, document title right).
function header(doc, title, subtitle, branding = {}) {
  const W = doc.page.width, T = HEADER_TOP;
  doc.rect(0, T, W, HEADER_H).fill(HEADER_BG);
  let tx = M;
  if (fitImage(doc, brandFile(branding, 'logoFile'), M, T + 14, 44, 44)) tx = M + 54;
  const titleX = W - 230, leftW = titleX - tx - 10;
  doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(13.5).text(branding.headerText || company.pdfName, tx, T + 8, { width: leftW, height: 15, ellipsis: true });
  doc.font('Helvetica').fontSize(7.2).fillColor(SUBTX).text(company.subtitle || '', tx, T + 24, { width: leftW, height: 9, ellipsis: true });
  doc.font('Helvetica').fontSize(7).fillColor(SUBTX)
    .text(branding.headerAddr || company.address, tx, T + 36, { width: leftW, height: 18, ellipsis: true })
    .text(`CIN ${branding.cin || company.cin}   •   ${branding.contactInfo || company.email}`, tx, T + 56, { width: leftW, height: 9, ellipsis: true });
  doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(15).text(title, titleX, T + 14, { width: 200, align: 'right' });
  if (subtitle) doc.font('Helvetica').fontSize(8).fillColor(SUBTX).text(subtitle, titleX, T + 36, { width: 200, align: 'right', height: 18, ellipsis: true });
  doc.fillColor(INK); doc.y = T + HEADER_H + 12;
}

function contHeader(doc, branding, title) {
  const W = doc.page.width;
  doc.rect(0, 0, W, CONT_HEADER_H).fill(HEADER_BG);
  doc.fillColor(HEADER_TX).fontSize(9.5).font('Helvetica-Bold').text(branding.headerText || company.pdfName, M, 9, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).text(`${title} (continued)`, M, 9, { width: W - 2 * M, align: 'right' });
  doc.fillColor(INK); return CONT_HEADER_H + 12;
}

// Footer painted on every buffered page: slogan (accent) + address + email + page no.
function finalize(doc, branding, note, footerSlogan) {
  const W = doc.page.width, range = doc.bufferedPageRange();
  const slogan = footerSlogan || company.slogan || '', addr = `Address: ${branding.headerAddr || company.address}`, mail = `Email: ${branding.contactInfo || company.email}`;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i); doc.page.margins.bottom = 0;
    const y = doc.page.height - FOOTER_H;
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor(LINE).lineWidth(0.6).stroke();
    if (slogan) doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND).text(slogan, M, y + 6, { width: W - 2 * M, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(MUTE)
      .text(addr, M, y + 18, { width: W - 2 * M, align: 'center', height: 9, ellipsis: true })
      .text(mail, M, y + 28, { width: W - 2 * M, align: 'center', lineBreak: false });
    if (note) doc.fontSize(6.5).fillColor(FAINT).text(note, M, y + 38, { width: W - 2 * M, align: 'center', lineBreak: false });
    doc.fontSize(7).fillColor(MUTE).text(`Page ${i + 1} of ${range.count}`, W - M - 80, y + 6, { width: 80, align: 'right' });
  }
  doc.flushPages();
}

// Address / party card — height grows to fit the full content (never clipped).
// cardHeight measures; drawCard renders. Both use the same metrics so two cards
// can be drawn at a shared (max) height for a clean aligned row.
function cardHeight(doc, w, title, lines) {
  const innerW = w - 16;
  let h = 6 + 12;                                   // top padding + label row
  if (title) { doc.font('Helvetica-Bold').fontSize(9); h += doc.heightOfString(title, { width: innerW }) + 2; }
  const body = (lines || []).filter(Boolean).join('\n');
  if (body) { doc.font('Helvetica').fontSize(7.8); h += doc.heightOfString(body, { width: innerW }); }
  return Math.max(72, h + 8);
}
function drawCard(doc, x, y, w, h, label, title, lines) {
  const innerW = w - 16;
  box(doc, x, y, w, h, SOFT);
  doc.fontSize(8).fillColor(BRAND).font('Helvetica-Bold').text(label, x + 8, y + 6, { width: innerW });
  let cy = y + 6 + 12;
  if (title) { doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(title, x + 8, cy, { width: innerW }); cy += doc.heightOfString(title, { width: innerW }) + 2; }
  doc.font('Helvetica').fontSize(7.8).fillColor(MUTE).text((lines || []).filter(Boolean).join('\n'), x + 8, cy, { width: innerW });
  doc.fillColor(INK);
}

// Key/value info strip (blue-soft) used for the document meta line.
function metaStrip(doc, inv, sellerGstin) {
  const W = doc.page.width, CW = W - 2 * M, y = doc.y, h = 50, halfW = CW / 2;
  box(doc, M, y, halfW - 5, h, BLUE_SOFT);
  box(doc, M + halfW + 5, y, halfW - 5, h, BLUE_SOFT);
  const kv = (lx, ly, k, v, bold) => {
    doc.font('Helvetica').fontSize(7).fillColor(FAINT).text(k, lx, ly, { width: 80, lineBreak: false });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica-Bold').fontSize(bold ? 9.5 : 8).fillColor(INK).text(String(v ?? '—'), lx + 58, ly - (bold ? 1 : 0), { width: halfW - 80, lineBreak: false, ellipsis: true });
  };
  kv(M + 10, y + 9, 'Invoice No', inv.invoice_number, true);
  kv(M + 10, y + 28, 'Date', dmy(inv.issue_date));
  kv(M + halfW * 0.5 + 5, y + 28, 'Type', inv.supply_type || 'Tax Invoice');
  kv(M + halfW + 15, y + 9, 'PO No', inv.po_no ? `${inv.po_no}${inv.po_date ? '  ·  ' + dmy(inv.po_date) : ''}` : '—');
  kv(M + halfW + 15, y + 28, 'Seller GSTIN', sellerGstin);
  doc.y = y + h + 12;
}

// Signature strip — single large signed/stamped image, "Authorised Signatory".
function signatureStrip(doc, branding) {
  const W = doc.page.width, sigW = 210, needed = 86, x = W - M - sigW;
  let y = doc.y + 6;
  if (y + needed > bottomLimit(doc)) y = bottomLimit(doc) - needed;
  doc.fontSize(7.5).fillColor(MUTE).font('Helvetica').text(`For ${branding.headerText || company.pdfName}`, x, y, { width: sigW, align: 'right', lineBreak: false });
  fitImage(doc, brandFile(branding, 'signatureFile'), x, y + 12, sigW, 56);
  doc.moveTo(x, y + 70).lineTo(W - M, y + 70).strokeColor(FAINT).lineWidth(0.6).stroke();
  doc.fontSize(8).fillColor(INK).font('Helvetica-Bold').text('Authorised Signatory', x, y + 73, { width: sigW, align: 'right', lineBreak: false });
  doc.y = y + needed;
}

// Shared top-of-page block (header band + meta strip + party cards). Used by
// both the invoice page and the measurement-sheet page so they look identical.
function pageTop(doc, inv, branding, title) {
  const W = doc.page.width, CW = W - 2 * M;
  const sellerGstin = branding.gstin || company.gstin;
  header(doc, title, inv.supply_type || 'Commercial Tax Invoice', branding);
  watermark(doc, branding.watermark || (inv.status === 'cancelled' ? 'CANCELLED' : inv.status === 'draft' ? 'DRAFT' : ''));
  metaStrip(doc, inv, sellerGstin);
  const py = doc.y, halfW = (CW - 10) / 2;
  const buyerTitle = inv.customer_name || inv.client_name || '—';
  const buyerLines = [
    (inv.customer_gstin || inv.client_gstin) ? `GSTIN: ${inv.customer_gstin || inv.client_gstin}` : 'Unregistered',
    inv.billing_address,
    inv.place_of_supply ? `Place of Supply (State): ${inv.place_of_supply}` : null,
  ];
  const siteLines = String(inv.site_address || inv.shipping_address || '—').split('\n');
  const cardH = Math.max(cardHeight(doc, halfW, buyerTitle, buyerLines), cardHeight(doc, halfW, null, siteLines));
  drawCard(doc, M, py, halfW, cardH, 'DEBITED TO (Buyer)', buyerTitle, buyerLines);
  drawCard(doc, M + halfW + 10, py, halfW, cardH, 'SITE ADDRESS', null, siteLines);
  doc.y = py + cardH + 12;
}

// Generic branded table: brand-filled header, wrapping rows, zebra tint.
function table(doc, cols, rows, opts = {}) {
  const W = doc.page.width, CW = W - 2 * M, pad = 4, fs = opts.fontSize || 7.6;
  const drawHead = opts.drawHead || ((yy) => {
    const h = opts.headH || 18;
    doc.rect(M, yy, CW, h).fill(THEAD_BG); doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(opts.headFontSize || 7.4);
    let cx = M; cols.forEach((c) => { doc.text(c.t, cx + pad, yy + (h - 7.4) / 2, { width: c.w * CW - 2 * pad, align: c.a || 'left', lineBreak: false }); cx += c.w * CW; });
    doc.font('Helvetica').fillColor(INK); return yy + h;
  });
  let ty = drawHead(doc.y);
  rows.forEach((r, i) => {
    doc.font('Helvetica').fontSize(fs);
    const cells = cols.map((c) => c.render(r, i));
    const heights = cells.map((t, k) => doc.heightOfString(String(t), { width: cols[k].w * CW - 2 * pad, align: cols[k].a || 'left' }));
    const rowH = Math.max(opts.minRowH || 15, ...heights.map((h) => h + 7));
    if (ty + rowH > bottomLimit(doc)) { doc.addPage(); watermark(doc, ''); ty = drawHead(contHeader(doc, opts.branding || {}, opts.contTitle || 'TAX INVOICE')); }
    if (i % 2) doc.rect(M, ty, CW, rowH).fill(SOFT);
    doc.fillColor(INK).font('Helvetica').fontSize(fs);
    let cx = M;
    cols.forEach((c, k) => { doc.fillColor(INK).text(String(cells[k]), cx + pad, ty + 4, { width: c.w * CW - 2 * pad, align: c.a || 'left', ellipsis: c.a === 'left' ? false : true, lineBreak: c.a === 'left' }); cx += c.w * CW; });
    ty += rowH;
  });
  doc.moveTo(M, ty).lineTo(W - M, ty).strokeColor(LINE).lineWidth(0.6).stroke();
  doc.y = ty + 10;
}

// Indian rupees → words (paisa aware).
function rupeesInWords(value) {
  const totalPaise = Math.round((Number(value || 0) + Number.EPSILON) * 100);
  let rupees = Math.floor(totalPaise / 100); const paise = totalPaise % 100;
  if (!rupees && !paise) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ''));
  const three = (n) => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
  let out = '';
  const crore = Math.floor(rupees / 1e7); rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5); rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3); rupees %= 1e3;
  if (crore) out += three(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (rupees) out += three(rupees);
  out = out.trim() + ' Rupees';
  if (paise) out += ' and ' + two(paise) + ' Paise';
  return out + ' Only';
}

export async function invoicePdf(inv, branding = {}, lang = 'en') {
  setBrand(branding);
  // Operator-chosen letterhead overrides (per invoice) win over saved branding.
  const eff = {
    ...branding,
    headerText: inv.header_text || branding.headerText || company.pdfName,
    headerAddr: inv.header_address || branding.headerAddr || company.address,
    contactInfo: inv.header_email || branding.contactInfo || company.email,
    cin: inv.header_cin || branding.cin || company.cin,
  };
  branding = eff;
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
  applyPdfLang(doc, lang);
  const out = toBuffer(doc);
  const W = doc.page.width, CW = W - 2 * M;
  const items = inv.items || [];
  const sellerState = String(company.gstin || '09').slice(0, 2);
  const inter = Number(inv.igst_amount || 0) > 0 || (!Number(inv.cgst_amount || 0) && inv.place_of_supply && String(inv.place_of_supply) !== sellerState);

  // ═══ PAGE 1 — TAX INVOICE ═════════════════════════════════════════════════
  pageTop(doc, inv, branding, 'TAX INVOICE');
  table(doc, [
    { t: '#', w: 0.05, a: 'left', render: (r, i) => r.line_no || i + 1 },
    { t: 'HSN/SAC', w: 0.11, a: 'left', render: (r) => r.hsn || '—' },
    { t: 'Service Description', w: 0.37, a: 'left', render: (r) => r.description || '—' },
    { t: 'UQM', w: 0.07, a: 'center', render: (r) => r.unit || 'NOS' },
    { t: 'Rate', w: 0.14, a: 'right', render: (r) => inr(r.rate) },
    { t: 'Qty', w: 0.07, a: 'right', render: (r) => qtyStr(r.quantity) },
    { t: 'Amount', w: 0.18, a: 'right', render: (r) => inr(r.taxable_value != null ? r.taxable_value : Number(r.quantity || 0) * Number(r.rate || 0)) },
  ], items, { branding, contTitle: 'TAX INVOICE', minRowH: 18 });

  // Tax summary (right) + amount in words (left), kept together on the page.
  const sumH = 96;
  if (doc.y + sumH > bottomLimit(doc)) { doc.addPage(); doc.y = contHeader(doc, branding, 'TAX INVOICE'); }
  const blockY = doc.y, sumW = 220, sumX = W - M - sumW, leftW = sumX - M - 10;
  box(doc, sumX, blockY, sumW, sumH, SOFT);
  const rows = [['Total Amount', inv.taxable_amount]];
  if (inter) rows.push(['IGST', inv.igst_amount]);
  else { rows.push(['CGST', inv.cgst_amount]); rows.push(['SGST', inv.sgst_amount]); }
  doc.fontSize(8);
  rows.forEach((r, i) => {
    const ry = blockY + 9 + i * 14;
    doc.font('Helvetica').fillColor(MUTE).text(r[0], sumX + 10, ry, { width: sumW * 0.5, lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(INK).text(inr(r[1]), sumX + sumW * 0.42, ry, { width: sumW * 0.58 - 12, align: 'right', lineBreak: false });
  });
  doc.rect(sumX, blockY + sumH - 26, sumW, 26).fill(THEAD_BG);
  doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(10)
    .text('Grand Total', sumX + 10, blockY + sumH - 17, { width: sumW * 0.5, lineBreak: false })
    .text(inr(inv.total_amount), sumX + sumW * 0.42, blockY + sumH - 17, { width: sumW * 0.58 - 10, align: 'right', lineBreak: false });

  box(doc, M, blockY, leftW, sumH, '#ffffff');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND).text('Amount in words', M + 8, blockY + 8);
  doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(rupeesInWords(inv.total_amount) + '.', M + 8, blockY + 20, { width: leftW - 16, height: 34, ellipsis: true });
  if (inv.notes) { doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND).text('Notes', M + 8, blockY + 58); doc.font('Helvetica').fontSize(7.5).fillColor(MUTE).text(inv.notes, M + 8, blockY + 69, { width: leftW - 16, height: 22, ellipsis: true }); }
  doc.y = blockY + sumH + 12;

  signatureStrip(doc, branding);

  // ═══ PAGE 2 — MEASUREMENT SHEET (optional) ════════════════════════════════
  const wantsMeasurement = inv.with_measurement !== false && inv.with_measurement !== 'false';
  if (wantsMeasurement && items.length) {
    doc.addPage();
    pageTop(doc, inv, branding, 'MEASUREMENT SHEET');

    // Plain Indian-grouped number (no "Rs " — the AMOUNT/Rate headers carry the unit).
    const num = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Two-row grouped header: QUANTITY (Previous/Present/Total) & AMOUNT (Previous/Present/Total).
    const cols = [
      { w: 0.07, a: 'left', render: (r) => r.hsn || '—' },
      { w: 0.25, a: 'left', render: (r) => r.description || '—' },
      { w: 0.055, a: 'right', render: (r) => qtyStr(r.order_qty != null ? r.order_qty : (Number(r.previous_qty || 0) + Number(r.quantity || 0))) },
      { w: 0.05, a: 'center', render: (r) => r.unit || 'NOS' },
      { w: 0.11, a: 'right', render: (r) => num(r.rate) },
      { w: 0.06, a: 'right', render: (r) => qtyStr(r.previous_qty) },
      { w: 0.06, a: 'right', render: (r) => qtyStr(r.quantity) },
      { w: 0.06, a: 'right', render: (r) => qtyStr(Number(r.previous_qty || 0) + Number(r.quantity || 0)) },
      { w: 0.095, a: 'right', render: (r) => num(Number(r.previous_qty || 0) * Number(r.rate || 0)) },
      { w: 0.095, a: 'right', render: (r) => num(Number(r.quantity || 0) * Number(r.rate || 0)) },
      { w: 0.095, a: 'right', render: (r) => num((Number(r.previous_qty || 0) + Number(r.quantity || 0)) * Number(r.rate || 0)) },
    ];
    const widths = cols.map((c) => c.w * CW);
    const sub = ['HSN/SAC', 'Description', 'Order Qty', 'Unit', 'Rate (Rs)', 'Previous', 'Present', 'Total', 'Previous', 'Present', 'Total'];
    const drawHead = (yy) => {
      const h1 = 12, h2 = 16, H = h1 + h2, fixed = 5;
      doc.rect(M, yy, CW, H).fill(THEAD_BG);
      doc.fillColor(THEAD_TX).font('Helvetica-Bold');
      let cx = M;
      for (let i = 0; i < fixed; i++) { doc.fontSize(6.6).text(sub[i], cx + 2, yy + (H - (sub[i].includes(' ') ? 14 : 7)) / 2, { width: widths[i] - 4, align: 'center' }); cx += widths[i]; }
      const qW = widths[5] + widths[6] + widths[7], aW = widths[8] + widths[9] + widths[10];
      doc.fontSize(7).text('QUANTITY', cx, yy + 3, { width: qW, align: 'center', lineBreak: false });
      doc.text('AMOUNT (Rs)', cx + qW, yy + 3, { width: aW, align: 'center', lineBreak: false });
      doc.moveTo(cx, yy + h1).lineTo(cx + qW + aW, yy + h1).strokeColor(mix2(THEAD_BG, '#ffffff', 0.4)).lineWidth(0.5).stroke();
      for (let i = fixed; i < cols.length; i++) { doc.fillColor(THEAD_TX).fontSize(6).text(sub[i], cx + 1, yy + h1 + 5, { width: widths[i] - 2, align: 'center', lineBreak: false }); cx += widths[i]; }
      doc.font('Helvetica').fillColor(INK); return yy + H;
    };
    table(doc, cols, items, { branding, contTitle: 'MEASUREMENT SHEET', drawHead, fontSize: 7, minRowH: 18 });

    // Cumulative total bar (aligned under the AMOUNT > Total column).
    const totalCum = items.reduce((s, r) => s + (Number(r.previous_qty || 0) + Number(r.quantity || 0)) * Number(r.rate || 0), 0);
    if (doc.y + 24 > bottomLimit(doc)) { doc.addPage(); doc.y = contHeader(doc, branding, 'MEASUREMENT SHEET'); }
    const my = doc.y, gtW = widths[8] + widths[9] + widths[10], gtX = M + CW - gtW;
    doc.rect(M, my, CW - gtW, 20).fillAndStroke(SOFT, LINE);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Total Cumulative Billed (incl. previous)', M + 8, my + 6, { width: CW - gtW - 16, align: 'right' });
    doc.rect(gtX, my, gtW, 20).fill(THEAD_BG);
    doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(9).text(inr(totalCum), gtX + 4, my + 6, { width: gtW - 8, align: 'right' });
    doc.y = my + 26;
    doc.font('Helvetica').fontSize(7).fillColor(FAINT).text('Note: "Present" is the quantity billed in this invoice; "Previous" is the quantity billed in earlier running bills; "Total" is the cumulative work done to date.', M, doc.y + 2, { width: CW });
    doc.y += 4;
    signatureStrip(doc, branding);
  }

  finalize(doc, branding, inv.status === 'cancelled' ? 'This invoice has been cancelled.' : 'This is a computer-generated tax invoice.', inv.footer_text);
  doc.end();
  return out;
}
