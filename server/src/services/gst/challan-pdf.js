// ============================================================================
//  Delivery Challan PDF  (Rule 55 CGST).  A4, branded, print-ready, with QR.
//  Reuses the branding theme + bilingual font engine of the GST PDF module.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { company } from '../../config/company.js';
import { UPLOAD_ROOT } from '../../middleware/upload.js';
import { STATE_CODES } from './masterData.js';
import { applyPdfLang } from '../pdf-i18n.js';

const M = 40;
const SOFT = '#f8fafc';
let BRAND = '#1d4ed8', INK = '#0f172a', MUTE = '#64748b', FAINT = '#94a3b8', LINE = '#e2e8f0';
let HEADER_BG = '#1d4ed8', HEADER_TX = '#ffffff', SUBTX = '#dbeafe', THEAD_BG = '#1d4ed8', THEAD_TX = '#ffffff', WM = '#1d4ed8';
const validHex = (c) => (/^#?[0-9a-fA-F]{6}$/.test(String(c || '').trim()) ? (String(c).trim()[0] === '#' ? String(c).trim() : '#' + String(c).trim()) : null);
const mix2 = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = (x, s) => (x >> s) & 255; const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t); return '#' + [m(16), m(8), m(0)].map((v) => v.toString(16).padStart(2, '0')).join(''); };
function setTheme(b = {}) {
  BRAND = validHex(b.pdfColor) || '#1d4ed8'; INK = validHex(b.textColor) || '#0f172a'; MUTE = validHex(b.mutedColor) || '#64748b';
  FAINT = mix2(MUTE, '#ffffff', 0.35); LINE = validHex(b.lineColor) || '#e2e8f0';
  HEADER_BG = validHex(b.headerBgColor) || BRAND; HEADER_TX = validHex(b.headerTextColor) || '#ffffff'; SUBTX = mix2(HEADER_TX, HEADER_BG, 0.28);
  THEAD_BG = validHex(b.tableHeadBgColor) || BRAND; THEAD_TX = validHex(b.tableHeadTextColor) || '#ffffff'; WM = validHex(b.watermarkColor) || BRAND;
}

const inr = (v) => 'Rs ' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const st = (c) => STATE_CODES[String(c || '').padStart(2, '0')] || c || '';
const dmy = (d) => { if (!d) return '—'; const t = new Date(d); return Number.isNaN(t.getTime()) ? String(d) : `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`; };
function brandFile(b, k) { const name = b?.[k]; if (!name) return null; const p = path.join(UPLOAD_ROOT, name); return fs.existsSync(p) ? p : null; }
function fitImage(doc, file, x, y, w, h) { if (!file) return false; try { doc.image(file, x, y, { fit: [w, h], align: 'center', valign: 'center' }); return true; } catch { return false; } }
const toBuffer = (doc) => new Promise((res, rej) => { const c = []; doc.on('data', (d) => c.push(d)); doc.on('end', () => res(Buffer.concat(c))); doc.on('error', rej); });

function box(doc, x, y, w, h, fill) { doc.save().roundedRect(x, y, w, h, 4).fillAndStroke(fill || '#ffffff', LINE).restore(); }

function watermark(doc, text) {
  if (!text) return;
  const sx = doc.x, sy = doc.y;
  doc.save().rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fontSize(74).fillColor(WM).fillOpacity(0.05).text(String(text).toUpperCase(), 0, doc.page.height / 2 - 44, { width: doc.page.width, align: 'center', lineBreak: false });
  doc.fillOpacity(1).restore(); doc.x = sx; doc.y = sy;
}

// Party (consignor/consignee) content — name + address lines (no truncation).
function partyContent(p = {}) {
  const name = p.legalName || p.tradeName || '—';
  const lines = [
    p.gstin ? `GSTIN: ${p.gstin}` : 'Unregistered',
    [p.addr1, p.addr2].filter(Boolean).join(', '),
    [p.location, p.pincode].filter(Boolean).join(' - '),
    p.stateCode ? `State: ${st(p.stateCode)} (${String(p.stateCode).padStart(2, '0')})` : null,
    p.phone ? `Ph: ${p.phone}` : null,
  ].filter(Boolean);
  return { name, lines };
}
// Measure the height a party card needs to show all its text.
function partyHeight(doc, w, p) {
  const innerW = w - 16, { name, lines } = partyContent(p);
  doc.font('Helvetica-Bold').fontSize(9.5); const nameH = doc.heightOfString(name, { width: innerW });
  doc.font('Helvetica').fontSize(7.8); const bodyH = doc.heightOfString(lines.join('\n'), { width: innerW });
  return Math.max(96, 6 + 12 + nameH + 2 + bodyH + 8);
}
// Draw a party card; height grows to fit (pass a shared h to align two cards).
function party(doc, x, y, w, label, p = {}, h) {
  const innerW = w - 16, { name, lines } = partyContent(p);
  if (!h) h = partyHeight(doc, w, p);
  box(doc, x, y, w, h, SOFT);
  doc.fontSize(8).fillColor(BRAND).font('Helvetica-Bold').text(label, x + 8, y + 6, { width: innerW, lineBreak: false });
  doc.fillColor(INK).fontSize(9.5).font('Helvetica-Bold').text(name, x + 8, y + 18, { width: innerW });
  const cy = y + 18 + doc.heightOfString(name, { width: innerW }) + 2;
  doc.font('Helvetica').fontSize(7.8).fillColor(MUTE).text(lines.join('\n'), x + 8, cy, { width: innerW });
  doc.fillColor(INK); return h;
}

export async function challanPdf(dc, branding = {}, lang = 'en') {
  setTheme(branding);
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
  applyPdfLang(doc, lang);
  const out = toBuffer(doc);
  const W = doc.page.width, CW = W - 2 * M;
  const wm = branding.watermark || (['cancelled', 'rejected'].includes(dc.status) ? dc.status : (dc.status === 'draft' ? 'DRAFT' : ''));

  // ── Header band ────────────────────────────────────────────────────────────
  const T = 18;                                  // breathing room above the header band
  doc.rect(0, T, W, 88).fill(HEADER_BG);
  let tx = M;
  if (fitImage(doc, brandFile(branding, 'logoFile'), M, T + 14, 44, 44)) tx = M + 54;
  const titleX = W - 250;
  const hdrW = titleX - tx - 10;
  doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(14).text(branding.headerText || company.pdfName, tx, T + 11, { width: hdrW, height: 16, ellipsis: true });
  doc.font('Helvetica').fontSize(7.3).fillColor(SUBTX)
    .text(branding.headerAddr || company.address, tx, T + 29, { width: hdrW, height: 17, ellipsis: true })
    .text(`GSTIN ${branding.gstin || company.gstin}  •  ${branding.contactInfo || company.email}`, tx, T + 49, { width: hdrW, height: 9, ellipsis: true });
  doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(14).text('DELIVERY CHALLAN', titleX, T + 14, { width: 210, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(SUBTX).text('Rule 55, CGST Rules 2017 — not a tax invoice', titleX, T + 36, { width: 210, align: 'right' });
  doc.fillColor(INK); doc.y = T + 100;
  watermark(doc, wm);

  // ── Meta bar ───────────────────────────────────────────────────────────────
  const my = doc.y; box(doc, M, my, CW, 34, SOFT);
  const metaCell = (label, value, x, w) => {
    doc.fontSize(6.8).fillColor(FAINT).font('Helvetica-Bold').text(String(label).toUpperCase(), x + 8, my + 6, { width: w - 12, lineBreak: false });
    doc.fontSize(9).fillColor(INK).font('Helvetica-Bold').text(String(value ?? '—'), x + 8, my + 17, { width: w - 12, lineBreak: false, ellipsis: true });
  };
  const c4 = CW / 4;
  metaCell('Challan No', dc.challanNo, M, c4);
  metaCell('Date', dmy(dc.challanDate), M + c4, c4 * 0.7);
  metaCell('Type', dc.challanTypeName || dc.challanType, M + c4 + c4 * 0.7, c4 * 1.3);
  metaCell('Status', String(dc.status || '').replace(/_/g, ' '), M + 3 * c4, c4);
  doc.y = my + 44;

  // ── Parties (cards grow to fit, aligned to the taller of the two) ───────────
  const py = doc.y, half = (CW - 10) / 2;
  const ph = Math.max(partyHeight(doc, half, dc.consignor), partyHeight(doc, half, dc.consignee));
  party(doc, M, py, half, 'CONSIGNOR (From)', dc.consignor, ph);
  party(doc, M + half + 10, py, half, 'CONSIGNEE (To)', dc.consignee, ph);
  doc.y = py + ph + 10;

  // ── Items table ────────────────────────────────────────────────────────────
  const cols = [
    { t: '#', w: 0.04, a: 'left' }, { t: 'Description of Goods', w: 0.26, a: 'left' }, { t: 'HSN', w: 0.08, a: 'left' },
    { t: 'Batch/Serial', w: 0.12, a: 'left' }, { t: 'Qty', w: 0.07, a: 'right' }, { t: 'Unit', w: 0.06, a: 'left' },
    { t: 'Rate', w: 0.09, a: 'right' }, { t: 'Taxable', w: 0.10, a: 'right' }, { t: 'GST%', w: 0.06, a: 'right' }, { t: 'Value', w: 0.12, a: 'right' },
  ];
  const bottomLimit = () => doc.page.height - 70;
  const drawHead = (yy) => {
    doc.rect(M, yy, CW, 17).fill(THEAD_BG);
    doc.fillColor(THEAD_TX).fontSize(7.3).font('Helvetica-Bold');
    let cx = M; cols.forEach((c) => { doc.text(c.t, cx + 4, yy + 5, { width: c.w * CW - 8, align: c.a, lineBreak: false }); cx += c.w * CW; });
    return yy + 17;
  };
  let ty = drawHead(doc.y);
  const descIdx = 1, descW = cols[descIdx].w * CW - 8;
  (dc.items || []).forEach((it, i) => {
    const val = Number(it.taxableValue || 0) + Number(it.cgstAmount || 0) + Number(it.sgstAmount || 0) + Number(it.igstAmount || 0) + Number(it.cessAmount || 0);
    const cells = [String(it.lineNo || i + 1), it.productName || '—', it.hsn || '—',
      [it.batchNo, it.serialNo].filter(Boolean).join(' / ') || '—',
      String(it.quantity ?? ''), it.unit || '', inr(it.rate), inr(it.taxableValue), `${Number(it.gstRate || 0)}%`, inr(val)];
    // Row height grows to fit the (possibly long) wrapped description — no cut-off.
    doc.font('Helvetica').fontSize(7.3);
    const rowH = Math.max(16, doc.heightOfString(cells[descIdx], { width: descW }) + 7);
    if (ty + rowH > bottomLimit()) { doc.addPage(); watermark(doc, wm); ty = drawHead(M + 10); }
    if (i % 2) doc.rect(M, ty, CW, rowH).fill(SOFT);
    doc.fillColor(INK).font('Helvetica').fontSize(7.3);
    let cx = M; cols.forEach((c, k) => {
      if (k === descIdx) doc.text(cells[k], cx + 4, ty + 4, { width: c.w * CW - 8 });
      else doc.text(cells[k], cx + 4, ty + 4.5, { width: c.w * CW - 8, align: c.a, ellipsis: true, lineBreak: false });
      cx += c.w * CW;
    });
    ty += rowH;
  });
  doc.moveTo(M, ty).lineTo(W - M, ty).strokeColor(LINE).lineWidth(0.6).stroke();
  doc.y = ty + 10;

  // ── Tax summary (right) + transport/EWB (left) ──────────────────────────────
  const blockY = doc.y, sumW = 210, sumX = W - M - sumW, leftW = sumX - M - 10;
  box(doc, sumX, blockY, sumW, 96, SOFT);
  const sline = (label, value, i, bold) => {
    const ry = blockY + 8 + i * 13;
    doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? INK : MUTE).text(label, sumX + 10, ry, { width: sumW * 0.5, lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(INK).text(inr(value), sumX + sumW * 0.45, ry, { width: sumW * 0.55 - 12, align: 'right', lineBreak: false });
  };
  sline('Taxable Value', dc.taxableValue, 0);
  sline('CGST', dc.cgstValue, 1); sline('SGST', dc.sgstValue, 2); sline('IGST', dc.igstValue, 3); sline('Cess', dc.cessValue, 4);
  doc.rect(sumX, blockY + 72, sumW, 24).fill(THEAD_BG);
  doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(9.5)
    .text('Total Value', sumX + 10, blockY + 80, { width: sumW * 0.5, lineBreak: false })
    .text(inr(dc.totalValue), sumX + sumW * 0.45, blockY + 80, { width: sumW * 0.55 - 10, align: 'right', lineBreak: false });

  // transport
  box(doc, M, blockY, leftW, 96, '#ffffff');
  const tr = dc.transport || {};
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND).text('Transport Details', M + 8, blockY + 7);
  doc.font('Helvetica').fontSize(7.6).fillColor(MUTE);
  const tv = [
    ['Mode', { road: 'Road', rail: 'Rail', air: 'Air', ship: 'Ship' }[tr.mode] || tr.mode || '—'],
    ['Vehicle No', tr.vehicleNo || '—'], ['Transporter', tr.transporterName || '—'],
    ['LR / Doc No', [tr.lrNo, tr.lrDate ? dmy(tr.lrDate) : null].filter(Boolean).join('  ') || '—'],
    ['Driver', [tr.driverName, tr.driverMobile].filter(Boolean).join('  ') || '—'],
  ];
  let lyy = blockY + 22;
  tv.forEach(([l, v]) => { doc.fillColor(FAINT).font('Helvetica').text(l, M + 8, lyy, { width: 70, lineBreak: false }); doc.fillColor(INK).font('Helvetica-Bold').text(String(v), M + 80, lyy, { width: leftW - 88, lineBreak: false, ellipsis: true }); lyy += 11.5; });
  doc.y = blockY + 106;

  // ── Signature ────────────────────────────────────────────────────────────────
  if (doc.y + 90 > bottomLimit()) { doc.addPage(); watermark(doc, wm); doc.y = M + 10; }
  const qy = doc.y;
  fitImage(doc, brandFile(branding, 'stampFile'), W - M - 230, qy, 56, 48);
  fitImage(doc, brandFile(branding, 'signatureFile'), W - M - 160, qy, 110, 44);
  doc.font('Helvetica').fontSize(8).fillColor(MUTE).text(`For ${branding.headerText || company.pdfName}`, W - M - 200, qy - 2, { width: 200, align: 'right', lineBreak: false });
  doc.moveTo(W - M - 200, qy + 50).lineTo(W - M, qy + 50).strokeColor(FAINT).lineWidth(0.6).stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.5).text('Authorised Signatory', W - M - 200, qy + 54, { width: 200, align: 'right' });
  doc.y = qy + 72;

  // ── Terms + footer ──────────────────────────────────────────────────────────
  if (doc.y + 24 < bottomLimit()) {
    doc.fontSize(7).fillColor(MUTE).font('Helvetica').text(
      branding.terms || 'Goods described above are moved under a delivery challan as per Rule 55 of the CGST Rules and do not constitute a supply / tax invoice. Goods remain the property of the consignor unless billed.',
      M, doc.y, { width: CW });
  }
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0;
    const fy = doc.page.height - 40;
    doc.moveTo(M, fy).lineTo(W - M, fy).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(MUTE)
      .text(branding.footerText || `${company.name} • System-generated delivery challan`, M, fy + 6, { width: CW * 0.8, lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, M, fy + 6, { width: CW, align: 'right', lineBreak: false });
  }
  doc.flushPages(); doc.end();
  return out;
}
