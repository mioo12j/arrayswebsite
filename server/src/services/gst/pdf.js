// ============================================================================
//  GST PDF / print engine — A4, branded, print-ready.
//  e-Invoice PDF (IRN + Ack + QR + tax & HSN summary) and EWB PDF (Part A/B,
//  validity, vehicle, transporter, QR). pdfkit + qrcode.
//
//  Layout model (matches the quotation PDF benchmark):
//    • Single content flow governed by doc.y, a fixed bottom() limit and
//      ensure(need) — blocks move to a new page only when they genuinely
//      do not fit, so small documents always stay on ONE page.
//    • All trailing free-text is height-capped so pdfkit never auto-paginates
//      into blank / near-empty pages.
//    • Footer + page numbers are painted once, across every buffered page.
//    • Images (logo / signature / stamp) use `fit` only → aspect ratio is
//      always preserved (never stretched / squashed).
//  Buffers are returned so routes can stream, download or attach them.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { company } from '../../config/company.js';
import { STATE_CODES } from './masterData.js';
import { UPLOAD_ROOT } from '../../middleware/upload.js';
import { applyPdfLang } from '../pdf-i18n.js';

// ── PDF theme — every colour is set per-document from the saved branding ─────
// (blank/invalid values fall back to the defaults below).
const SOFT = '#f8fafc';
let BRAND = '#1d4ed8';       // accent: section titles, totals, charts
let INK = '#0f172a';         // body text
let MUTE = '#64748b';        // secondary text
let FAINT = '#94a3b8';       // labels / hints (derived from MUTE)
let LINE = '#e2e8f0';        // rules & borders
let BLUE_SOFT = '#eff6ff';   // soft tint of the accent (info strips)
let HEADER_BG = '#1d4ed8';   // top band background
let HEADER_TX = '#ffffff';   // top band text
let SUBTX = '#dbeafe';       // top band secondary text (derived)
let THEAD_BG = '#1d4ed8';    // table header background
let THEAD_TX = '#ffffff';    // table header text
let WM = '#1d4ed8';          // watermark colour

// Accept #rrggbb or rrggbb; returns a valid #hex or null.
const validHex = (c) => (/^#?[0-9a-fA-F]{6}$/.test(String(c || '').trim()) ? (String(c).trim()[0] === '#' ? String(c).trim() : '#' + String(c).trim()) : null);
// Mix colour a toward colour b by t (0..1) — returns hex (pdfkit needs hex, not rgb()).
const mix2 = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + [m(16), m(8), m(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
};
// Set the active theme from branding (called at the start of each PDF).
function setBrand(b = {}) {
  BRAND = validHex(b.pdfColor) || '#1d4ed8';
  INK = validHex(b.textColor) || '#0f172a';
  MUTE = validHex(b.mutedColor) || '#64748b';
  FAINT = mix2(MUTE, '#ffffff', 0.35);
  LINE = validHex(b.lineColor) || '#e2e8f0';
  BLUE_SOFT = mix2(BRAND, '#ffffff', 0.92);
  HEADER_BG = validHex(b.headerBgColor) || BRAND;
  HEADER_TX = validHex(b.headerTextColor) || '#ffffff';
  SUBTX = mix2(HEADER_TX, HEADER_BG, 0.28);
  THEAD_BG = validHex(b.tableHeadBgColor) || BRAND;
  THEAD_TX = validHex(b.tableHeadTextColor) || '#ffffff';
  WM = validHex(b.watermarkColor) || BRAND;
}

const M = 40;                                  // page margin
const HEADER_TOP = 18;                         // white breathing space above the header band
const HEADER_H = 88;                           // first-page header band (fits a 2-line address)
const CONT_HEADER_H = 28;                      // continuation-page header band
const FOOTER_H = 46;                           // reserved footer band

// ── small helpers ───────────────────────────────────────────────────────────
// pdfkit's standard Helvetica (WinAnsi) has no ₹ glyph (it renders as "¹"), so
// we use an ASCII "Rs " prefix that prints correctly on every platform.
const inr = (v) => 'Rs ' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const st = (c) => STATE_CODES[String(c || '').padStart(2, '0')] || c || '';
const dmy = (d) => {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return String(d);
  return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
};

function brandFile(branding, key) {
  const name = branding?.[key];
  if (!name) return null;
  const p = path.join(UPLOAD_ROOT, name);
  return fs.existsSync(p) ? p : null;
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Bottom limit for flowing content (footer space reserved below this).
const bottomLimit = (doc) => doc.page.height - FOOTER_H - 8;

// Faint diagonal watermark; never advances the text cursor or adds pages.
function watermark(doc, text) {
  if (!text) return;
  const sx = doc.x, sy = doc.y;
  doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fontSize(70).fillColor(WM).fillOpacity(0.06)
    .text(String(text).toUpperCase(), 0, doc.page.height / 2 - 44, { width: doc.page.width, align: 'center', lineBreak: false });
  doc.fillOpacity(1).restore();
  doc.x = sx; doc.y = sy;
}

// Place a branding image inside a box, preserving aspect ratio and centering it.
function fitImage(doc, file, x, y, boxW, boxH) {
  if (!file) return false;
  try { doc.image(file, x, y, { fit: [boxW, boxH], align: 'center', valign: 'center' }); return true; }
  catch { return false; }
}

// ── full-width first-page header ─────────────────────────────────────────────
function header(doc, title, subtitle, branding = {}) {
  const W = doc.page.width;
  const T = HEADER_TOP;                          // breathing room above the header band
  doc.rect(0, T, W, HEADER_H).fill(HEADER_BG);
  let tx = M;
  if (fitImage(doc, brandFile(branding, 'logoFile'), M, T + 14, 44, 44)) tx = M + 54;
  const titleX = W - 250;                       // right-side title block
  const leftW = titleX - tx - 10;               // company block must stop before the title
  doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(13.5).text(branding.headerText || company.pdfName, tx, T + 9, { width: leftW, height: 15, ellipsis: true });
  // Selectable / editable letterhead address (falls back to the registered one).
  // GSTIN + PAN intentionally omitted here — GSTIN is already shown in the
  // supplier block below; only CIN + email remain in the header.
  doc.font('Helvetica').fontSize(7).fillColor(SUBTX)
    .text(branding.headerAddr || company.address, tx, T + 25, { width: leftW, height: 20, ellipsis: true })   // address, ≤2 lines
    .text(`CIN ${company.cin}   •   ${branding.contactInfo || company.email}`, tx, T + 47, { width: leftW, height: 9, ellipsis: true });
  doc.fillColor(HEADER_TX).font('Helvetica-Bold').fontSize(14).text(title, titleX, T + 12, { width: 210, align: 'right' });
  if (subtitle) doc.font('Helvetica').fontSize(8).fillColor(SUBTX).text(subtitle, titleX, T + 34, { width: 210, align: 'right' });
  doc.fillColor(INK);
  doc.y = T + HEADER_H + 12;
}

// Compact header for continuation pages.
function contHeader(doc, branding, title) {
  const W = doc.page.width;
  doc.rect(0, 0, W, CONT_HEADER_H).fill(HEADER_BG);
  doc.fillColor(HEADER_TX).fontSize(9.5).font('Helvetica-Bold').text(branding.headerText || company.pdfName, M, 9, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).text(`${title} (continued)`, M, 9, { width: W - 2 * M, align: 'right' });
  doc.fillColor(INK);
  return CONT_HEADER_H + 12;
}

// Footer + page numbers on EVERY buffered page (called once at the end).
function finalize(doc, note, branding = {}) {
  const W = doc.page.width;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;   // footer sits in the margin band — stop pdfkit from auto-paginating
    const y = doc.page.height - FOOTER_H;
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor(LINE).lineWidth(0.6).stroke();
    let ly = y + 5;
    doc.font('Helvetica').fillColor(MUTE);
    if (note) { doc.fontSize(7).text(note, M, ly, { width: W - 2 * M - 90, lineBreak: false }); }
    doc.fontSize(6.8).fillColor(MUTE)
      .text(branding.footerText || `Computer-generated by ${company.shortName} GST Compliance engine — no signature required if digitally registered.`,
        M, ly + (note ? 11 : 0), { width: W - 2 * M - 90, lineBreak: false });
    if (branding.disclaimer) doc.fontSize(6.2).fillColor(FAINT).text(branding.disclaimer, M, ly + (note ? 21 : 10), { width: W - 2 * M - 90, lineBreak: false });
    doc.fontSize(7).fillColor(MUTE).text(`Page ${i + 1} of ${range.count}`, W - M - 80, ly + 2, { width: 80, align: 'right' });
  }
  doc.flushPages();
}

// ── building blocks ──────────────────────────────────────────────────────────
function box(doc, x, y, w, h, fill) {
  doc.roundedRect(x, y, w, h, 4).lineWidth(0.8).strokeColor(LINE);
  if (fill) doc.fillAndStroke(fill, LINE); else doc.stroke();
  doc.fillColor(INK);
}

// A titled section bar (brand underline), like the quotation PDF.
function sectionBar(doc, title) {
  const W = doc.page.width;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(BRAND).text(title, M, doc.y);
  doc.moveTo(M, doc.y + 2).lineTo(W - M, doc.y + 2).strokeColor(LINE).lineWidth(0.6).stroke();
  doc.moveDown(0.4);
}

// Two-column aligned label/value rows inside a panel. Returns the panel height.
function infoPanel(doc, x, y, w, title, rows, accent = BRAND, tint = SOFT) {
  const rowH = 13, padTop = 22, padBottom = 8;
  const h = padTop + rows.length * rowH + padBottom;
  box(doc, x, y, w, h, tint);
  doc.fontSize(8).fillColor(accent).font('Helvetica-Bold').text(title, x + 8, y + 6, { width: w - 16, lineBreak: false });
  let ry = y + padTop;
  rows.forEach(([label, value, valColor]) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(label, x + 8, ry, { width: w * 0.42 - 10, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(valColor || INK).text(String(value ?? '—'), x + w * 0.42, ry, { width: w * 0.58 - 10, lineBreak: false, ellipsis: true });
    ry += rowH;
  });
  doc.fillColor(INK);
  return h;
}

// Party (address) block — height grows to show the full name + address (never
// clipped). partyHeight measures; partyBlock draws. Pass a shared height to two
// blocks to align them as an even row.
function partyLines(p = {}) {
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
function partyHeight(doc, w, p) {
  const innerW = w - 16, { name, lines } = partyLines(p);
  doc.font('Helvetica-Bold').fontSize(10.5); const nameH = doc.heightOfString(name, { width: innerW });
  doc.font('Helvetica').fontSize(8.6); const bodyH = doc.heightOfString(lines.join('\n'), { width: innerW });
  return Math.max(100, 8 + 13 + nameH + 3 + bodyH + 10);
}
function partyBlock(doc, x, y, w, label, p = {}, h) {
  const innerW = w - 16, { name, lines } = partyLines(p);
  if (!h) h = partyHeight(doc, w, p);
  box(doc, x, y, w, h, SOFT);
  doc.fontSize(8.5).fillColor(BRAND).font('Helvetica-Bold').text(label, x + 8, y + 8, { width: innerW, lineBreak: false });
  doc.fillColor(INK).fontSize(10.5).font('Helvetica-Bold').text(name, x + 8, y + 21, { width: innerW });
  const cy = y + 21 + doc.heightOfString(name, { width: innerW }) + 3;
  doc.font('Helvetica').fontSize(8.6).fillColor(MUTE).text(lines.join('\n'), x + 8, cy, { width: innerW });
  doc.fillColor(INK);
  return h;
}

// Signature strip — a single large signed/stamped signature image (no separate stamp).
function signatureStrip(doc, branding) {
  const W = doc.page.width;
  const sig = brandFile(branding, 'signatureFile');
  const sigW = 210, needed = 86;
  const x = W - M - sigW;
  let y = doc.y + 6;
  if (y + needed > bottomLimit(doc)) y = bottomLimit(doc) - needed;     // keep on page, above footer
  doc.fontSize(7.5).fillColor(MUTE).font('Helvetica').text(`For ${branding.headerText || company.pdfName}`, x, y, { width: sigW, align: 'right', lineBreak: false });
  fitImage(doc, sig, x, y + 12, sigW, 56);                              // large stamped-signature
  doc.moveTo(x, y + 70).lineTo(W - M, y + 70).strokeColor(FAINT).lineWidth(0.6).stroke();
  doc.fontSize(8).fillColor(INK).font('Helvetica-Bold').text('Authorised Signatory', x, y + 73, { width: sigW, align: 'right', lineBreak: false });
  doc.y = y + needed;
}

// ── e-INVOICE PDF ─────────────────────────────────────────────────────────────
export async function einvoicePdf(rec, branding = {}, lang = 'en') {
  setBrand(branding);
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
  applyPdfLang(doc, lang);
  const out = toBuffer(doc);
  const W = doc.page.width;
  const CW = W - 2 * M;                                  // content width
  const wm = branding.watermark || (rec.isCancelled ? 'CANCELLED' : (rec.irn ? '' : 'DRAFT'));

  header(doc, rec.docType === 'CRN' ? 'CREDIT NOTE' : rec.docType === 'DBN' ? 'DEBIT NOTE' : 'TAX INVOICE',
    rec.irn ? 'e-Invoice • IRN Registered' : 'e-Invoice • Not yet registered',
    { ...branding, headerAddr: rec.headerAddress || branding.headerAddr });
  watermark(doc, wm);

  // ── IRN / Ack strip + QR ───────────────────────────────────────────────────
  // Tall strip with a large, crisp QR (the signed QR is the most-scanned element
  // on the page — the empty lower half of the page gives us room to enlarge it).
  const stripY = doc.y, stripH = 150, qrW = 158;
  box(doc, M, stripY, CW - qrW - 10, stripH, BLUE_SOFT);
  doc.fontSize(8).fillColor(MUTE).font('Helvetica-Bold').text('IRN (Invoice Reference Number)', M + 12, stripY + 14);
  doc.fontSize(8).fillColor(INK).font('Courier-Bold').text(rec.irn || '— pending registration —', M + 12, stripY + 30, { width: CW - qrW - 34 });
  doc.font('Helvetica').fontSize(8.5).fillColor(FAINT).text('Ack No', M + 12, stripY + 92);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(rec.ackNo || '—', M + 64, stripY + 91, { width: 130, lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor(FAINT).text('Ack Date', M + 210, stripY + 92);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(rec.ackDate ? dmy(rec.ackDate) : '—', M + 262, stripY + 91, { width: 130, lineBreak: false });
  doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text('Scan the QR on the right to verify this e-Invoice on the government portal.', M + 12, stripY + 122, { width: CW - qrW - 34 });

  box(doc, W - M - qrW, stripY, qrW, stripH, '#ffffff');
  if (rec.signedQr) {
    try {
      // Encode the FULL signed QR string (never truncate — slicing corrupts the QR).
      // Render at high resolution and enlarge for a sharp, easily-scanned code.
      const png = await QRCode.toBuffer(String(rec.signedQr), { margin: 1, width: 720, errorCorrectionLevel: 'L' });
      const q = qrW - 20;                                    // large square QR (~138pt)
      doc.image(png, W - M - qrW + (qrW - q) / 2, stripY + (stripH - q) / 2, { width: q, height: q });
    } catch { /* ignore */ }
  } else {
    doc.fontSize(8).fillColor(FAINT).font('Helvetica').text('QR after\nregistration', W - M - qrW, stripY + stripH / 2 - 8, { width: qrW, align: 'center' });
  }
  doc.y = stripY + stripH + 10;

  // ── document meta bar ──────────────────────────────────────────────────────
  const my = doc.y;
  box(doc, M, my, CW, 22, SOFT);
  doc.fontSize(8).fillColor(INK).font('Helvetica-Bold').text(`Invoice No:  ${rec.docNo || '—'}`, M + 10, my + 7, { lineBreak: false });
  doc.font('Helvetica').fillColor(MUTE).text(`Date: ${dmy(rec.docDate)}      Supply: ${rec.supplyType || '—'}      Reverse Charge: ${rec.reverseCharge ? 'Yes' : 'No'}`,
    M + CW / 2 - 40, my + 7, { width: CW / 2 + 30, align: 'right', lineBreak: false });
  let metaBottom = my + 22;
  // Purchase-order reference (buyer's PO) — printed on our branded document only;
  // it is deliberately NOT part of the IRP/portal JSON.
  if (rec.poNo || rec.poDate) {
    const py2 = metaBottom + 4;
    box(doc, M, py2, CW, 20, SOFT);
    doc.fontSize(8).fillColor(INK).font('Helvetica-Bold').text(`PO No:  ${rec.poNo || '—'}`, M + 10, py2 + 6, { lineBreak: false });
    if (rec.poDate) doc.font('Helvetica').fillColor(MUTE).text(`PO Date: ${dmy(rec.poDate)}`, M + CW / 2, py2 + 6, { width: CW / 2 - 10, align: 'right', lineBreak: false });
    metaBottom = py2 + 20;
  }
  // Delivery / site address (free text) — branded document only, NOT in the IRP JSON.
  if (rec.siteAddress && String(rec.siteAddress).trim()) {
    const sy = metaBottom + 4, labelW = 118, txt = String(rec.siteAddress).trim();
    doc.font('Helvetica').fontSize(8);
    const th = doc.heightOfString(txt, { width: CW - labelW - 20 });
    const bh = Math.max(20, th + 12);
    box(doc, M, sy, CW, bh, SOFT);
    doc.fontSize(7.5).fillColor(MUTE).font('Helvetica-Bold').text('SITE / DELIVERY ADDRESS', M + 10, sy + 6, { width: labelW, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(INK).text(txt, M + labelW + 10, sy + 6, { width: CW - labelW - 20 });
    metaBottom = sy + bh;
  }
  doc.y = metaBottom + 10;

  // ── parties (cards grow to fit, aligned to the taller of the two) ───────────
  const py = doc.y, halfW = (CW - 10) / 2;
  const buyer = { ...rec.buyer, stateCode: rec.buyer?.stateCode || rec.buyer?.pos };
  const ph = Math.max(partyHeight(doc, halfW, rec.seller), partyHeight(doc, halfW, buyer));
  partyBlock(doc, M, py, halfW, 'SUPPLIER', rec.seller, ph);
  partyBlock(doc, M + halfW + 10, py, halfW, 'RECIPIENT', buyer, ph);
  doc.y = py + ph + 10;

  // ── items table ────────────────────────────────────────────────────────────
  const cols = [
    { k: 'slNo', t: '#', w: 0.05, a: 'left' },
    { k: 'description', t: 'Description', w: 0.24, a: 'left' },
    { k: 'hsn', t: 'HSN/SAC', w: 0.09, a: 'left' },
    { k: 'quantity', t: 'Qty', w: 0.06, a: 'right' },
    { k: 'unitPrice', t: 'Rate', w: 0.11, a: 'right' },
    { k: 'taxableValue', t: 'Taxable', w: 0.13, a: 'right' },
    { k: 'gstRate', t: 'GST%', w: 0.06, a: 'right' },
    { k: 'tax', t: 'Tax', w: 0.11, a: 'right' },
    { k: 'totalItemValue', t: 'Total', w: 0.15, a: 'right' },
  ];
  const drawHead = (ty) => {
    doc.rect(M, ty, CW, 18).fill(THEAD_BG);
    doc.fillColor(THEAD_TX).fontSize(7.5).font('Helvetica-Bold');
    let cx = M;
    cols.forEach((c) => { doc.text(c.t, cx + 4, ty + 5.5, { width: c.w * CW - 8, align: c.a, lineBreak: false }); cx += c.w * CW; });
    doc.font('Helvetica').fillColor(INK).fontSize(7.5);
    return ty + 18;
  };
  let ty = drawHead(doc.y);
  const descCol = cols.find((c) => c.k === 'description');
  const descW = descCol.w * CW - 8;
  (rec.items || []).forEach((it, i) => {
    // Row height grows to fit the (possibly long) wrapped description — no cut-off.
    doc.font('Helvetica').fontSize(7.5);
    const descH = doc.heightOfString(String(it.description || '—'), { width: descW });
    const rowH = Math.max(15, descH + 7);
    if (ty + rowH > bottomLimit(doc)) { doc.addPage(); watermark(doc, wm); ty = drawHead(contHeader(doc, branding, 'TAX INVOICE')); }
    if (i % 2) doc.rect(M, ty, CW, rowH).fill(SOFT);
    const tax = Number(it.igstAmount || 0) + Number(it.cgstAmount || 0) + Number(it.sgstAmount || 0);
    doc.fillColor(INK).font('Helvetica').fontSize(7.5);
    let cx = M;
    cols.forEach((c) => {
      let val = it[c.k];
      if (c.k === 'slNo') val = it.slNo || i + 1;
      else if (c.k === 'tax') val = inr(tax);
      else if (['unitPrice', 'taxableValue', 'totalItemValue'].includes(c.k)) val = inr(val);
      else if (c.k === 'gstRate') val = `${Number(val || 0)}%`;
      if (c.k === 'description') doc.text(String(val ?? ''), cx + 4, ty + 4, { width: c.w * CW - 8 });   // wraps to full height
      else doc.text(String(val ?? ''), cx + 4, ty + 4, { width: c.w * CW - 8, align: c.a, ellipsis: true, lineBreak: false });
      cx += c.w * CW;
    });
    ty += rowH;
  });
  doc.moveTo(M, ty).lineTo(W - M, ty).strokeColor(LINE).lineWidth(0.6).stroke();
  doc.y = ty + 10;

  // ── HSN summary (left) + tax summary (right) — kept together ────────────────
  const sumH = 116;
  if (doc.y + sumH > bottomLimit(doc)) { doc.addPage(); watermark(doc, wm); doc.y = contHeader(doc, branding, 'TAX INVOICE'); }
  const blockY = doc.y;

  // tax summary (right)
  const v = rec.val || {};
  const sumW = 220, sumX = W - M - sumW;
  box(doc, sumX, blockY, sumW, sumH, SOFT);
  const rowsSum = [
    ['Assessable Value', v.assessableValue], ['CGST', v.cgstValue], ['SGST', v.sgstValue],
    ['IGST', v.igstValue], ['Cess', v.cessValue], ['Round Off', v.roundOff],
  ];
  doc.fontSize(8).font('Helvetica');
  rowsSum.forEach((r, i) => {
    const ry = blockY + 8 + i * 13;
    doc.fillColor(MUTE).font('Helvetica').text(r[0], sumX + 10, ry, { width: sumW * 0.5, lineBreak: false });
    doc.fillColor(INK).font('Helvetica').text(inr(r[1]), sumX + sumW * 0.4, ry, { width: sumW * 0.6 - 12, align: 'right', lineBreak: false });
  });
  doc.rect(sumX, blockY + sumH - 24, sumW, 24).fill(THEAD_BG);
  doc.fillColor(THEAD_TX).font('Helvetica-Bold').fontSize(9.5)
    .text('Total Invoice Value', sumX + 10, blockY + sumH - 16, { width: sumW * 0.55, lineBreak: false })
    .text(inr(v.totalInvoiceValue), sumX + sumW * 0.5, blockY + sumH - 16, { width: sumW * 0.5 - 10, align: 'right', lineBreak: false });

  // HSN summary (left)
  const hsnMap = {};
  (rec.items || []).forEach((it) => {
    const k = it.hsn || '—';
    hsnMap[k] = hsnMap[k] || { taxable: 0, tax: 0 };
    hsnMap[k].taxable += Number(it.taxableValue || 0);
    hsnMap[k].tax += Number(it.igstAmount || 0) + Number(it.cgstAmount || 0) + Number(it.sgstAmount || 0);
  });
  const hsnEntries = Object.entries(hsnMap).slice(0, 6);
  box(doc, M, blockY, sumX - M - 10, sumH, '#ffffff');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND).text('HSN / SAC Summary', M + 10, blockY + 7);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(FAINT)
    .text('HSN', M + 10, blockY + 22, { width: 70, lineBreak: false })
    .text('Taxable', M + 86, blockY + 22, { width: 90, align: 'right', lineBreak: false })
    .text('Tax', M + 180, blockY + 22, { width: sumX - M - 200, align: 'right', lineBreak: false });
  let hy = blockY + 34;
  doc.font('Helvetica').fontSize(7.5).fillColor(INK);
  hsnEntries.forEach(([h, val]) => {
    doc.fillColor(INK).text(h, M + 10, hy, { width: 70, lineBreak: false });
    doc.fillColor(MUTE).text(inr(val.taxable), M + 86, hy, { width: 90, align: 'right', lineBreak: false });
    doc.fillColor(MUTE).text(inr(val.tax), M + 180, hy, { width: sumX - M - 200, align: 'right', lineBreak: false });
    hy += 12;
  });
  doc.y = blockY + sumH + 10;

  // ── declaration + terms (height-capped → never auto-paginate) ───────────────
  if (doc.y + 40 > bottomLimit(doc)) { doc.addPage(); watermark(doc, wm); doc.y = contHeader(doc, branding, 'TAX INVOICE'); }
  doc.fontSize(7.3).fillColor(MUTE).font('Helvetica')
    .text('Declaration: We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct. Registered on the Invoice Registration Portal (IRP) under the GST e-invoicing rules.',
      M, doc.y, { width: CW, height: 22, ellipsis: true });
  doc.y += 24;
  if (branding.terms) {
    doc.fontSize(7).fillColor(FAINT).text(`Terms & Conditions: ${branding.terms}`, M, doc.y, { width: CW, height: 20, ellipsis: true });
    doc.y += 22;
  }

  // ── signature / stamp ──────────────────────────────────────────────────────
  signatureStrip(doc, branding);

  finalize(doc, rec.isCancelled ? `CANCELLED on ${dmy(rec.cancelDate)} (reason ${rec.cancelReasonCode}).` : null, branding);
  doc.end();
  return out;
}

// ── e-WAY BILL PDF (redesigned: structured Part A / Part B panels) ────────────
export async function ewbPdf(rec, branding = {}, lang = 'en') {
  setBrand(branding);
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
  applyPdfLang(doc, lang);
  const out = toBuffer(doc);
  const W = doc.page.width;
  const CW = W - 2 * M;
  const wm = branding.watermark || (rec.isCancelled ? 'CANCELLED' : (rec.ewbNo ? '' : 'DRAFT'));
  const expired = rec.validUpto && new Date(rec.validUpto) < new Date();
  const statusColor = rec.isCancelled ? '#dc2626' : rec.isClosed ? '#6b7280' : expired ? '#dc2626' : rec.ewbNo ? '#15803d' : '#b45309';
  const statusText = rec.isCancelled ? 'CANCELLED' : rec.isClosed ? 'CLOSED' : expired ? 'EXPIRED' : rec.ewbNo ? 'ACTIVE' : 'DRAFT';

  header(doc, 'e-WAY BILL', rec.ewbNo ? 'Goods in transit document' : 'Not yet generated', branding);
  watermark(doc, wm);

  // ── EWB number + validity + status + QR ────────────────────────────────────
  const stripY = doc.y, stripH = 66, qrW = 96;
  box(doc, M, stripY, CW - qrW - 10, stripH, BLUE_SOFT);
  doc.fontSize(7).fillColor(MUTE).font('Helvetica-Bold').text('E-WAY BILL NO.', M + 10, stripY + 8);
  doc.fontSize(15).fillColor(INK).font('Helvetica-Bold').text(rec.ewbNo || '— pending —', M + 10, stripY + 18, { lineBreak: false });
  doc.fontSize(7.5).font('Helvetica').fillColor(FAINT).text('Generated', M + 10, stripY + 44);
  doc.font('Helvetica-Bold').fillColor(INK).text(rec.ewbDate ? dmy(rec.ewbDate) : '—', M + 58, stripY + 44, { width: 90, lineBreak: false });
  doc.font('Helvetica').fillColor(FAINT).text('Valid Upto', M + 165, stripY + 44);
  doc.font('Helvetica-Bold').fillColor(expired ? '#dc2626' : INK).text(rec.validUpto ? dmy(rec.validUpto) : '—', M + 215, stripY + 44, { width: 100, lineBreak: false });
  // status chip
  doc.roundedRect(M + (CW - qrW - 10) - 86, stripY + 9, 76, 16, 8).fill(statusColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(statusText, M + (CW - qrW - 10) - 86, stripY + 13, { width: 76, align: 'center', lineBreak: false });

  box(doc, W - M - qrW, stripY, qrW, stripH, '#ffffff');
  if (rec.ewbNo) {
    try {
      const qr = await QRCode.toBuffer(`${rec.ewbNo}/${rec.fromGstin || ''}/${dmy(rec.docDate)}`, { margin: 0, width: 160 });
      doc.image(qr, W - M - qrW + (qrW - 52) / 2, stripY + 6, { width: 52, height: 52 });
    } catch { /* ignore */ }
  }
  doc.fontSize(6).fillColor(MUTE).text('Scan to verify', W - M - qrW, stripY + stripH - 9, { width: qrW, align: 'center' });
  doc.y = stripY + stripH + 12;

  // ── Part A — supply & document (aligned panel) ─────────────────────────────
  sectionBar(doc, 'Part A — Supply & Document Details');
  const aY = doc.y, half = (CW - 10) / 2;
  const modes = { 1: 'Road', 2: 'Rail', 3: 'Air', 4: 'Ship' };
  const hA = infoPanel(doc, M, aY, half, 'DOCUMENT', [
    ['Doc Type', rec.docType || '—'],
    ['Doc No', rec.docNo || '—'],
    ['Doc Date', dmy(rec.docDate)],
    ['Supply', `${rec.supplyType === 'O' ? 'Outward' : 'Inward'} / ${rec.subSupplyType || '—'}`],
  ]);
  infoPanel(doc, M + half + 10, aY, half, 'VALUE & DISTANCE', [
    ['Txn Type', rec.transactionType || '—'],
    ['Invoice Value', inr(rec.totInvValue)],
    ['Taxable Value', inr(rec.totalTaxable)],
    ['Distance', `${rec.transDistance || 0} km`],
  ]);
  doc.y = aY + hA + 12;

  // ── From / To (cards grow to fit, aligned) ──────────────────────────────────
  const py = doc.y;
  const fromP = { legalName: rec.fromTradeName, gstin: rec.fromGstin, addr1: rec.fromAddr1, location: rec.fromPlace, pincode: rec.fromPincode, stateCode: rec.fromStateCode };
  const toP = { legalName: rec.toTradeName, gstin: rec.toGstin, addr1: rec.toAddr1, location: rec.toPlace, pincode: rec.toPincode, stateCode: rec.toStateCode };
  const ph = Math.max(partyHeight(doc, half, fromP), partyHeight(doc, half, toP));
  partyBlock(doc, M, py, half, 'FROM (Dispatch)', fromP, ph);
  partyBlock(doc, M + half + 10, py, half, 'TO (Ship To)', toP, ph);
  doc.y = py + ph + 10;

  // ── Part B — transport (aligned panel, color-coded by completeness) ────────
  const partB = rec.partBReady || rec.vehicleNo || rec.transDocNo;
  sectionBar(doc, `Part B — Transport ${partB ? '' : '(pending)'}`);
  const bY = doc.y;
  const accent = partB ? '#15803d' : '#b45309', tint = partB ? '#f0fdf4' : '#fff7ed';
  const hB = infoPanel(doc, M, bY, half, 'CONVEYANCE', [
    ['Mode', modes[rec.transMode] || '—'],
    ['Vehicle No', rec.vehicleNo || '—'],
    ['Vehicle Type', rec.vehicleType === 'O' ? 'Over-Dimensional' : rec.vehicleType ? 'Regular' : '—'],
  ], accent, tint);
  infoPanel(doc, M + half + 10, bY, half, 'TRANSPORTER', [
    ['Name', rec.transporterName || '—'],
    ['Transporter ID', rec.transporterId || '—'],
    ['Trans Doc', `${rec.transDocNo || '—'}${rec.transDocDate ? ' (' + dmy(rec.transDocDate) + ')' : ''}`],
  ], accent, tint);
  doc.y = bY + hB + 12;

  // ── items table ────────────────────────────────────────────────────────────
  const cols = [
    { t: 'Product', w: 0.46, a: 'left' },
    { t: 'HSN', w: 0.14, a: 'left' },
    { t: 'Qty', w: 0.16, a: 'left' },
    { t: 'Taxable', w: 0.24, a: 'right' },
  ];
  const drawHead = (yy) => {
    doc.rect(M, yy, CW, 16).fill(THEAD_BG);
    doc.fillColor(THEAD_TX).fontSize(7.5).font('Helvetica-Bold');
    let cx = M;
    cols.forEach((c) => { doc.text(c.t, cx + 4, yy + 4.5, { width: c.w * CW - 8, align: c.a, lineBreak: false }); cx += c.w * CW; });
    doc.font('Helvetica').fillColor(INK).fontSize(7.5);
    return yy + 16;
  };
  let ty = drawHead(doc.y);
  const prodW = cols[0].w * CW - 8;
  (rec.items || []).forEach((it, i) => {
    const cells = [
      it.description || it.productName || '—',
      String(it.hsn || '—'),
      `${it.quantity || ''} ${it.unit || ''}`.trim() || '—',
      inr(it.taxableAmount),
    ];
    // Row height grows to fit the wrapped product description — no cut-off.
    doc.font('Helvetica').fontSize(7.5);
    const rowH = Math.max(14, doc.heightOfString(cells[0], { width: prodW }) + 6);
    if (ty + rowH > bottomLimit(doc)) { doc.addPage(); watermark(doc, wm); ty = drawHead(contHeader(doc, branding, 'e-WAY BILL')); }
    if (i % 2) doc.rect(M, ty, CW, rowH).fill(SOFT);
    doc.fillColor(INK).font('Helvetica').fontSize(7.5);
    let cx = M;
    cols.forEach((c, ci) => {
      if (ci === 0) doc.text(cells[ci], cx + 4, ty + 3.5, { width: c.w * CW - 8 });
      else doc.text(cells[ci], cx + 4, ty + 3.5, { width: c.w * CW - 8, align: c.a, ellipsis: true, lineBreak: false });
      cx += c.w * CW;
    });
    ty += rowH;
  });
  doc.moveTo(M, ty).lineTo(W - M, ty).strokeColor(LINE).lineWidth(0.6).stroke();
  doc.y = ty + 10;

  // ── signature / stamp ──────────────────────────────────────────────────────
  signatureStrip(doc, branding);

  finalize(doc,
    rec.isCancelled ? `CANCELLED on ${dmy(rec.cancelDate)} (reason ${rec.cancelReasonCode}).`
      : rec.isClosed ? 'CLOSED — delivery complete.'
        : 'Carry this e-way bill during the movement of goods.',
    branding);
  doc.end();
  return out;
}
