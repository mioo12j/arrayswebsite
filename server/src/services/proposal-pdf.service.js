// =============================================================================
//  ARRAYS INGENIERIA — Premium Techno-Commercial Proposal generator (pdfkit)
//  Veteran-led Solar EPC. Real brand identity: emerald + gold editorial system,
//  the company logo, and real project / recognition photography.
//  Typography: Cormorant Garamond (headings) · EB Garamond (body) ·
//  Inter (labels/data) · TeX Gyre Chorus (one chancery flourish).
//  Exports renderProposal(doc, data) which appends the full book to a shared doc.
// =============================================================================
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, '../assets/fonts');
const BRAND = path.join(HERE, '../assets/brand');

// ---- palette (sampled from the live brand site + logo) ----------------------
const C = {
  ink:   '#0c1f17',   // near-black green — headings ink
  body:  '#38493f',   // body text
  mute:  '#6b7d74',   // captions / labels
  faint: '#93a49b',
  line:  '#e2ece6',   // hairlines
  paper: '#ffffff',
  mint:  '#f4faf7',   // soft panel
  mint2: '#e9f8f1',   // mint panel
  cream: '#fff7e6',   // warm panel
  emer:  '#0a6045',   // primary emerald
  emerD: '#07281d',   // deep emerald (footers / covers)
  emerM: '#0e7a57',   // mid emerald
  gold:  '#b8860b',   // gold
  goldB: '#e7a719',   // bright gold accent
  // logo tri-tones (used sparingly, for the tri-tick + accents)
  sun:  '#f2a51c',
  sky:  '#22a9e0',
  navy: '#1c3a86',
  grn:  '#3aa935',
};

const M = 44;                       // page margin
export const PROPOSAL_BRAND = { M, C };

// ---- font registration ------------------------------------------------------
function reg(doc, name, file, fallback) {
  try { doc.registerFont(name, path.join(FONT_DIR, file)); }
  catch { doc.registerFont(name, fallback || 'Helvetica'); }
}
function registerFonts(doc) {
  reg(doc, 'H',    'Cormorant-SemiBold.ttf', 'Times-Roman');   // display headings
  reg(doc, 'HB',   'Cormorant-Bold.ttf',     'Times-Bold');
  reg(doc, 'body', 'EBGaramond-Regular.ttf', 'Times-Roman');   // running text
  reg(doc, 'bodyM','EBGaramond-Medium.ttf',  'Times-Roman');
  reg(doc, 'bodyI','EBGaramond-Italic.ttf',  'Times-Italic');
  reg(doc, 'ui',   'Inter-Regular.ttf',      'Helvetica');     // labels / data
  reg(doc, 'uiM',  'Inter-Medium.ttf',       'Helvetica');
  reg(doc, 'uiSB', 'Inter-SemiBold.ttf',     'Helvetica-Bold');
  reg(doc, 'uiB',  'Inter-Bold.ttf',         'Helvetica-Bold');
  reg(doc, 'script','TeXGyreChorus.otf',     'Times-Italic');  // chancery flourish
}

// ---- asset helpers ----------------------------------------------------------
const photo  = (n) => path.join(BRAND, 'photos', n + '.jpg');
const press  = (n) => path.join(BRAND, 'press',  n + '.jpg');
const cert   = (n) => path.join(BRAND, 'certs',  n + '.jpg');
const news   = (n) => path.join(BRAND, 'news',   n + '.jpg');
const LOGO_C = path.join(BRAND, 'logo-color.png');
const LOGO_W = path.join(BRAND, 'logo-white.png');
const has = (f) => { try { return fs.existsSync(f); } catch { return false; } };

// cover-fit an image inside a rounded rect, clipped
function drawImg(doc, file, x, y, w, h, r = 0) {
  if (!has(file)) { // graceful placeholder
    doc.save().roundedRect(x, y, w, h, r).fill(C.mint2).restore();
    return;
  }
  doc.save();
  if (r > 0) doc.roundedRect(x, y, w, h, r).clip();
  else doc.rect(x, y, w, h).clip();
  try { doc.image(file, x, y, { cover: [w, h], align: 'center', valign: 'center' }); }
  catch { doc.rect(x, y, w, h).fill(C.mint2); }
  doc.restore();
}

// place the logo fit to a width (art is square with built-in padding)
function logo(doc, x, y, w, white = false) {
  const f = white ? LOGO_W : LOGO_C;
  if (!has(f)) return;
  try { doc.image(f, x, y, { width: w }); } catch { /* ignore */ }
}

// ---- small drawing utilities ------------------------------------------------
function triTick(doc, x, y, w = 74) {          // gold + emerald + sky underline
  const seg = w / 3;
  doc.save();
  doc.rect(x, y, seg, 3).fill(C.gold);
  doc.rect(x + seg + 5, y, seg, 3).fill(C.emer);
  doc.rect(x + 2 * (seg + 5), y, seg - 10, 3).fill(C.sky);
  doc.restore();
}

function eyebrow(doc, text, x, y, color = C.gold) {
  doc.font('uiSB').fontSize(8.5).fillColor(color)
     .text(String(text).toUpperCase(), x, y, { characterSpacing: 2.4 });
}

// section heading block; returns y after the heading
function heading(doc, kicker, title, opts = {}) {
  const x = opts.x ?? M;
  const y = opts.y ?? doc.y;
  const w = opts.w ?? (doc.page.width - 2 * M);
  eyebrow(doc, kicker, x, y, opts.kickColor || C.gold);
  doc.font(opts.script ? 'script' : 'H')
     .fontSize(opts.size || 30).fillColor(opts.ink || C.ink)
     .text(title, x, y + 13, { width: w });
  const yy = doc.y + 6;
  triTick(doc, x, yy, 74);
  doc.y = yy + 16;
  return doc.y;
}

function para(doc, text, x, y, w, opts = {}) {
  doc.font(opts.font || 'body').fontSize(opts.size || 10.6)
     .fillColor(opts.color || C.body)
     .text(text, x, y, { width: w, align: opts.align || 'left', lineGap: opts.lineGap ?? 3.4 });
  return doc.y;
}

// rounded panel
function panel(doc, x, y, w, h, fill, r = 9, stroke) {
  doc.save().roundedRect(x, y, w, h, r);
  if (fill) doc.fillColor(fill).fill();
  if (stroke) { doc.roundedRect(x, y, w, h, r).lineWidth(0.8).strokeColor(stroke).stroke(); }
  doc.restore();
}

// A full-width closing statement band — fills the foot of a page and reads as
// an intentional pull-quote. `y` should be near the page bottom (~700–724).
function closingBand(doc, text, opts = {}) {
  const W = doc.page.width, w = W - 2 * M;
  const dark = !!opts.dark;
  const h = opts.h || 58;
  const y = Math.min(opts.y ?? 716, doc.page.height - 30 - h - 6);
  panel(doc, M, y, w, h, dark ? C.emerD : C.mint, 9, dark ? null : C.line);
  doc.rect(M, y, 4, h).fill(C.gold);
  let tx = M + 22;
  if (opts.icon) { iconChip(doc, opts.icon, M + 16, y + (h - 34) / 2, 34, dark ? '#0b3a2b' : C.mint2, dark ? C.goldB : C.emer); tx = M + 64; }
  const tw = W - M - tx - 18;
  doc.font('bodyI').fontSize(opts.size || 11.5).fillColor(dark ? '#ffffff' : C.emer);
  const th = doc.heightOfString(text, { width: tw, lineGap: 2.5 });
  doc.text(text, tx, y + (h - th) / 2, { width: tw, lineGap: 2.5 });
  return y + h;
}

// ---- page chrome ------------------------------------------------------------
function chrome(doc, tag) {
  const W = doc.page.width, H = doc.page.height;
  doc.page.margins.bottom = 0;
  // header — logo left, section tag centred, company right
  logo(doc, M - 6, 22, 66);
  doc.font('uiSB').fontSize(9).fillColor(C.mute)
     .text(String(tag || 'Techno-Commercial Proposal').toUpperCase(), 0, 45, { width: W, align: 'center', characterSpacing: 2.6 });
  doc.font('ui').fontSize(7.5).fillColor(C.faint)
     .text('ARRAYS INGENIERIA', W - M - 160, 47, { width: 160, align: 'right' });
  doc.moveTo(M, 84).lineTo(W - M, 84).lineWidth(0.8).strokeColor(C.line).stroke();
  doc.rect(W / 2 - 23, 84, 46, 2).fill(C.gold);
  // footer strip (full-bleed emerald)
  const fy = H - 30;
  doc.rect(0, fy, W, 30).fill(C.emerD);
  doc.font('bodyI').fontSize(9).fillColor('#cfe9df')
     .text('Developing Green Energy for the Nation', M, fy + 9, { lineBreak: false });
  doc.font('ui').fontSize(7.5).fillColor('#a7cfc0')
     .text('ISO 9001 · 14001 · 45001   ·   arraysingenieria@gmail.com', W - M - 300, fy + 10,
           { width: 300, align: 'right' });
  doc.y = 100;
}

// full-bleed dark page base (cover / thank-you)
function bleed(doc, color) {
  const W = doc.page.width, H = doc.page.height;
  doc.page.margins.bottom = 0;
  doc.rect(0, 0, W, H).fill(color || C.emerD);
}

// =============================================================================
//  ICONS (simple vector pictograms drawn in a tinted chip)
// =============================================================================
function icon(doc, kind, cx, cy, s, col) {
  doc.save().lineWidth(1.6).strokeColor(col).fillColor(col);
  const L = (a, b, c, d) => doc.moveTo(a, b).lineTo(c, d).stroke();
  switch (kind) {
    case 'panel':
      doc.rect(cx - s, cy - s * 0.7, 2 * s, 1.4 * s).stroke();
      L(cx - s, cy - s * 0.23, cx + s, cy - s * 0.23);
      L(cx - s, cy + s * 0.23, cx + s, cy + s * 0.23);
      L(cx - s / 3, cy - s * 0.7, cx - s / 3, cy + s * 0.7);
      L(cx + s / 3, cy - s * 0.7, cx + s / 3, cy + s * 0.7); break;
    case 'sun':
      doc.circle(cx, cy, s * 0.45).stroke();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L(cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.7, cx + Math.cos(a) * s, cy + Math.sin(a) * s); } break;
    case 'bolt':
      doc.moveTo(cx + s * 0.2, cy - s).lineTo(cx - s * 0.5, cy + s * 0.1).lineTo(cx, cy + s * 0.1)
         .lineTo(cx - s * 0.2, cy + s).lineTo(cx + s * 0.5, cy - s * 0.1).lineTo(cx, cy - s * 0.1).fill(); break;
    case 'shield':
      doc.moveTo(cx, cy - s).lineTo(cx + s * 0.8, cy - s * 0.55).lineTo(cx + s * 0.8, cy + s * 0.2)
         .bezierCurveTo(cx + s * 0.8, cy + s * 0.7, cx + s * 0.4, cy + s, cx, cy + s)
         .bezierCurveTo(cx - s * 0.4, cy + s, cx - s * 0.8, cy + s * 0.7, cx - s * 0.8, cy + s * 0.2)
         .lineTo(cx - s * 0.8, cy - s * 0.55).closePath().stroke();
      doc.moveTo(cx - s * 0.32, cy + s * 0.02).lineTo(cx - s * 0.05, cy + s * 0.32).lineTo(cx + s * 0.4, cy - s * 0.35).stroke(); break;
    case 'leaf':
      doc.moveTo(cx - s * 0.7, cy + s * 0.7).bezierCurveTo(cx - s, cy - s * 0.6, cx + s * 0.4, cy - s, cx + s * 0.8, cy - s * 0.7)
         .bezierCurveTo(cx + s * 0.6, cy + s * 0.5, cx - s * 0.5, cy + s * 0.9, cx - s * 0.7, cy + s * 0.7).fill();
      doc.strokeColor('#ffffff').moveTo(cx - s * 0.4, cy + s * 0.5).lineTo(cx + s * 0.5, cy - s * 0.5).stroke(); break;
    case 'clock':
      doc.circle(cx, cy, s * 0.85).stroke(); L(cx, cy, cx, cy - s * 0.5); L(cx, cy, cx + s * 0.4, cy + s * 0.15); break;
    case 'medal':
      doc.circle(cx, cy + s * 0.25, s * 0.55).stroke();
      L(cx - s * 0.35, cy - s * 0.1, cx - s * 0.6, cy - s); L(cx + s * 0.35, cy - s * 0.1, cx + s * 0.6, cy - s); break;
    case 'people':
      doc.circle(cx - s * 0.4, cy - s * 0.3, s * 0.35).stroke();
      doc.circle(cx + s * 0.4, cy - s * 0.3, s * 0.35).stroke();
      doc.moveTo(cx - s, cy + s * 0.8).bezierCurveTo(cx - s, cy + s * 0.1, cx + 0, cy + s * 0.1, cx + 0, cy + s * 0.8).stroke();
      doc.moveTo(cx + 0, cy + s * 0.8).bezierCurveTo(cx + 0, cy + s * 0.1, cx + s, cy + s * 0.1, cx + s, cy + s * 0.8).stroke(); break;
    case 'tools':
      L(cx - s * 0.7, cy + s * 0.7, cx + s * 0.2, cy - s * 0.2);
      doc.circle(cx - s * 0.6, cy + s * 0.6, s * 0.22).stroke();
      L(cx + s * 0.1, cy + s * 0.7, cx + s * 0.7, cy - s * 0.6); break;
    case 'home':
      doc.moveTo(cx - s, cy).lineTo(cx, cy - s * 0.9).lineTo(cx + s, cy).stroke();
      doc.rect(cx - s * 0.7, cy, s * 1.4, s * 0.85).stroke(); break;
    case 'factory':
      doc.moveTo(cx - s, cy + s * 0.6).lineTo(cx - s, cy - s * 0.2).lineTo(cx - s * 0.1, cy + s * 0.2)
         .lineTo(cx - s * 0.1, cy - s * 0.2).lineTo(cx + s * 0.8, cy + s * 0.2).lineTo(cx + s * 0.8, cy + s * 0.6).closePath().stroke(); break;
    case 'grid':
      doc.rect(cx - s * 0.8, cy - s * 0.8, s * 1.6, s * 1.6).stroke();
      L(cx, cy - s * 0.8, cx, cy + s * 0.8); L(cx - s * 0.8, cy, cx + s * 0.8, cy); break;
    case 'doc':
      doc.rect(cx - s * 0.6, cy - s * 0.85, s * 1.2, s * 1.7).stroke();
      L(cx - s * 0.3, cy - s * 0.35, cx + s * 0.3, cy - s * 0.35);
      L(cx - s * 0.3, cy, cx + s * 0.3, cy); L(cx - s * 0.3, cy + s * 0.35, cx + s * 0.1, cy + s * 0.35); break;
    case 'rupee':
      doc.font('uiB').fontSize(s * 1.6).fillColor(col).text('₹', cx - s * 0.55, cy - s * 0.9); break;
    case 'battery':
      doc.roundedRect(cx - s, cy - s * 0.66, 2 * s, s * 1.32, s * 0.14).stroke();
      doc.rect(cx + s, cy - s * 0.26, s * 0.2, s * 0.52).fill();
      doc.moveTo(cx + s * 0.2, cy - s * 0.42).lineTo(cx - s * 0.32, cy + s * 0.06).lineTo(cx - s * 0.02, cy + s * 0.06)
         .lineTo(cx - s * 0.2, cy + s * 0.5).lineTo(cx + s * 0.34, cy - s * 0.04).lineTo(cx + s * 0.02, cy - s * 0.04).closePath().fill(); break;
    case 'breaker':                                  // DCDB / ACDB distribution box
      doc.roundedRect(cx - s, cy - s * 0.75, 2 * s, 1.5 * s, s * 0.12).stroke();
      for (let k = -2; k <= 2; k++) { doc.rect(cx + k * s * 0.34 - s * 0.06, cy - s * 0.4, s * 0.12, s * 0.5).fill(); }
      doc.rect(cx - s * 0.5, cy + s * 0.28, s, s * 0.14).fill(); break;
    case 'meter':                                    // energy meter
      doc.circle(cx, cy - s * 0.1, s * 0.62).stroke();
      doc.moveTo(cx, cy - s * 0.1).lineTo(cx + s * 0.3, cy - s * 0.4).stroke();
      for (let k = -1; k <= 1; k++) doc.circle(cx + k * s * 0.28, cy + s * 0.62, s * 0.1).fill(); break;
    case 'pole':                                     // utility transmission tower
      doc.moveTo(cx - s * 0.55, cy + s).lineTo(cx, cy - s).lineTo(cx + s * 0.55, cy + s).stroke();
      doc.moveTo(cx - s * 0.4, cy - s * 0.3).lineTo(cx + s * 0.4, cy - s * 0.3).stroke();
      doc.moveTo(cx - s * 0.28, cy + s * 0.2).lineTo(cx + s * 0.28, cy + s * 0.2).stroke();
      doc.moveTo(cx - s * 0.33, cy + s).lineTo(cx + s * 0.33, cy - s * 0.55).moveTo(cx + s * 0.33, cy + s).lineTo(cx - s * 0.33, cy - s * 0.55).stroke(); break;
    case 'generator':
      doc.roundedRect(cx - s, cy - s * 0.5, 2 * s, s, s * 0.14).stroke();
      doc.font('uiB').fontSize(s * 0.9).fillColor(col).text('G', cx - s * 0.3, cy - s * 0.5); break;
    case 'flag':
      L(cx - s * 0.6, cy - s, cx - s * 0.6, cy + s);
      doc.moveTo(cx - s * 0.6, cy - s).lineTo(cx + s * 0.7, cy - s * 0.6).lineTo(cx - s * 0.6, cy - s * 0.2).closePath().stroke(); break;
    case 'tree':
      doc.moveTo(cx, cy - s).lineTo(cx - s * 0.62, cy).lineTo(cx + s * 0.62, cy).closePath().fill();
      doc.moveTo(cx, cy - s * 0.5).lineTo(cx - s * 0.85, cy + s * 0.55).lineTo(cx + s * 0.85, cy + s * 0.55).closePath().fill();
      doc.rect(cx - s * 0.13, cy + s * 0.45, s * 0.26, s * 0.5).fill(); break;
    case 'car':
      doc.roundedRect(cx - s, cy - s * 0.15, 2 * s, s * 0.62, s * 0.16).fill();
      doc.moveTo(cx - s * 0.5, cy - s * 0.12).lineTo(cx - s * 0.28, cy - s * 0.62).lineTo(cx + s * 0.4, cy - s * 0.62).lineTo(cx + s * 0.6, cy - s * 0.12).closePath().fill();
      doc.save().fillColor('#ffffff').circle(cx - s * 0.55, cy + s * 0.5, s * 0.24).fill().circle(cx + s * 0.55, cy + s * 0.5, s * 0.24).fill().restore();
      doc.circle(cx - s * 0.55, cy + s * 0.5, s * 0.13).fill(); doc.circle(cx + s * 0.55, cy + s * 0.5, s * 0.13).fill(); break;
    default:
      doc.circle(cx, cy, s * 0.6).stroke();
  }
  doc.restore();
}

function iconChip(doc, kind, x, y, d, bg = C.mint2, col = C.emer) {
  doc.save().roundedRect(x, y, d, d, d * 0.28).fill(bg).restore();
  icon(doc, kind, x + d / 2, y + d / 2, d * 0.26, col);
}

// =============================================================================
//  VALUE / DATA HELPERS
// =============================================================================
const V = (v, d = '—') => (v === undefined || v === null || v === '' ? d : v);
function num(v, d = 0) { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d : n; }
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
function inrShort(n) {
  n = Math.round(n);
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return '₹' + n.toLocaleString('en-IN');
}

// Government subsidy — explicit amount if given, else PM Surya Ghar for homes.
function subsidyFor(data, kwp, capex) {
  const s = String(data.subsidy ?? '').toLowerCase().trim();
  if (s === 'no' || s === 'none' || s === '0') return 0;
  const explicit = num(data.subsidy_amount ?? (/^\s*[₹0-9]/.test(String(data.subsidy)) ? data.subsidy : NaN), NaN);
  if (!isNaN(explicit) && explicit > 0) return Math.min(explicit, capex);
  const seg = String(data.project_type || '').toLowerCase();
  if (seg.includes('resid')) {                    // PM Surya Ghar (residential)
    if (kwp <= 2) return 30000 * kwp;
    if (kwp <= 3) return 60000 + 18000 * (kwp - 2);
    return 78000;
  }
  return 0;
}

// derive a full financial + environmental model from the questionnaire data
function model(data) {
  const inp = data.inputs || {};
  const kwp = num(data.capacity_kwp || data.system_kwp || data.capacity_kw || data.capacity, 0) || 100;
  const tariff = num(data.tariff ?? data.tariff_per_kwh ?? inp.tariff_per_kwh, 0) || 8.5;
  const yieldPerKwp = num(data.generation_per_kw_year ?? inp.generation_per_kw_year, 0) || 1500;  // kWh/kWp/yr
  const gen1 = kwp * yieldPerKwp;                  // year-1 units
  const costPerKwp = num(data.cost_per_kwp, 0) || 48000;
  // Prefer the real quotation figures when present, so proposal & quotation agree.
  const capexReal = num(data.total_amount ?? data.net_cost, 0);
  const capex = capexReal > 0 ? capexReal : kwp * costPerKwp;
  const subsidy = num(data.subsidy_amount, 0) || subsidyFor(data, kwp, capex);
  const netInvest = num(data.net_cost, 0) || Math.max(capex - subsidy, 0);
  const save1 = num(data.annual_savings, 0) || gen1 * tariff;
  // 25-yr cumulative savings & lifetime generation (3.5% escalation, 0.6%/yr degradation)
  let cum = 0, esc = 1, deg = 1, genLife = 0;
  const series = [];
  for (let yr = 1; yr <= 25; yr++) {
    cum += save1 * deg * esc; series.push(cum);
    genLife += gen1 * deg;
    esc *= 1.035; deg *= 0.994;
  }
  const payback = num(data.payback_years, 0) || netInvest / save1;
  const co2yr = gen1 * 0.82 / 1000;                // tonnes/yr (0.82 kg/kWh grid factor)
  const co2Life = genLife * 0.82 / 1000;
  return {
    kwp, tariff, gen1, genLife, costPerKwp, capex, subsidy, netInvest, save1, cum25: cum, series,
    monthlySave: save1 / 12, paybackYrs: payback, roiX: cum / (netInvest || 1),
    co2yr, co2Life, co2_25: co2Life,
    treesYr: Math.round(co2yr * 1000 / 22),        // trees absorbing that CO₂ each year (~22 kg/tree/yr)
    treesLife: Math.round(co2Life * 1000 / (22 * 25)), // trees each sequestering over a 25-yr life
    carsYr: Math.max(1, Math.round(co2yr / 4.6)),  // cars off the road for a year (4.6 t/car/yr)
    coalLife: genLife * 0.4 / 1000,                // tonnes of coal not burned (0.4 kg/kWh)
    homesPowered: Math.max(1, Math.round(gen1 / 1200)), // homes @ ~100 units/month
    dailyUnits: Math.round(gen1 / 365),
  };
}

// =============================================================================
//  PAGE 1 — COVER
// =============================================================================
function coverPage(doc, data) {
  const W = doc.page.width, H = doc.page.height;
  bleed(doc, C.emerD);
  // hero photo top ~60%
  const ph = H * 0.60;
  drawImg(doc, photo('hero-solar-farm'), 0, 0, W, ph);
  // emerald gradient veil over photo
  const g = doc.linearGradient(0, 0, 0, ph);
  g.stop(0, C.emerD, 0.15).stop(0.6, C.emerD, 0.35).stop(1, C.emerD, 1);
  doc.rect(0, 0, W, ph).fill(g);
  // thin gold rule top
  doc.rect(0, 0, W, 4).fill(C.gold);
  // logo on a soft white plate large enough to contain the square mark
  doc.save().roundedRect(M - 14, 28, 120, 120, 14).fillOpacity(0.94).fill('#ffffff').restore();
  logo(doc, M - 8, 34, 104, false);
  // credential pill — lighter panel for contrast on the photo
  const tc = 'EX-SERVICEMEN LED   ·   ISO 9001 · 14001 · 45001   ·   SINCE 2018';
  doc.font('uiSB').fontSize(8.5);
  const tcW = doc.widthOfString(tc, { characterSpacing: 1.4 }) + 34;
  doc.save().roundedRect(M, 150, tcW, 24, 12).fillOpacity(0.9).fill(C.emerD).restore();
  doc.save().roundedRect(M, 150, tcW, 24, 12).lineWidth(0.8).strokeColor(C.goldB).stroke().restore();
  doc.font('uiSB').fontSize(8.5).fillColor(C.goldB).text(tc, M + 17, 158, { characterSpacing: 1.4, lineBreak: false });

  // title block on the dark lower band — raised so the meta card never
  // collides with the headline, even with a 5-line address
  const seg = titleCaseCover(data.project_type);
  const grid = titleCaseCover(data.grid_type);
  const kicker = [seg, grid].filter(Boolean).join(' · ') || 'Solar Power';
  let y = ph - 54;
  eyebrow(doc, kicker + ' Proposal', M, y, C.goldB); y += 16;
  doc.font('H').fontSize(46).fillColor('#ffffff')
     .text('Solar Power Plant', M, y, { width: W - 2 * M });
  doc.font('H').fontSize(46).fillColor('#ffffff')
     .text('for a Brighter Nation', M, doc.y - 6, { width: W - 2 * M });
  y = doc.y + 10;
  triTick(doc, M, y, 90); y += 16;
  const m = model(data);
  const addr = addressLines(data);
  const cw = 262, cx = W - M - cw;
  doc.font('bodyI').fontSize(12.5).fillColor('#dcf3e7')
     .text('Engineered with military precision by Arrays Ingenieria.', M, y, { width: cx - M - 24 });

  // client / meta card bottom-right (height adjusts to the address)
  const rowsMeta = [];
  if (seg || grid) rowsMeta.push(['System', [seg, grid].filter(Boolean).join('  ·  ')]);
  rowsMeta.push(['Prepared For', data.client_name || data.customer_name || 'Valued Client']);
  if (addr.length) rowsMeta.push(['Address', addr]);           // array => multi-line
  rowsMeta.push(['Proposed Capacity', m.kwp ? m.kwp + ' kWp' : '—']);
  rowsMeta.push(['Reference', V(data.quote_number, 'PROPOSAL')]);
  rowsMeta.push(['Date', new Date(data.issue_date || data.date || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })]);
  // measure height
  let mh = 12;
  const rowH = (r) => (Array.isArray(r[1]) ? 12 + r[1].length * 10 : 26);
  rowsMeta.forEach((r) => { mh += rowH(r); });
  const cy = H - 30 - mh - 16;
  panel(doc, cx, cy, cw, mh, '#ffffff', 10);
  doc.rect(cx, cy, 4, mh).fill(C.gold);
  let yy = cy + 14;
  rowsMeta.forEach((r) => {
    doc.font('ui').fontSize(6.8).fillColor(C.mute).text(String(r[0]).toUpperCase(), cx + 18, yy, { characterSpacing: 1.3 });
    if (Array.isArray(r[1])) {
      doc.font('uiSB').fontSize(8.5).fillColor(C.ink);
      r[1].forEach((ln, i) => doc.text(ln, cx + 18, yy + 9 + i * 10, { width: cw - 34 }));
    } else {
      doc.font('uiSB').fontSize(10).fillColor(C.ink).text(V(r[1]), cx + 18, yy + 9, { width: cw - 34 });
    }
    yy += rowH(r);
  });
}

// Title-case a segment/grid value for the cover (handles hyphens).
function titleCaseCover(s) {
  if (!s) return '';
  return String(s).replace(/[-_]/g, '-').replace(/\b\w/g, (m) => m.toUpperCase());
}

// Build up to 5 address lines from whatever the questionnaire provided.
function addressLines(data) {
  const raw = data.client_address || data.address || data.site_address || '';
  let lines = [];
  if (raw) lines = String(raw).split(/\n|,\s*/).map((s) => s.trim()).filter(Boolean);
  else {
    lines = [data.site_name, data.location, [data.city, data.state].filter(Boolean).join(', '), data.pincode]
      .filter(Boolean).map(String);
  }
  return lines.slice(0, 5);
}

// =============================================================================
//  PAGE 2 — CONTENTS
// =============================================================================
function tocPage(doc, extras = []) {
  chrome(doc, 'Contents');
  heading(doc, 'Inside This Document', 'Contents');
  const base = [
    ['Confidentiality & Conditions', 'The terms under which this document is shared'],
    ['From the Leadership', 'A personal message from our veteran leadership'],
    ['About Arrays Ingenieria', 'Where engineering meets resilience'],
    ['The Veteran Advantage', 'Why India’s leaders choose us'],
    ['End-to-End Capabilities', 'Our full-spectrum solar EPC services'],
    ['Industries We Serve', 'Tailored solar for every sector'],
    ['Trusted by India’s Leaders', 'Clients & landmark projects'],
    ['Track Record', 'A portfolio delivered pan-India'],
    ['Client Voices', 'In the words of those we’ve served'],
    ['Recognition & Media', 'Honoured from the nation’s highest offices'],
    ['Understanding Your Project', 'Your requirement, engineered'],
    ['Your System Design', 'On-grid, off-grid or hybrid — built for you'],
    ['How Solar Works', 'From sunlight to savings'],
    ['Net Metering Explained', 'On-grid, off-grid & hybrid'],
    ['Execution Methodology', 'Our disciplined delivery process'],
    ['Your Savings & Return', 'Investment, payback & 25-year savings'],
    ['Environmental Impact', 'CO₂ avoided & a greener nation'],
    ['Quality, Safety & Warranty', 'Triple-ISO systems, Tier-1 hardware'],
    // Technical Specifications & FAQ are appended via `extras` (they close the pack)
  ];
  // append the extra documents actually included in this download
  const items = base.concat(extras.map((e) => [e.label, e.sub]))
    .map((it, i) => [String(i + 1).padStart(2, '0'), it[0], it[1]]);
  const colW = (doc.page.width - 2 * M - 24) / 2;
  const startY = doc.y + 4;
  const half = Math.ceil(items.length / 2);
  const rowH = Math.min(60, Math.floor((770 - startY) / half));
  items.forEach((it, i) => {
    const col = i < half ? 0 : 1;
    const row = col === 0 ? i : i - half;
    const x = M + col * (colW + 24);
    const y = startY + row * rowH;
    doc.font('uiB').fontSize(20).fillColor(C.mint2).text(it[0], x, y - 1, { lineBreak: false });
    doc.font('uiSB').fontSize(10.5).fillColor(C.ink).text(it[1], x + 40, y, { width: colW - 40 });
    doc.font('body').fontSize(9).fillColor(C.mute).text(it[2], x + 40, y + 15, { width: colW - 40 });
    doc.moveTo(x + 40, y + rowH - 20).lineTo(x + colW, y + rowH - 20).lineWidth(0.6).strokeColor(C.line).stroke();
  });
}

// =============================================================================
//  PAGE 3 — CONFIDENTIALITY
// =============================================================================
function confidentialityPage(doc) {
  chrome(doc, 'Confidential');
  heading(doc, 'Section 01', 'Confidentiality & Conditions');
  const w = doc.page.width - 2 * M;
  const paras = [
    'This techno-commercial proposal (the "Proposal") for the design, supply, installation and commissioning of a solar photovoltaic power system is submitted by Arrays Ingenieria Pvt. Ltd. ("Ingenieria") with the intent of executing a definitive and legally binding agreement following an award of business.',
    'This Proposal constitutes confidential and proprietary information of Ingenieria. The recipient may use the information contained herein solely for the purpose of evaluating this Proposal. This Proposal and all supporting documentation shall remain the property of Ingenieria and must be returned upon request.',
    'This Proposal is based upon the set of requirements provided by the client and certain reasonable engineering assumptions. Should the requirements change, or should any stated assumption prove inaccurate, this Proposal — including pricing, generation estimates and timelines — may be revised accordingly.',
    'Generation and savings figures are good-faith engineering estimates based on standard irradiance data, a 1,500 kWh/kWp annual yield, prevailing tariffs and typical system performance. Actual results vary with site conditions, weather, shading, grid availability, tariff revisions and DISCOM policy. Implementation is subject to applicable statutory, DISCOM and regulatory norms in force on the date of execution.',
    'Unless expressly stated otherwise, this Proposal is valid for 30 days from the date of issue.',
  ];
  let y = doc.y + 2;
  paras.forEach((p) => {
    doc.circle(M + 4, y + 7, 3).fill(C.gold);
    y = para(doc, p, M + 20, y, w - 20, { size: 10.4, lineGap: 3.6 }) + 12;
  });
  // signature-of-good-faith strip
  const by = 672, bh = 82;
  panel(doc, M, by, w, bh, C.mint, 9);
  doc.rect(M, by, 4, bh).fill(C.emer);
  doc.font('uiSB').fontSize(8.5).fillColor(C.emer).text('PREPARED IN GOOD FAITH', M + 22, by + 16, { characterSpacing: 1.4 });
  doc.font('body').fontSize(10).fillColor(C.body)
     .text('Every figure and commitment in this document reflects our military-grade standard of accuracy and accountability. We would be privileged to walk you through any part of it in person.',
           M + 22, by + 32, { width: w - 44 });
  doc.font('bodyI').fontSize(11).fillColor(C.ink)
     .text('— Arrays Ingenieria Pvt. Ltd.', M + 22, by + bh - 20, { width: w - 44, align: 'right' });
}

// =============================================================================
//  PAGE 4 — LEADERSHIP LETTER
// =============================================================================
function leadershipPage(doc, data = {}) {
  chrome(doc, 'Leadership');
  const W = doc.page.width, w = W - 2 * M;
  // chancery flourish heading (the single script use)
  eyebrow(doc, 'Section 02', M, doc.y, C.gold);
  doc.font('script').fontSize(44).fillColor(C.gold).text('From the Leadership', M, doc.y + 10);
  triTick(doc, M, doc.y + 6, 74);
  let y = doc.y + 22;

  // president photo + identity card (right column)
  const colX = W - M - 176, colW = 176;
  drawImg(doc, press('ceo-president'), colX, y, colW, 208, 8);
  doc.font('bodyI').fontSize(8).fillColor(C.mute)
     .text('Honoured by the Hon’ble President of India', colX, y + 216, { width: colW, align: 'center' });
  // identity card — name AND medals in gold
  const idY = y + 236;
  panel(doc, colX, idY, colW, 92, C.mint, 9, C.line);
  doc.rect(colX, idY, colW, 3).fill(C.gold);
  doc.font('HB').fontSize(15.5).fillColor(C.gold).text('Lt. Gen. A.R. Prasad', colX + 14, idY + 14, { width: colW - 28 });
  doc.font('HB').fontSize(15.5).fillColor(C.gold).text('(Retd)', colX + 14, doc.y - 2, { width: colW - 28 });
  doc.font('uiSB').fontSize(8).fillColor(C.goldB).text('AVSM · VSM · ADC · Ph.D', colX + 14, idY + 56, { width: colW - 28, characterSpacing: 0.4 });
  doc.font('ui').fontSize(7.8).fillColor(C.mute).text('Chief Executive Officer', colX + 14, idY + 68, { width: colW - 28 });

  // letter body (left) — personalised opening
  const bw = colX - M - 26;
  const name = data.client_name || data.customer_name || data.client_full_name;
  const kwp = num(data.capacity_kw || data.capacity_kwp || data.capacity, 0);
  const seg = titleCaseCover(data.project_type);
  const grid = titleCaseCover(data.grid_type);
  const loc = data.location || data.site_name || data.city;
  doc.font('bodyI').fontSize(13).fillColor(C.emer).text(name ? `Dear ${name},` : 'Respected Client,', M, y);
  y = doc.y + 8;
  // personalised first paragraph built from the questionnaire data
  const sysWords = [grid, seg].filter(Boolean).join(' ');
  let p1 = `Thank you for the opportunity to earn your trust. It is a privilege to place our engineering and our discipline at the service of ${name || 'your organisation'}`;
  if (kwp) p1 += `, and to design the ${kwp} kWp ${sysWords || 'grid-connected solar'} power plant`;
  else p1 += ', and to design the solar power plant';
  if (loc) p1 += ` proposed at ${loc}`;
  p1 += '. For us, every project of this kind is not merely a contract; it is a national mission carried forward by soldiers who have spent their lives in service of this country.';
  const letter = [
    p1,
    'We founded this company in 2018 on a simple conviction: that the discipline, precision and accountability of the armed forces are exactly what India’s clean-energy transition demands. Every plant we build, from a rooftop on a factory shed to utility-scale solar parks, is delivered with that same zero-compromise standard.',
    'This document is our commitment to you in writing. Within it you will find not only competitive economics, but the engineering rigour, the quality systems and the long-term partnership that have earned us the trust of Tata Power, Tata Steel, Tata Motors, Bharat Petroleum and many more.',
    'We would be honoured to power your future.',
  ];
  letter.forEach((p) => { y = para(doc, p, M, y, bw, { size: 11, lineGap: 3.9 }) + 8; });
  doc.font('script').fontSize(26).fillColor(C.gold).text('A.R. Prasad', M, y + 2);
  doc.font('uiSB').fontSize(8.5).fillColor(C.gold).text('LT. GEN. A.R. PRASAD (RETD) · AVSM · VSM · ADC · Ph.D', M, doc.y + 3, { characterSpacing: 0.4 });
  doc.font('ui').fontSize(8).fillColor(C.mute).text('Chief Executive Officer — Arrays Ingenieria Pvt. Ltd.', M, doc.y + 1);

  // emerald pull-quote band, anchored below the taller of the two columns
  const bandY = Math.max(y + 40, idY + 92 + 24, 700), bandH = 64;
  panel(doc, M, bandY, w, bandH, C.emerD, 9);
  doc.rect(M, bandY, 4, bandH).fill(C.gold);
  doc.font('H').fontSize(46).fillColor(C.gold).text('“', M + 16, bandY + 2);
  doc.font('bodyI').fontSize(13.5).fillColor('#ffffff')
     .text('Where engineering meets resilience, and every megawatt is a mission accomplished.',
           M + 52, bandY + 22, { width: w - 80 });
}

// =============================================================================
//  PAGE 5 — ABOUT
// =============================================================================
function aboutPage(doc) {
  chrome(doc, 'About Us');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 03 · Who We Are', 'Where Engineering Meets Resilience');
  let y = doc.y;
  // intro + photo
  const pw = 210;
  drawImg(doc, photo('proj-rooftop-pano'), W - M - pw, y, pw, 168, 8);
  const bw = W - M - pw - 26 - M;
  y = para(doc,
    '"Ingeniería" means engineering in Spanish — a fitting symbol of our commitment to precision and discipline. Founded in 2018 and run entirely by former military personnel, Arrays Ingenieria designs and delivers ground-mount and rooftop solar power plants across India, along with pile foundations, civil works, grid commissioning and long-term O&M.',
    M, y, bw, { size: 10.8, lineGap: 3.8 });
  y = para(doc,
    'From a single rooftop to utility-scale solar parks, we approach every project with the same focus on excellence, safety and sustainability — earning the trust of India’s biggest industrial names.',
    M, y + 8, bw, { size: 10.8, lineGap: 3.8 });

  y = Math.max(y, 175 + 168) + 24;

  // mission / vision cards
  const cw = (w - 18) / 2;
  const cardH = 132;
  const mv = [
    ['sun', 'Our Mission', 'To accelerate India’s transition to clean, reliable and affordable energy — delivering projects of uncompromising quality that empower communities and protect the environment for generations.'],
    ['flag', 'Our Vision', 'To be India’s most trusted, veteran-led renewable-energy partner — recognised nationwide for engineering excellence, safety and integrity, and for the enduring impact of every megawatt online.'],
  ];
  mv.forEach((c, i) => {
    const x = M + i * (cw + 18);
    panel(doc, x, y, cw, cardH, C.mint, 9, C.line);
    iconChip(doc, c[0], x + 16, y + 18, 32, C.mint2, C.emer);
    doc.font('H').fontSize(18).fillColor(C.ink).text(c[1], x + 58, y + 22);
    doc.font('body').fontSize(9.8).fillColor(C.body).text(c[2], x + 16, y + 56, { width: cw - 32, lineGap: 3 });
  });
  y += cardH + 22;

  // values row
  eyebrow(doc, 'Built on Military Values', M, y, C.gold); y += 18;
  const vals = [['shield', 'Discipline', 'Decisive, accountable execution'],
                ['medal', 'Integrity', 'Transparent, dependable delivery'],
                ['bolt', 'Quality & Safety', 'Triple-ISO, zero-compromise'],
                ['leaf', 'Sustainability', 'A cleaner, greener future']];
  const vw = (w - 3 * 14) / 4;
  vals.forEach((v, i) => {
    const x = M + i * (vw + 14);
    panel(doc, x, y, vw, 120, C.paper, 9, C.line);
    iconChip(doc, v[0], x + vw / 2 - 19, y + 20, 38, C.mint2, C.emer);
    doc.font('uiSB').fontSize(11).fillColor(C.ink).text(v[1], x + 8, y + 70, { width: vw - 16, align: 'center' });
    doc.font('body').fontSize(8.8).fillColor(C.mute).text(v[2], x + 10, y + 88, { width: vw - 20, align: 'center', lineGap: 1.5 });
  });
  y += 120 + 24;

  // stat band (anchored near bottom)
  statBand(doc, M, y, w, [['2018', 'Established'], ['50 MW+', 'Engineered'], ['40+', 'Projects'], ['100%', 'Ex-Servicemen Led'], ['3×', 'ISO Certified']]);
}

function statBand(doc, x, y, w, stats) {
  const h = 66;
  panel(doc, x, y, w, h, C.emer, 9);
  const cw = w / stats.length;
  stats.forEach((s, i) => {
    const cx = x + i * cw;
    if (i) doc.moveTo(cx, y + 14).lineTo(cx, y + h - 14).lineWidth(0.6).strokeColor('#2f7a60').stroke();
    doc.font('uiB').fontSize(20).fillColor('#ffffff').text(s[0], cx, y + 15, { width: cw, align: 'center' });
    doc.font('ui').fontSize(7.6).fillColor('#bfe7d6').text(String(s[1]).toUpperCase(), cx, y + 44, { width: cw, align: 'center', characterSpacing: 1 });
  });
}

// =============================================================================
//  PAGE 6 — VETERAN ADVANTAGE
// =============================================================================
function whyPage(doc) {
  chrome(doc, 'The Veteran Advantage');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 04', 'The Veteran Advantage');
  para(doc, 'A company built on military values — discipline, precision and an unwavering commitment to mission success. This is why India’s largest industrial houses choose Ingenieria.', M, doc.y, w, { size: 10.6 });
  let y = doc.y + 14;

  const cards = [
    ['medal', '100% Veteran-Led', 'Founded and operated entirely by decorated former military officers — strategic planning, decisive action, zero-compromise execution on every site.'],
    ['shield', 'Triple-ISO Certified', 'ISO 9001, 14001 & 45001 for quality, environmental and occupational-safety management — audited systems, not slogans.'],
    ['grid', 'Proven Scale', 'From 10 kWp rooftops to utility-scale solar parks — any size, any terrain, delivered to specification.'],
    ['flag', 'Pan-India Reach', 'Dedicated crews mobilised across the length and breadth of the nation, from Assam’s tea estates to Karnataka’s solar parks.'],
    ['tools', 'In-House Engineering', 'Feasibility, geo-technical survey, design, piling, civil and electrical — a single accountable team, start to finish.'],
    ['clock', 'On-Time, Every Time', 'Military logistics translated into renewable delivery: 100% on-time commissioning across our portfolio.'],
  ];
  const cw = (w - 2 * 16) / 3, ch = 158;
  const y0 = y;
  cards.forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + 16), yy = y0 + row * (ch + 16);
    panel(doc, x, yy, cw, ch, C.paper, 9, C.line);
    doc.rect(x, yy, cw, 3).fill(i % 2 ? C.emer : C.gold);
    iconChip(doc, c[0], x + 18, yy + 20, 36, C.mint2, C.emer);
    doc.font('H').fontSize(15.5).fillColor(C.ink).text(c[1], x + 18, yy + 62, { width: cw - 36, height: 20 });
    doc.font('body').fontSize(8.9).fillColor(C.body).text(c[2], x + 18, yy + 84, { width: cw - 36, lineGap: 2.2 });
  });
  y = y0 + 2 * (ch + 16) + 12;

  // performance metrics strip — flawless track record
  eyebrow(doc, 'Performance You Can Measure', M, y, C.gold); y += 18;
  statBand(doc, M, y, w, [['100%', 'On-Time'], ['100%', 'Safety Compliance'], ['100%', 'Quality Assurance'], ['100%', 'Statutory Compliance'], ['100%', 'Client Satisfaction']]);
  y += 66 + 8;
  doc.font('bodyI').fontSize(7.8).fillColor(C.mute)
     .text('Figures reflect our delivered track record under normal operating conditions. Outcomes on any given project may vary with weather, site conditions, grid availability and other force-majeure factors beyond our reasonable control.', M, y, { width: w, lineGap: 1.5 });
}

// =============================================================================
//  PAGE 7 — SERVICES
// =============================================================================
function servicesPage(doc) {
  chrome(doc, 'Capabilities');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 05 · What We Do', 'End-to-End Solar EPC');
  para(doc, 'A full-spectrum renewable-energy contractor. We carry every project from feasibility and geo-technical survey — through detailed engineering, Tier-1 procurement, piling, civil and electrical execution — right up to grid synchronisation, testing and long-term O&M.', M, doc.y, w, { size: 10.4 });
  let y = doc.y + 14;
  const svc = [
    ['grid', 'Ground-Mount Solar', 'Utility & industrial-scale power plants engineered for maximum yield across any terrain.'],
    ['home', 'Rooftop Solar', 'On-grid RCC & metal-shed systems that turn unused roof space into a bill-slashing asset.'],
    ['tools', 'EPC Turnkey', 'Single-point design, procurement & construction — one accountable veteran-led team.'],
    ['bolt', 'Piling & Foundations', 'Hydraulic pile-driving and precise foundations built to survive decades of load.'],
    ['shield', 'Civil & Fencing', 'Boundary walls, chain-link fencing, cable trenches and site infrastructure.'],
    ['clock', 'O&M & Support', 'Preventive & corrective maintenance, module cleaning, monitoring and rapid fault resolution.'],
  ];
  const cw = (w - 2 * 16) / 3, ch = 150;
  const y0 = y;
  svc.forEach((s, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + 16), yy = y0 + row * (ch + 16);
    panel(doc, x, yy, cw, ch, C.mint, 9, C.line);
    iconChip(doc, s[0], x + 18, yy + 20, 38, C.paper, C.emer);
    doc.font('H').fontSize(16.5).fillColor(C.ink).text(s[1], x + 18, yy + 66, { width: cw - 36, height: 20 });
    doc.font('body').fontSize(8.9).fillColor(C.body).text(s[2], x + 18, yy + 88, { width: cw - 36, lineGap: 2.2 });
  });
  y = y0 + 2 * (ch + 16) + 10;
  // photo strip with captions
  const iw = (w - 2 * 12) / 3;
  const caps = [['proj-seci', 'Piling Works'], ['proj-dcm-hisar', 'Ground-Mount Solar · EPC'], ['proj-earthing', 'Earthing & Safety']];
  caps.forEach((p, i) => {
    const x = M + i * (iw + 12);
    drawImg(doc, photo(p[0]), x, y, iw, 132, 8);
    doc.font('uiSB').fontSize(8.5).fillColor(C.emer).text(p[1].toUpperCase(), x, y + 138, { width: iw, align: 'center', characterSpacing: 0.6 });
  });
}

// =============================================================================
//  PAGE 8 — INDUSTRIES
// =============================================================================
function industriesPage(doc) {
  chrome(doc, 'Industries');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 06 · Who We Power', 'Industries We Serve');
  para(doc, 'Decades of military discipline applied to the renewable-energy needs of India’s homes, businesses and institutions — six sectors, one trusted partner.', M, doc.y, w, { size: 10.6 });
  let y = doc.y + 14;
  const inds = [
    ['home', 'Residential', 'Rooftop solar for homes & housing societies — lower bills and energy independence, with PM Surya Ghar subsidy support.'],
    ['factory', 'Commercial', 'Offices, malls, hotels & fuel stations — slash operating costs and carbon with reliable clean power.'],
    ['bolt', 'Industrial', 'Factories, smelters & manufacturing units — large rooftop and ground-mount systems built at scale.'],
    ['shield', 'Institutional', 'Schools, hospitals & campuses — compliant, dependable solar that funds itself over time.'],
    ['leaf', 'Agriculture & Tea', 'Ground-mount plants for estates & agri-loads — proven across Assam’s tea gardens.'],
    ['flag', 'Government & PSU', 'Utility-scale & PSU projects (Tata Power EPC and government tenders) executed exactly to specification.'],
  ];
  const cw = (w - 16) / 2, ch = 104, y0 = y;
  inds.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (cw + 16), yy = y0 + row * (ch + 16);
    panel(doc, x, yy, cw, ch, C.paper, 9, C.line);
    iconChip(doc, c[0], x + 18, yy + 20, 38, C.mint2, C.emer);
    doc.font('H').fontSize(17).fillColor(C.ink).text(c[1], x + 66, yy + 22);
    doc.font('body').fontSize(9.2).fillColor(C.body).text(c[2], x + 66, yy + 44, { width: cw - 84, lineGap: 2.6 });
  });
  y = y0 + 3 * (ch + 16) + 10;
  panel(doc, M, y, w, 58, C.cream, 9);
  doc.rect(M, y, 4, 58).fill(C.gold);
  doc.font('H').fontSize(28).fillColor(C.gold).text('“', M + 18, y + 8, { lineBreak: false });
  doc.font('body').fontSize(10.4).fillColor(C.body)
     .text('Residential clients benefit from the PM Surya Ghar subsidy; commercial and industrial clients gain from accelerated depreciation and rapid 3–5 year paybacks — solar that funds itself.', M + 46, y + 16, { width: w - 68, lineGap: 3 });
}

// =============================================================================
//  PAGE 9 — TRUSTED BY (client wall + milestone)
// =============================================================================
function clientsPage(doc, data = {}) {
  chrome(doc, 'Our Clients');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 07', 'Trusted by India’s Leaders');
  para(doc, 'From utility giants to tea estates, India’s most demanding industrial houses rely on Ingenieria for solar delivered to specification.', M, doc.y, w, { size: 10.6 });
  let y = doc.y + 14;
  const clients = (Array.isArray(data.clients) && data.clients.length ? data.clients.map((c) => (Array.isArray(c) ? c : [c.name || '', c.sub || ''])) : [
    ['Tata Power', 'Solar EPC'], ['Tata Steel', 'Noamundi'], ['Tata Motors', 'Jamshedpur'],
    ['Bharat Petroleum', 'RCC Rooftop'], ['Super Smelters', 'Asansol'], ['DCM', 'Hisar'],
    ['Jay Shree Tea', 'Birla · Assam'], ['Balaji Action', 'Sitarganj'], ['APPL', 'Assam Tea'],
  ]).filter((c) => c[0]).slice(0, 9);
  const cols = 3, gap = 16, tw = (w - (cols - 1) * gap) / cols, th = 78, y0 = y;
  clients.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (tw + gap), yy = y0 + row * (th + gap);
    panel(doc, x, yy, tw, th, C.paper, 8, C.line);
    doc.rect(x, yy, tw, 3).fill(C.gold);
    let fs = 14; doc.font('uiB');
    while (fs > 9 && doc.fontSize(fs).widthOfString(String(c[0]), { characterSpacing: 0.4 }) > tw - 18) fs -= 0.5;
    doc.font('uiB').fontSize(fs).fillColor(C.emer).text(String(c[0]), x, yy + 26, { width: tw, align: 'center', characterSpacing: 0.4 });
    doc.font('ui').fontSize(7.5).fillColor(C.mute).text(String(c[1]).toUpperCase(), x, yy + 48, { width: tw, align: 'center', characterSpacing: 1.2 });
  });
  y = y0 + 3 * (th + gap) + 12;

  // milestone project: photo + quote
  const ph = 176;
  const iw = w * 0.46;
  drawImg(doc, photo('proj-supersmelters'), M, y, iw, ph, 9);
  const tx = M + iw + 24, twq = w - iw - 24;
  eyebrow(doc, 'Landmark Project', tx, y + 4, C.gold);
  doc.font('H').fontSize(21).fillColor(C.ink).text('Super Smelters — 1,980 kWp', tx, y + 18);
  doc.font('ui').fontSize(8).fillColor(C.mute).text('ASANSOL, W.B.  ·  WITH TATA POWER SOLAR', tx, y + 46, { characterSpacing: 0.6 });
  doc.font('bodyI').fontSize(12).fillColor(C.body)
     .text('“Technical expertise, professionalism and timely delivery — with thorough inspections and meticulous attention to detail throughout.”',
           tx, y + 62, { width: twq, lineGap: 3.2 });
  doc.font('uiSB').fontSize(9).fillColor(C.emer).text('Inaugurated & featured in Dainik Bhaskar', tx, y + ph - 14);
  closingBand(doc, 'From utility-scale parks to tea estates — India’s most trusted names return to Ingenieria, project after project.', { y: 720, icon: 'medal' });
}

// =============================================================================
//  PAGE 10 — TRACK RECORD (table)
// =============================================================================
function trackRecordPage(doc) {
  chrome(doc, 'Track Record');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 08 · Portfolio', 'A Track Record, Delivered');
  let y = doc.y + 2;
  const rows = [
    ['YIAPL', 'Civil & Tensile Works', 'Uttar Pradesh', '14.36 MW'],
    ['DCM', 'Ground-Mount', 'Hisar, Haryana', '10 MW'],
    ['Tata Motors', 'Piling & Civil', 'Jamshedpur, Jharkhand', '5.5 MW'],
    ['Super Smelters', 'Industrial Rooftop', 'Asansol, West Bengal', '1,980 kWp'],
    ['On-Grid Rooftop', 'Rooftop', 'Assam', '1,711 kWp'],
    ['Grid-Connected', 'Ground-Mount', 'Pan-India', '1,035 kWp'],
    ['Jayshree Tea', 'Ground-Mount · Tata Power EPC', 'Sonari, Assam', '1 MW'],
    ['Towkok Tea', 'Ground-Mount', 'Assam', '535 kWp'],
    ['Manjushree Tea', 'Ground-Mount', 'Assam', '500 kWp'],
  ];
  const cols = [M, M + 128, M + 300, W - M - 76];
  panel(doc, M, y, w, 26, C.emer, 5);
  doc.font('uiSB').fontSize(8).fillColor('#ffffff');
  doc.text('CLIENT', cols[0] + 12, y + 9); doc.text('SCOPE', cols[1], y + 9);
  doc.text('LOCATION', cols[2], y + 9); doc.text('CAPACITY', cols[3], y + 9, { width: 66, align: 'right' });
  y += 26;
  rows.forEach((r, i) => {
    const rh = 33;
    if (i % 2) doc.save().rect(M, y, w, rh).fill(C.mint).restore();
    doc.font('uiSB').fontSize(9.8).fillColor(C.ink).text(r[0], cols[0] + 12, y + 11, { width: 120 });
    doc.font('body').fontSize(9.8).fillColor(C.body).text(r[1], cols[1], y + 11, { width: 168 });
    doc.font('body').fontSize(9.8).fillColor(C.mute).text(r[2], cols[2], y + 11, { width: 150 });
    doc.font('uiB').fontSize(9.8).fillColor(C.emer).text(r[3], cols[3], y + 11, { width: 66, align: 'right' });
    doc.moveTo(M, y + rh).lineTo(W - M, y + rh).lineWidth(0.5).strokeColor(C.line).stroke();
    y += rh;
  });
  y += 14;
  // photo strip with captions
  const iw = (w - 3 * 12) / 4;
  const ps = [['proj-dcm-hisar', 'DCM · 10 MW'], ['proj-jayshree', 'Jayshree · 1 MW'], ['proj-manjushree', 'Manjushree · 500 kWp'], ['proj-yiapl', 'YIAPL · Civil Works']];
  ps.forEach((p, i) => {
    const x = M + i * (iw + 12);
    drawImg(doc, photo(p[0]), x, y, iw, 104, 8);
    doc.font('uiSB').fontSize(7.6).fillColor(C.emer).text(p[1].toUpperCase(), x, y + 110, { width: iw, align: 'center', characterSpacing: 0.4 });
  });
}

// =============================================================================
//  PAGE 11 — TESTIMONIALS
// =============================================================================
function testimonialsPage(doc) {
  chrome(doc, 'Client Voices');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 09 · In Their Words', 'What Our Clients Say');
  let y = doc.y + 4;
  const t = [
    ['Exceptional quality, strict adherence to safety and a well-maintained work environment. Commissioned to our full satisfaction.', 'Jay Shree Tea (Birla)', 'Assam · Ground-Mount', C.emer],
    ['Technical expertise, professionalism and timely delivery — with thorough inspections and meticulous attention to detail.', 'Super Smelters Ltd.', 'Asansol · 1,980 kWp', C.sky],
    ['Statutory compliance, cleanliness and flawless workmanship that exceeded expectations. A reliable partner we rely on.', 'Tata Motors', 'Jamshedpur · 5.5 MW', C.navy],
    ['Their professionalism in installation and commissioning was praiseworthy — a competent, dependable partner start to finish.', 'Bharat Petroleum', 'Gurugram · RCC Rooftop', C.grn],
    ['Pile-foundation works were executed to exacting standards and on schedule, even under demanding ground conditions.', 'Tata Power Solar (EPC)', 'Ground-Mount · EPC', C.sky],
    ['From design to grid synchronisation, every milestone was met with discipline and transparency. The veteran-led team inspires confidence.', 'DCM', 'Hisar · 10 MW', C.gold],
  ];
  const cw = (w - 16) / 2, ch = 166, y0 = y;
  t.forEach((q, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (cw + 16), yy = y0 + row * (ch + 16);
    panel(doc, x, yy, cw, ch, C.paper, 9, C.line);
    doc.rect(x, yy, 4, ch).fill(q[3]);
    doc.font('H').fontSize(40).fillColor(q[3]).text('“', x + 18, yy + 8);
    doc.font('bodyI').fontSize(11.5).fillColor(C.body).text(q[0], x + 20, yy + 48, { width: cw - 40, lineGap: 3.6 });
    doc.moveTo(x + 20, yy + ch - 40).lineTo(x + cw - 20, yy + ch - 40).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.font('uiSB').fontSize(10).fillColor(C.ink).text(q[1], x + 20, yy + ch - 32);
    doc.font('ui').fontSize(8).fillColor(C.mute).text(String(q[2]).toUpperCase(), x + 20, yy + ch - 18, { characterSpacing: 0.8 });
  });
}

// =============================================================================
//  PAGE 12 — RECOGNITION
// =============================================================================
function recognitionPage(doc) {
  chrome(doc, 'Recognition');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 10 · Honoured by the Nation', 'Recognition & Media');
  para(doc, 'From the nation’s highest offices to leading news channels, our work in renewable energy continues to earn trust and acclaim across India.', M, doc.y, w, { size: 10.6 });
  let y = doc.y + 14;
  const items = [
    [press('ceo-president'), 'President of India', 'Honoured for distinguished service'],
    [press('ceo-modi'), 'PM Shri Narendra Modi', 'A shared vision for a renewable India'],
    [press('ceo-rajnath'), 'Raksha Mantri Rajnath Singh', 'Honouring our ex-servicemen'],
    [press('ceo-defcom'), 'Keynote at DEFCOM India', 'Addressing the defence community'],
  ];
  // landscape cells (shorter than the source) so wide two-person shots crop
  // top/bottom instead of cutting people off the sides
  const cw = (w - 3 * 14) / 4, ih = 90, y0 = y;
  items.forEach((it, i) => {
    const x = M + i * (cw + 14);
    drawImg(doc, it[0], x, y0, cw, ih, 8);
    doc.font('uiSB').fontSize(8.6).fillColor(C.ink).text(it[1], x, y0 + ih + 8, { width: cw, height: 24 });
    doc.font('body').fontSize(8).fillColor(C.mute).text(it[2], x, y0 + ih + 32, { width: cw, lineGap: 1.5 });
  });
  y = y0 + ih + 60;

  // TV / national-media band
  panel(doc, M, y, w, 74, C.mint, 9, C.line);
  eyebrow(doc, 'As Seen on National Media', M + 18, y + 14, C.gold);
  doc.font('body').fontSize(9.4).fillColor(C.body)
     .text('Lt. Gen. A.R. Prasad (Retd) is a sought-after voice on national television — bringing strategic insight to the nation’s biggest stories.', M + 18, y + 28, { width: w - 250 });
  const chans = ['India Today', 'Aaj Tak', 'India TV'];
  chans.forEach((c, i) => {
    const cx = M + w - 216 + i * 70;
    panel(doc, cx, y + 24, 62, 32, C.paper, 6, C.line);
    doc.font('uiB').fontSize(8.5).fillColor(C.emer).text(c, cx, y + 35, { width: 62, align: 'center' });
  });
  y += 74 + 18;

  // In the Newspapers
  eyebrow(doc, 'In the Newspapers', M, y, C.gold); y += 18;
  const clips = [
    ['news-bhaskar-tcpl', 'Dainik Bhaskar', '319 kWp rooftop solar for TCPL Greenery Agro (Tata Consumer), Vaishali.'],
    ['news-supersmelters-inaug', 'Dainik Bhaskar', '1,980 kWp solar plant inaugurated at Super Smelters, with Tata Power Solar.'],
    ['news-supersmelters-rooftop', 'Dainik Jagran', '1,980 kWp rooftop solar power plant commissioned at Super Smelters, Asansol.'],
  ];
  const nw = (w - 2 * 14) / 3;
  clips.forEach((c, i) => {
    const x = M + i * (nw + 14);
    panel(doc, x, y, nw, 176, C.paper, 9, C.line);
    drawImg(doc, news(c[0]), x + 8, y + 8, nw - 16, 100, 5);
    doc.font('uiSB').fontSize(8).fillColor(C.gold).text(c[1].toUpperCase(), x + 12, y + 118, { characterSpacing: 0.8 });
    doc.font('body').fontSize(8.8).fillColor(C.body).text(c[2], x + 12, y + 131, { width: nw - 24, lineGap: 2 });
  });
}

// =============================================================================
//  PAGE 13 — UNDERSTANDING YOUR PROJECT (customised)
// =============================================================================
function understandPage(doc, data) {
  chrome(doc, 'Your Project');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 11 · Tailored to You', 'Understanding Your Project');
  const m = model(data);
  let y = doc.y + 2;

  // snapshot table (2 cols of key/value)
  const tc = (v) => (v ? titleCaseCover(v) : v);
  const rows = [
    ['Client', data.client_name || data.customer_name],
    ['Site / Location', data.location || data.site || data.city],
    ['State / DISCOM', [V(data.state, ''), V(data.discom, '')].filter(Boolean).join(' · ') || null],
    ['Segment', tc(data.project_type)],
    ['Installation', tc(data.install_type)],
    ['Grid Type', tc(data.grid_type)],
    ['Proposed Capacity', m.kwp ? m.kwp + ' kWp' : null],
    ['Est. Monthly Bill', data.monthly_bill ? inr(num(data.monthly_bill)) : null],
    ['Structure', tc(data.structure_type)],
    ['Net Metering', tc(data.net_metering)],
    ['Battery Backup', tc(data.battery)],
  ].filter((r) => r[1] != null && String(r[1]).trim() !== '');   // no empty "—" boxes
  // 2-column key/value cards — each row grows to fit the taller of its two cells
  const cw = (w - 18) / 2, vgap = 8;
  const cellH = (val) => { doc.font('uiSB').fontSize(10.5); return Math.max(30, doc.heightOfString(V(val), { width: cw - 26, lineGap: 1.5 }) + 24); };
  for (let i = 0; i < rows.length; i += 2) {
    const pair = [rows[i], rows[i + 1]];
    const h = Math.max(cellH(pair[0] && pair[0][1]), pair[1] ? cellH(pair[1][1]) : 0);
    pair.forEach((r, col) => {
      if (!r) return;
      const x = M + col * (cw + 18);
      panel(doc, x, y, cw, h, C.mint, 6);
      doc.rect(x, y, 3, h).fill(C.emer);
      doc.font('ui').fontSize(8).fillColor(C.mute).text(String(r[0]).toUpperCase(), x + 14, y + 7, { characterSpacing: 0.8 });
      doc.font('uiSB').fontSize(10.5).fillColor(C.ink).text(V(r[1]), x + 14, y + 18, { width: cw - 26, lineGap: 1.5 });
    });
    y += h + vgap;
  }
  y += 8;

  // customised narrative — personalised to segment, grid type and battery
  const seg = String(data.project_type || '').toLowerCase();
  const inst = String(data.install_type || '').toLowerCase();
  const gt = String(data.grid_type || '').toLowerCase();
  const batt = String(data.battery || '').toLowerCase();
  const hasBattery = /yes|hybrid|off|batt|backup/.test(batt) || gt.includes('off') || gt.includes('hybrid');
  const kwpTxt = m.kwp ? `${m.kwp} kWp` : 'right-sized';
  // 1) segment sentence
  let narr;
  if (seg.includes('resid'))
    narr = `For your home, we will right-size a ${kwpTxt} rooftop system to your sanctioned load and daytime consumption. As a residential consumer you are also eligible for the PM Surya Ghar subsidy, shortening your payback further.`;
  else if (seg.includes('indust') || seg.includes('factory'))
    narr = `For your industrial load, we engineer this ${kwpTxt} plant for maximum generation against your daytime demand — cutting the most expensive tariff units first, with accelerated depreciation and a rapid 3–5 year payback.`;
  else if (seg.includes('comm'))
    narr = `For your commercial premises, this ${kwpTxt} system is designed to slash your operating-hour tariff, converting unused roof or land into a clean-power asset with compelling economics from year one.`;
  else if (seg.includes('gov') || seg.includes('psu'))
    narr = `For your institutional / PSU requirement, we deliver this ${kwpTxt} plant exactly to tender specification, backed by our Tata Power EPC and PSU project track record.`;
  else
    narr = `We begin with a feasibility study and geo-technical survey, then engineer this ${kwpTxt} system precisely to your load and available roof or land — for maximum lifetime generation, safety and return.`;
  // 2) grid-type sentence
  if (gt.includes('off'))
    narr += ' As an off-grid system, battery storage delivers full energy autonomy — powering you day and night, independent of the utility.';
  else if (gt.includes('hybrid'))
    narr += ' As a hybrid system, you export surplus for net-metering credit and still keep critical loads running through outages on battery backup.';
  else
    narr += ' As an on-grid system, surplus daytime generation is exported to the grid and a bi-directional net meter credits every unit — no batteries required.';
  if (hasBattery && !gt.includes('off') && !gt.includes('hybrid'))
    narr += ' Battery backup is included for your critical loads.';

  const nh = 134;
  panel(doc, M, y, w, nh, C.cream, 9);
  doc.rect(M, y, 4, nh).fill(C.gold);
  iconChip(doc, inst.includes('ground') ? 'grid' : 'home', M + 18, y + 18, 38, C.paper, C.gold);
  doc.font('H').fontSize(18).fillColor(C.ink).text('Engineered for Your Requirement', M + 68, y + 22);
  doc.font('body').fontSize(9.8).fillColor(C.body).text(narr, M + 68, y + 46, { width: w - 88, lineGap: 2.8 });
  y += nh + 14;
  drawImg(doc, photo(inst.includes('ground') ? 'proj-seci' : 'proj-rooftop-pano'), M, y, w, 120, 9);
}

// =============================================================================
//  SYSTEM DESIGN — dedicated page per grid type (on-grid / off-grid / hybrid)
//  and segment (residential home vs commercial/industrial facility).
// =============================================================================
function systemDesignPage(doc, data) {
  chrome(doc, 'System Design');
  const W = doc.page.width, w = W - 2 * M;
  const gt = String(data.grid_type || '').toLowerCase().replace(/[^a-z]/g, '');
  const isOff = gt.includes('off');
  const isHybrid = gt.includes('hyb');
  const isOn = !isOff && !isHybrid;
  const hasBattery = isOff || isHybrid || /^(y|t|1)/i.test(String(data.battery || '').trim());
  const hasGrid = isOn || isHybrid;
  const seg = String(data.project_type || '').toLowerCase();
  const isFacility = seg.includes('comm') || seg.includes('indust') || seg.includes('factory') || seg.includes('gov') || seg.includes('psu');
  const loadIcon = isFacility ? 'factory' : 'home';
  const loadLabel = isFacility ? 'Your Facility' : 'Your Home';
  const typeName = isOff ? 'Off-Grid' : isHybrid ? 'Hybrid' : 'On-Grid';

  heading(doc, 'Section 12 · Your System', `Your ${typeName} Solar System`);
  const introTxt = isOff
    ? `A fully independent ${typeName.toLowerCase()} system for ${loadLabel.toLowerCase()} — solar by day, battery by night, with no reliance on the utility grid.`
    : isHybrid
      ? `The best of both worlds for ${loadLabel.toLowerCase()} — solar power, battery backup through outages, and a grid connection that credits every surplus unit you export.`
      : `A grid-tied system for ${loadLabel.toLowerCase()} — clean daytime power with net metering, so surplus energy earns you credit and the grid tops you up seamlessly.`;
  para(doc, introTxt, M, doc.y, w, { size: 10.4 });
  let y = doc.y + 12;

  // ---- architecture diagram ----
  const dY = y, dH = 224;
  panel(doc, M, dY, w, dH, C.mint, 9, C.line);
  const busY = dY + 78;
  const arr = (x1, y1, x2, y2, col = C.gold, lw = 2.2) => {
    const a = Math.atan2(y2 - y1, x2 - x1), hl = 6;
    doc.save().moveTo(x1, y1).lineTo(x2, y2).lineWidth(lw).strokeColor(col).stroke();
    doc.moveTo(x2, y2).lineTo(x2 - hl * Math.cos(a - 0.5), y2 - hl * Math.sin(a - 0.5))
       .lineTo(x2 - hl * Math.cos(a + 0.5), y2 - hl * Math.sin(a + 0.5)).closePath().fill(col);
    doc.restore();
  };
  const bw = 50, bh = 42;
  const box = (cx, label, ic, tint) => {
    doc.save().roundedRect(cx - bw / 2, busY - bh / 2, bw, bh, 6).fill(C.paper).restore();
    doc.roundedRect(cx - bw / 2, busY - bh / 2, bw, bh, 6).lineWidth(1.2).strokeColor(tint || C.emer).stroke();
    icon(doc, ic, cx, busY, 11, tint || C.emer);
    doc.font('uiSB').fontSize(8).fillColor(C.ink).text(label, cx - 44, busY + bh / 2 + 5, { width: 88, align: 'center' });
  };
  // station x-centres
  const P = (f) => M + 26 + (w - 52) * f;
  const stations = hasGrid
    ? { solar: P(0), dcdb: P(0.20), inv: P(0.42), acdb: P(0.63), meter: P(0.82), grid: P(1) }
    : { solar: P(0), dcdb: P(0.26), inv: P(0.52), acdb: P(0.80) };
  // forward arrows along the bus
  const order = hasGrid ? ['solar', 'dcdb', 'inv', 'acdb', 'meter', 'grid'] : ['solar', 'dcdb', 'inv', 'acdb'];
  for (let i = 0; i < order.length - 1; i++) {
    const from = stations[order[i]], to = stations[order[i + 1]];
    const gap = (order[i] === 'solar' || order[i + 1] === 'grid') ? 22 : bw / 2 + 4;
    arr(from + bw / 2 + 2, busY, to - gap, busY, i === order.length - 2 && hasGrid ? C.emerM : C.gold);
  }
  // sun over the solar panel
  icon(doc, 'sun', stations.solar - 4, dY + 26, 11, C.goldB);
  // stations
  box(stations.solar, 'Solar Array', 'panel');
  box(stations.dcdb, 'DCDB', 'breaker');
  box(stations.inv, 'Inverter', 'bolt', C.gold);
  box(stations.acdb, 'ACDB', 'breaker');
  if (hasGrid) { box(stations.meter, 'Net Meter', 'meter'); icon(doc, 'pole', stations.grid, busY, 16, C.ink); doc.font('uiSB').fontSize(8).fillColor(C.ink).text('Utility Grid', stations.grid - 44, busY + bh / 2 + 5, { width: 88, align: 'center' }); }
  // DC / AC current labels
  doc.font('ui').fontSize(6.8).fillColor(C.mute).text('DC', (stations.dcdb + stations.inv) / 2 - 8, busY - 16, { width: 20, align: 'center' });
  doc.font('ui').fontSize(6.8).fillColor(C.mute).text('AC', (stations.inv + stations.acdb) / 2 - 8, busY - 16, { width: 20, align: 'center' });
  // battery below the DC bus (charge down / discharge up)
  if (hasBattery) {
    const bx = (stations.dcdb + stations.inv) / 2, by = dY + dH - 40;
    arr(bx - 5, busY + bh / 2, bx - 5, by - 20, C.emerM, 1.8);
    arr(bx + 5, by - 20, bx + 5, busY + bh / 2, C.gold, 1.8);
    icon(doc, 'battery', bx, by, 14, C.emer);
    doc.font('uiSB').fontSize(8).fillColor(C.ink).text('Battery Bank', bx - 44, by + 20, { width: 88, align: 'center' });
  }
  // load (home / facility) below the ACDB
  const lx = stations.acdb, ly = dY + dH - 40;
  arr(lx, busY + bh / 2, lx, ly - 18, C.emer, 1.8);
  icon(doc, loadIcon, lx, ly, 15, C.ink);
  doc.font('uiSB').fontSize(8).fillColor(C.ink).text(loadLabel, lx - 44, ly + 20, { width: 88, align: 'center' });
  y = dY + dH + 16;

  // ---- component explainer cards ----
  const cards = [['panel', 'Solar Array', `${model(data).kwp} kWp of Tier-1 modules convert sunlight into clean DC power — the engine of your plant.`],
                 ['bolt', `${typeName} Inverter`, isOff ? 'Converts DC to grid-quality AC and manages the battery for round-the-clock power.' : 'Converts DC to AC, syncs with the grid and intelligently routes power where it is needed.']];
  if (hasBattery) cards.push(['battery', 'Battery Bank', 'Stores surplus daytime energy to power you at night and ride through grid outages.']);
  if (hasGrid) cards.push(['meter', 'Net Meter & Grid', 'Exports your surplus for credit and draws top-up power when generation is low — billed only on the net.']);
  else cards.push(['shield', 'Total Autonomy', 'No wires to the utility — your plant runs fully independent, day and night.']);
  const n = cards.length, cw = (w - (n - 1) * 12) / n, ch = 140, y0 = y;
  cards.forEach((c, i) => {
    const x = M + i * (cw + 12);
    panel(doc, x, y0, cw, ch, C.paper, 9, C.line);
    doc.rect(x, y0, cw, 3).fill(i % 2 ? C.emer : C.gold);
    iconChip(doc, c[0], x + cw / 2 - 18, y0 + 16, 36, C.mint2, C.emer);
    doc.font('H').fontSize(14).fillColor(C.ink).text(c[1], x + 8, y0 + 58, { width: cw - 16, align: 'center' });
    doc.font('body').fontSize(8.4).fillColor(C.body).text(c[2], x + 10, y0 + 78, { width: cw - 20, align: 'center', lineGap: 1.8 });
  });
  y = y0 + ch + 14;

  // load / segment note
  const loadNote = isFacility
    ? 'Clean, reliable power for your machinery, HVAC, lighting and process loads — cutting your most expensive daytime tariff first.'
    : 'Clean, reliable power for your air-conditioning, refrigeration, lighting and everyday appliances — with lower bills from day one.';
  closingBand(doc, loadNote, { y: Math.min(y, 716), icon: loadIcon, dark: true });
}

// =============================================================================
//  PAGE 14 — HOW SOLAR WORKS
// =============================================================================
function howItWorksPage(doc) {
  chrome(doc, 'How Solar Works');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 13', 'From Sunlight to Savings');
  para(doc, 'A solar PV system converts free sunlight into clean electricity that powers your premises by day and earns you credit for any surplus. Here is how the energy flows.', M, doc.y, w, { size: 10.6 });
  let y = doc.y + 16;

  const steps = [
    ['sun', 'Sunlight', 'Photons strike Tier-1 PV modules on your roof or land.'],
    ['panel', 'DC Power', 'The modules generate direct-current (DC) electricity.'],
    ['bolt', 'Inverter', 'A smart inverter converts DC into grid-quality AC power.'],
    ['home', 'Your Load', 'Clean AC power runs your lights, machines & equipment.'],
    ['grid', 'The Grid', 'Surplus is exported; a net meter credits every unit.'],
  ];
  const n = steps.length, sw = (w - (n - 1) * 10) / n, sh = 150, y0 = y;
  steps.forEach((s, i) => {
    const x = M + i * (sw + 10);
    panel(doc, x, y0, sw, sh, C.mint, 9, C.line);
    doc.circle(x + sw / 2, y0 + 30, 16).fill(C.emer);
    doc.font('uiB').fontSize(11).fillColor('#fff').text(String(i + 1), x + sw / 2 - 6, y0 + 24, { width: 12, align: 'center' });
    icon(doc, s[0], x + sw / 2, y0 + 68, 11, C.gold);
    doc.font('uiSB').fontSize(10).fillColor(C.ink).text(s[1], x + 6, y0 + 90, { width: sw - 12, align: 'center' });
    doc.font('body').fontSize(8.2).fillColor(C.mute).text(s[2], x + 8, y0 + 106, { width: sw - 16, align: 'center', lineGap: 1.6 });
    if (i < n - 1) { doc.font('uiB').fontSize(15).fillColor(C.gold).text('›', x + sw + 0.5, y0 + 56, { width: 10, align: 'center' }); }
  });
  y = y0 + sh + 22;

  // photo + benefits
  const iw = w * 0.42;
  drawImg(doc, photo('how-photo'), M, y, iw, 184, 9);
  const bx = M + iw + 24, bw = w - iw - 24;
  eyebrow(doc, 'Why It Pays', bx, y + 4, C.gold);
  const bens = [
    ['rupee', 'Cut up to 90% of your electricity bill from day one.'],
    ['clock', 'Rapid 3–5 year payback, then decades of near-free power.'],
    ['shield', '25-year performance-warranted modules & robust structures.'],
    ['leaf', 'Slash your carbon footprint and meet ESG commitments.'],
  ];
  let by = y + 26;
  bens.forEach((b) => {
    iconChip(doc, b[0], bx, by, 30, C.mint2, C.emer);
    doc.font('body').fontSize(10.4).fillColor(C.body).text(b[1], bx + 40, by + 7, { width: bw - 46, lineGap: 2 });
    by += 42;
  });
  closingBand(doc, 'From sunlight to savings — clean, dependable power you can count on, day after day, for 25 years and beyond.', { y: 716, icon: 'sun' });
}

// =============================================================================
//  PAGE 15 — NET METERING
// =============================================================================
function netMeteringPage(doc, data) {
  chrome(doc, 'Net Metering');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 14 · Clarifying Your Doubts', 'Net Metering Explained');
  para(doc, 'Net metering lets your solar plant feed surplus power back into the grid. A bi-directional meter records both the units you import and the units you export — and you are billed only on the net. It is the mechanism that turns your roof into a virtual battery.', M, doc.y, w, { size: 10.4 });
  let y = doc.y + 12;

  // ---- illustrated energy-flow diagram ----
  const dY = y, dH = 196;
  panel(doc, M, dY, w, dH, C.mint, 9, C.line);
  const P = (f) => M + w * f;
  const midY = dY + 104;
  const GREY = '#8a9a92';
  // arrow helper
  const arrow = (x1, y1, x2, y2, col, lw = 2.4) => {
    const ang = Math.atan2(y2 - y1, x2 - x1), hl = 7;
    doc.save().moveTo(x1, y1).lineTo(x2, y2).lineWidth(lw).strokeColor(col).stroke();
    doc.moveTo(x2, y2)
       .lineTo(x2 - hl * Math.cos(ang - 0.5), y2 - hl * Math.sin(ang - 0.5))
       .lineTo(x2 - hl * Math.cos(ang + 0.5), y2 - hl * Math.sin(ang + 0.5))
       .closePath().fill(col);
    doc.restore();
  };
  // custom node glyphs
  const drawMeter = (cx, cy) => {
    doc.save();
    doc.circle(cx, cy - 3, 8).lineWidth(1.2).strokeColor(C.emer).stroke();
    doc.moveTo(cx, cy - 3).lineTo(cx + 4, cy - 8).lineWidth(1.2).strokeColor(C.emer).stroke();
    for (let k = -1; k <= 1; k++) doc.circle(cx + k * 5, cy + 10, 1.6).fill(C.emer);
    doc.restore();
  };
  const drawPole = (cx, cy) => {
    doc.save().lineWidth(2.2).strokeColor(C.ink);
    doc.moveTo(cx, cy - 26).lineTo(cx, cy + 30).stroke();
    doc.moveTo(cx - 15, cy - 20).lineTo(cx + 15, cy - 20).stroke();
    doc.moveTo(cx - 15, cy - 10).lineTo(cx + 15, cy - 10).stroke();
    doc.circle(cx - 12, cy - 22, 1.8).fill(C.ink); doc.circle(cx + 12, cy - 22, 1.8).fill(C.ink);
    doc.restore();
  };
  const nodes = [
    { f: 0.10, icon: 'panel', label: 'Solar Panels', sub: 'Sunlight → DC', n: 1 },
    { f: 0.30, icon: 'bolt', label: 'Inverter', sub: 'DC → AC', n: 2 },
    { f: 0.50, icon: 'home', label: 'Home / Business', sub: 'Energy used', n: 3 },
    { f: 0.70, icon: 'meter', label: 'Bi-directional Meter', sub: 'Import & export', n: 4 },
  ];
  // forward gold arrows between the four circle nodes
  for (let i = 0; i < nodes.length - 1; i++) arrow(P(nodes[i].f) + 26, midY, P(nodes[i + 1].f) - 28, midY, C.gold);
  // sun above the panels + ray arrow into them
  icon(doc, 'sun', P(0.10), dY + 34, 13, C.goldB);
  arrow(P(0.10) + 8, dY + 46, P(0.10) + 2, midY - 26, C.goldB, 2);
  // nodes
  nodes.forEach((nd) => {
    const cx = P(nd.f);
    doc.circle(cx, midY, 24).fill(C.paper); doc.circle(cx, midY, 24).lineWidth(1.3).strokeColor(C.emer).stroke();
    if (nd.icon === 'meter') drawMeter(cx, midY); else icon(doc, nd.icon, cx, midY, 12, C.emer);
    doc.circle(cx - 20, midY - 20, 9).fill(C.gold);
    doc.font('uiB').fontSize(9).fillColor('#fff').text(String(nd.n), cx - 24.5, midY - 25, { width: 9, align: 'center' });
    doc.font('uiSB').fontSize(8.5).fillColor(C.ink).text(nd.label, cx - 48, midY + 32, { width: 96, align: 'center' });
    doc.font('ui').fontSize(7).fillColor(C.mute).text(nd.sub, cx - 48, midY + 44, { width: 96, align: 'center' });
  });
  // grid pole at far right
  const gx = P(0.90);
  drawPole(gx, midY);
  doc.font('uiSB').fontSize(8.5).fillColor(C.ink).text('Electrical Grid', gx - 48, midY + 32, { width: 96, align: 'center' });
  // two-way flow between meter and grid
  const mx = P(0.70), ax1 = mx + 26, ax2 = gx - 18;
  arrow(ax1, midY - 9, ax2, midY - 9, C.emerM, 2.6);          // export (to grid)
  arrow(ax2, midY + 9, ax1, midY + 9, GREY, 2.6);             // import (from grid)
  doc.font('ui').fontSize(6.6).fillColor(C.emerM).text('EXCESS → GRID', mx + 20, midY - 26, { width: 110, characterSpacing: 0.3 });
  doc.font('ui').fontSize(6.6).fillColor(GREY).text('GRID → HOME', mx + 20, midY + 16, { width: 110, characterSpacing: 0.3 });
  y = dY + dH + 16;

  // three grid-type cards
  const modes = [
    ['grid', 'On-Grid', 'Connected to the utility grid with net metering. No batteries — surplus is exported for credit. The most economical option where grid supply is reliable.', C.emer, 'ongrid'],
    ['bolt', 'Off-Grid', 'Fully independent with battery storage. Powers you through outages and remote sites with no grid connection. Higher upfront cost, total autonomy.', C.gold, 'offgrid'],
    ['shield', 'Hybrid', 'The best of both — grid-tied with battery backup. You export surplus for credit and still keep critical loads running during outages.', C.navy, 'hybrid'],
  ];
  const chosen = String(data.grid_type || '').toLowerCase().replace(/[^a-z]/g, '');
  const cw = (w - 2 * 14) / 3, ch = 150;
  modes.forEach((mo, i) => {
    const x = M + i * (cw + 14);
    const active = chosen && chosen.includes(mo[4].slice(0, 5));
    panel(doc, x, y, cw, ch, active ? C.mint2 : C.paper, 9, active ? mo[3] : C.line);
    doc.rect(x, y, cw, 3).fill(mo[3]);
    iconChip(doc, mo[0], x + 16, y + 18, 34, C.mint2, mo[3]);
    doc.font('H').fontSize(17).fillColor(C.ink).text(mo[1], x + 58, y + 24);
    if (active) { doc.font('uiB').fontSize(7).fillColor(mo[3]).text('● YOUR CHOICE', x + 58, y + 44); }
    doc.font('body').fontSize(9.4).fillColor(C.body).text(mo[2], x + 16, y + 64, { width: cw - 32, lineGap: 3 });
  });
  y += ch + 18;

  // billed-on-the-net example strip
  panel(doc, M, y, w, 60, C.emerD, 9);
  doc.rect(M, y, 4, 60).fill(C.gold);
  doc.font('uiSB').fontSize(8.5).fillColor(C.goldB).text('BILLED ONLY ON THE NET', M + 20, y + 13, { characterSpacing: 1.2 });
  doc.font('bodyI').fontSize(12).fillColor('#ffffff')
     .text('Units exported to the grid are subtracted from units imported — you pay only for the difference, turning surplus daytime generation into real credit on your bill.',
           M + 20, y + 27, { width: w - 40 });
}

// =============================================================================
//  PAGE 16 — EXECUTION
// =============================================================================
function executionPage(doc) {
  chrome(doc, 'Execution');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 15 · How We Deliver', 'Execution Methodology');
  para(doc, 'Military logistics translated into renewable-energy delivery — a disciplined, six-stage process with accountability at every checkpoint.', M, doc.y, w, { size: 10.6 });
  let y = doc.y + 14;
  const steps = [
    ['doc', 'Survey & Feasibility', 'Site assessment, geo-technical survey, shadow & structural analysis, load study.'],
    ['grid', 'Detailed Engineering', 'System sizing, single-line diagrams, structure & foundation design, Tier-1 BOQ.'],
    ['tools', 'Procurement', 'Tier-1 modules, smart inverters and BIS-grade balance-of-system — sourced & inspected.'],
    ['bolt', 'Piling & Civil', 'Hydraulic pile-driving, foundations, mounting structures, fencing & cable trenches.'],
    ['panel', 'Installation & Wiring', 'Module mounting, DC/AC wiring, earthing, LT/HT works and safety systems.'],
    ['sun', 'Commissioning', 'Testing, grid synchronisation, DISCOM liaison, net-meter installation & handover with O&M.'],
  ];
  const cw = (w - 2 * 16) / 3, ch = 150, y0 = y;
  steps.forEach((s, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + 16), yy = y0 + row * (ch + 16);
    panel(doc, x, yy, cw, ch, C.paper, 9, C.line);
    doc.circle(x + 28, yy + 28, 17).fill(C.emer);
    doc.font('uiB').fontSize(12).fillColor('#fff').text(String(i + 1), x + 21, yy + 21, { width: 14, align: 'center' });
    icon(doc, s[0], x + cw - 24, yy + 26, 10, C.gold);
    doc.font('uiSB').fontSize(11).fillColor(C.ink).text(s[1], x + 18, yy + 56, { width: cw - 36, height: 26 });
    doc.font('body').fontSize(8.8).fillColor(C.body).text(s[2], x + 18, yy + 92, { width: cw - 36, lineGap: 2.4 });
  });
  y = y0 + 2 * (ch + 16) + 10;
  const iw = (w - 2 * 12) / 3;
  const ps = [['proj-piling-extra', 'Hydraulic Piling'], ['proj-earthing', 'Earthing & Safety'], ['proj-inauguration', 'Commissioning']];
  ps.forEach((p, i) => {
    const x = M + i * (iw + 12);
    drawImg(doc, photo(p[0]), x, y, iw, 116, 8);
    doc.font('uiSB').fontSize(8).fillColor(C.emer).text(p[1].toUpperCase(), x, y + 122, { width: iw, align: 'center', characterSpacing: 0.5 });
  });
  closingBand(doc, 'Mobilised like a military operation — planned to the last detail, executed with discipline, and handed over on time.', { y: 716, icon: 'shield' });
}

// =============================================================================
//  PAGE 17 — SAVINGS & ROI
// =============================================================================
function savingsPage(doc, data) {
  chrome(doc, 'Savings & ROI');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 16 · The Numbers', 'Your Savings & Return');
  const m = model(data);
  para(doc, `Here is what a ${m.kwp} kWp plant means for you — the investment, the money it puts back in your pocket, and how quickly it pays for itself.`, M, doc.y, w, { size: 10.4 });
  let y = doc.y + 12;

  // top KPI cards
  const kpis = [
    ['Net Investment', inrShort(m.netInvest), C.navy],
    ['Monthly Savings', inrShort(m.monthlySave), C.gold],
    ['Payback Period', m.paybackYrs.toFixed(1) + ' yrs', C.emerM],
    ['25-Yr Return', m.roiX.toFixed(1) + '×', C.emer],
  ];
  const cw = (w - 3 * 12) / 4, ch = 62;
  kpis.forEach((k, i) => {
    const x = M + i * (cw + 12);
    panel(doc, x, y, cw, ch, C.mint, 9, C.line);
    doc.rect(x, y, 4, ch).fill(k[2]);
    doc.font('ui').fontSize(7.3).fillColor(C.mute).text(String(k[0]).toUpperCase(), x + 14, y + 11, { characterSpacing: 0.6 });
    doc.font('uiB').fontSize(17).fillColor(C.ink).text(k[1], x + 14, y + 26);
  });
  y += ch + 16;

  // ---- left: investment breakdown | right: 25-yr chart ----
  const colGap = 16, leftW = w * 0.40, rightW = w - leftW - colGap;
  const blockH = 192, lx = M, rx = M + leftW + colGap;

  // investment breakdown panel
  panel(doc, lx, y, leftW, blockH, C.paper, 9, C.line);
  doc.font('uiSB').fontSize(8).fillColor(C.gold).text('INVESTMENT', lx + 16, y + 14, { characterSpacing: 1 });
  const inv = [
    ['System Cost', m.capex, C.mute],
    ['Govt. Subsidy', -m.subsidy, C.emer],
    ['Net Investment', m.netInvest, C.ink],
  ];
  let iy = y + 30;
  inv.forEach((r, i) => {
    const bold = i === inv.length - 1;
    if (bold) doc.moveTo(lx + 16, iy - 3).lineTo(lx + leftW - 16, iy - 3).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.font(bold ? 'uiSB' : 'ui').fontSize(bold ? 10 : 9.2).fillColor(bold ? C.ink : C.body).text(r[0], lx + 16, iy + 2);
    doc.font('uiB').fontSize(bold ? 12 : 9.6).fillColor(r[2])
       .text((r[1] < 0 ? '– ' : '') + inrShort(Math.abs(r[1])), lx + 16, iy + (bold ? 0 : 1), { width: leftW - 32, align: 'right' });
    iy += bold ? 26 : 22;
  });
  // annual generation + year-1 savings (stacked, right-aligned values)
  iy += 8;
  const statRow = (label, val, col) => {
    doc.font('ui').fontSize(8).fillColor(C.mute).text(label, lx + 16, iy + 3);
    doc.font('uiB').fontSize(12).fillColor(col).text(val, lx + 16, iy, { width: leftW - 32, align: 'right' });
    iy += 22;
  };
  statRow('Annual Generation', Math.round(m.gen1).toLocaleString('en-IN') + ' kWh', C.emer);
  statRow('Year-1 Savings', inrShort(m.save1), C.gold);
  // payback highlight — two-line pill, sized to hold the full caption
  const phH = 34, phy = y + blockH - phH - 6;
  doc.save().roundedRect(lx + 12, phy, leftW - 24, phH, 6).fill(C.mint2).restore();
  doc.font('uiSB').fontSize(7.6).fillColor(C.emer)
     .text('BREAK-EVEN IN ' + m.paybackYrs.toFixed(1) + ' YRS  ·  THEN 25+ YRS OF FREE POWER', lx + 14, phy + 8, { width: leftW - 28, align: 'center', characterSpacing: 0.3, lineGap: 2 });

  // 25-year cumulative savings chart (right)
  panel(doc, rx, y, rightW, blockH, C.paper, 9, C.line);
  doc.font('uiSB').fontSize(8).fillColor(C.gold).text('25-YEAR CUMULATIVE SAVINGS', rx + 14, y + 12, { characterSpacing: 0.8 });
  const padL = 46, padT = 30, padB = 20, padR = 14;
  const plotX = rx + padL, plotY = y + padT, plotW = rightW - padL - padR, plotH = blockH - padT - padB;
  const maxV = m.series[m.series.length - 1];
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + plotH - (plotH * g / 4);
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font('ui').fontSize(6.6).fillColor(C.mute).text(inrShort(maxV * g / 4), rx + 4, gy - 4, { width: padL - 8, align: 'right' });
  }
  const pts = m.series.map((v, i) => [plotX + (plotW * i / 24), plotY + plotH - (plotH * v / maxV)]);
  doc.save(); doc.moveTo(plotX, plotY + plotH);
  pts.forEach((p) => doc.lineTo(p[0], p[1]));
  doc.lineTo(plotX + plotW, plotY + plotH).closePath();
  const grad = doc.linearGradient(0, plotY, 0, plotY + plotH);
  grad.stop(0, C.emer, 0.5).stop(1, C.emer, 0.05);
  doc.fill(grad); doc.restore();
  doc.save().moveTo(pts[0][0], pts[0][1]);
  pts.forEach((p) => doc.lineTo(p[0], p[1]));
  doc.lineWidth(1.8).strokeColor(C.emer).stroke(); doc.restore();
  // payback marker
  const pbX = plotX + (plotW * Math.min(m.paybackYrs, 25) / 25);
  doc.save().moveTo(pbX, plotY).lineTo(pbX, plotY + plotH).lineWidth(0.8).dash(2, { space: 2 }).strokeColor(C.gold).stroke().undash().restore();
  doc.font('ui').fontSize(6.4).fillColor(C.gold).text('PAYBACK', pbX + 2, plotY + 2);
  [1, 10, 25].forEach((yr) => {
    const px = plotX + (plotW * (yr - 1) / 24);
    doc.font('ui').fontSize(6.6).fillColor(C.mute).text('Yr ' + yr, px - 8, plotY + plotH + 6, { width: 24, align: 'center' });
  });
  y += blockH + 16;

  // ---- 25 years: with vs without solar ----
  eyebrow(doc, '25 Years — With Solar vs Without', M, y, C.gold); y += 16;
  const cmpH = 96;
  panel(doc, M, y, w, cmpH, C.paper, 9, C.line);
  const barX = M + 150, barMaxW = w - 150 - 130, barMax = m.cum25;
  const bar = (yy, label, sub, val, col) => {
    doc.font('uiSB').fontSize(9).fillColor(C.ink).text(label, M + 16, yy + 2, { width: 128 });
    doc.font('ui').fontSize(7.2).fillColor(C.mute).text(sub, M + 16, yy + 15, { width: 128 });
    const bw = Math.max(8, barMaxW * (val / barMax));
    doc.save().roundedRect(barX, yy, barMaxW, 20, 4).fill(C.mint).restore();
    doc.save().roundedRect(barX, yy, bw, 20, 4).fill(col).restore();
    // keep the value clear of the panel's right outline (16px inner padding)
    doc.font('uiB').fontSize(11).fillColor(C.ink).text(inrShort(val), M + w - 120, yy + 4, { width: 104, align: 'right' });
  };
  bar(y + 18, 'Without Solar', 'Paid to the DISCOM, 25 yrs', m.cum25, '#c99a3b');
  bar(y + 54, 'With Solar', 'One-time net investment', m.netInvest, C.emer);
  y += cmpH + 8;

  // total-savings callout band
  panel(doc, M, y, w, 42, C.emerD, 9);
  doc.rect(M, y, 4, 42).fill(C.gold);
  doc.font('body').fontSize(10.5).fillColor('#dcf3e7').text('You keep roughly', M + 20, y + 14, { continued: true })
     .font('uiB').fontSize(12).fillColor('#ffffff').text('  ' + inr(m.cum25 - m.netInvest) + '  ', { continued: true })
     .font('body').fillColor('#dcf3e7').text('over 25 years — a ' + m.roiX.toFixed(1) + '× return on your net investment.', { continued: false });
  y += 42 + 8;
  doc.font('bodyI').fontSize(7.4).fillColor(C.mute)
     .text('Estimates use a 1,500 kWh/kWp annual yield, ₹' + m.tariff + '/unit tariff with 3.5% escalation and 0.6%/yr module degradation. Actual results vary with site, weather, consumption and DISCOM policy. Figures are indicative and not a financial guarantee.', M, y, { width: w, lineGap: 1.5 });
}

// =============================================================================
//  ENVIRONMENTAL IMPACT — greenery, CO₂ & clean-energy graphics
// =============================================================================
function environmentPage(doc, data) {
  chrome(doc, 'Environmental Impact');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 17 · Clean & Green', 'Your Environmental Impact');
  const m = model(data);
  para(doc, 'Every unit your plant generates is a unit of clean power the grid does not have to make from coal. Across 25 years, that adds up to a genuine contribution to a greener nation.', M, doc.y, w, { size: 10.4 });
  let y = doc.y + 14;

  // hero CO2 band with a leaf motif
  const bh = 92;
  panel(doc, M, y, w, bh, C.emer, 10);
  // faint leaves
  doc.save().fillOpacity(0.10);
  for (let i = 0; i < 7; i++) icon(doc, 'leaf', M + w - 40 - i * 34, y + 22 + (i % 2) * 30, 16, '#ffffff');
  doc.restore();
  doc.font('ui').fontSize(8).fillColor('#bfe7d6').text('CO₂ EMISSIONS AVOIDED OVER 25 YEARS', M + 24, y + 20, { characterSpacing: 1.2 });
  doc.font('uiB').fontSize(40).fillColor('#ffffff').text(Math.round(m.co2Life).toLocaleString('en-IN') + ' tonnes', M + 22, y + 34);
  doc.font('bodyI').fontSize(10).fillColor('#dcf3e7').text('≈ ' + Math.round(m.co2yr).toLocaleString('en-IN') + ' t every year of clean generation', M + 24, y + 74);
  y += bh + 16;

  // four equivalence cards with graphics
  eyebrow(doc, 'What That Equals', M, y, C.gold); y += 16;
  const cards = [
    ['tree', m.treesLife.toLocaleString('en-IN'), 'Trees', 'working a lifetime to absorb the same CO₂'],
    ['car', m.carsYr.toLocaleString('en-IN'), 'Cars', 'taken off the road, every single year'],
    ['factory', Math.round(m.coalLife).toLocaleString('en-IN') + ' t', 'Coal', 'never mined or burned for your power'],
    ['home', m.homesPowered.toLocaleString('en-IN'), 'Homes', 'worth of clean electricity, each year'],
  ];
  const cwid = (w - 3 * 14) / 4, chh = 178, y0 = y;
  cards.forEach((c, i) => {
    const x = M + i * (cwid + 14);
    panel(doc, x, y0, cwid, chh, C.mint, 10, C.line);
    doc.rect(x, y0, cwid, 3).fill(C.emer);
    // icon medallion
    doc.circle(x + cwid / 2, y0 + 44, 26).fill(C.mint2);
    icon(doc, c[0], x + cwid / 2, y0 + 44, 15, C.emer);
    doc.font('uiB').fontSize(22).fillColor(C.ink).text(c[1], x + 8, y0 + 84, { width: cwid - 16, align: 'center' });
    doc.font('uiSB').fontSize(10.5).fillColor(C.emer).text(c[2], x + 8, y0 + 114, { width: cwid - 16, align: 'center' });
    doc.font('body').fontSize(8.6).fillColor(C.mute).text(c[3], x + 12, y0 + 132, { width: cwid - 24, align: 'center', lineGap: 1.5 });
  });
  y = y0 + chh + 18;

  // forest strip + statement
  const fh = 118;
  panel(doc, M, y, w, fh, C.mint2, 10, C.line);
  doc.save();
  for (let i = 0; i < 24; i++) icon(doc, 'tree', M + 20 + i * ((w - 40) / 23), y + 36, 13 + (i % 3) * 3, C.emerM);
  doc.restore();
  doc.moveTo(M + 24, y + 62).lineTo(M + w - 24, y + 62).lineWidth(0.5).strokeColor('#bfe7d6').stroke();
  doc.font('bodyI').fontSize(11).fillColor(C.emer)
     .text('Going solar with Arrays Ingenieria is not just a smart investment — it is a lasting act of nation-building. Cleaner air, lower carbon, and energy independence for generations to come.',
           M + 34, y + 74, { width: w - 68, align: 'center', lineGap: 2.5 });
  y += fh + 8;
  doc.font('bodyI').fontSize(7.6).fillColor(C.mute)
     .text('Environmental equivalences use a 0.82 kg CO₂/kWh Indian grid emission factor, ~22 kg/tree/yr sequestration and 0.4 kg coal/kWh. Indicative figures for illustration.', M, y, { width: w, lineGap: 1.5 });
}

// =============================================================================
//  PAGE 18 — QUALITY, SAFETY & WARRANTY
// =============================================================================
function qualityPage(doc, data = {}) {
  chrome(doc, 'Quality & Warranty');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Section 18 · Assurance', 'Quality, Safety & Warranty');
  para(doc, 'Every plant is engineered to audited, triple-ISO standards using Tier-1 hardware — and backed by warranties that protect your investment for decades.', M, doc.y, w, { size: 10.6 });
  let y = doc.y + 14;

  const certs = [['iso-9001', 'ISO 9001', 'Quality Management'], ['iso-14001', 'ISO 14001', 'Environmental Mgmt.'], ['iso-45001', 'ISO 45001', 'Occupational Safety'], ['award-india5000', 'India 5000', 'Best MSME Award']];
  const cw = (w - 3 * 14) / 4, ih = 150, y0 = y;
  certs.forEach((c, i) => {
    const x = M + i * (cw + 14);
    panel(doc, x, y0, cw, ih + 38, C.paper, 9, C.line);
    drawImg(doc, cert(c[0]), x + 12, y0 + 12, cw - 24, ih - 12, 4);
    doc.font('uiSB').fontSize(10).fillColor(C.ink).text(c[1], x, y0 + ih + 8, { width: cw, align: 'center' });
    doc.font('body').fontSize(8).fillColor(C.mute).text(c[2], x, y0 + ih + 22, { width: cw, align: 'center' });
  });
  y = y0 + ih + 38 + 20;

  eyebrow(doc, 'Warranty & Assurance', M, y, C.gold); y += 18;
  const rows = (Array.isArray(data.warranty_rows) && data.warranty_rows.length)
    ? data.warranty_rows.map((r) => (Array.isArray(r) ? r : [r.component || r.item || '', r.spec || r.specification || '', r.warranty || ''])).filter((r) => r[0])
    : [
      ['Solar Modules', 'As per the requirement of the client', 'As per module manufacturer’s product & performance warranty'],
      ['Inverters', 'As per the requirement of the client', 'As per inverter manufacturer’s warranty'],
      ['Mounting Structure', 'Hot-dip galvanised / GI', 'Against corrosion, as per make'],
      ['Workmanship (EPC)', 'Ingenieria installation', 'As mutually agreed'],
    ];
  const c0 = M, c1 = M + 150, c2 = M + 320;
  panel(doc, M, y, w, 26, C.emer, 5);
  doc.font('uiSB').fontSize(8).fillColor('#fff');
  doc.text('COMPONENT', c0 + 12, y + 9); doc.text('SPECIFICATION', c1, y + 9); doc.text('WARRANTY', c2, y + 9);
  y += 26;
  rows.forEach((r, i) => {
    // row height grows with the tallest of specification / warranty text
    doc.font('body').fontSize(9.6);
    const hSpec = doc.heightOfString(String(r[1] || ''), { width: c2 - c1 - 12, lineGap: 1.5 });
    const hWar = doc.heightOfString(String(r[2] || ''), { width: W - M - c2 - 12, lineGap: 1.5 });
    const rh = Math.max(34, Math.max(hSpec, hWar) + 18);
    if (i % 2) doc.save().rect(M, y, w, rh).fill(C.mint).restore();
    doc.font('uiSB').fontSize(9.8).fillColor(C.ink).text(String(r[0]), c0 + 12, y + 11, { width: 138 });
    doc.font('body').fontSize(9.6).fillColor(C.body).text(String(r[1] || ''), c1, y + 11, { width: c2 - c1 - 12, lineGap: 1.5 });
    doc.font('uiM').fontSize(9.6).fillColor(C.emer).text(String(r[2] || ''), c2, y + 11, { width: W - M - c2 - 12, lineGap: 1.5 });
    doc.moveTo(M, y + rh).lineTo(W - M, y + rh).lineWidth(0.5).strokeColor(C.line).stroke();
    y += rh;
  });
  const bandY = Math.min(Math.max(y + 20, 640), 716);
  closingBand(doc, 'Built to audited, triple-ISO standards with hardware supplied as per your requirement — quality you can measure, and warranties you can trust.', { y: bandY, icon: 'medal' });
}

// =============================================================================
//  PAGE 19 — FAQ
// =============================================================================
function faqPage(doc, data = {}) {
  chrome(doc, 'FAQ');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Before You Decide', 'Frequently Asked Questions');
  let y = doc.y + 4;
  const faqs = (Array.isArray(data.faqs) && data.faqs.length)
    ? data.faqs.map((f) => (Array.isArray(f) ? f : [f.q || f.question || '', f.a || f.answer || ''])).filter((f) => f[0]).slice(0, 8)
    : [
    ['Will rooftop solar damage my roof?', 'No. We use leak-proof, structurally engineered mounting and conduct a full structural and shadow analysis before installation to protect your roof’s integrity.'],
    ['How much can I actually save?', 'Most clients offset 70–90% of their electricity bill and reach payback in 3–5 years, then enjoy decades of near-free daytime power.'],
    ['What happens on cloudy days or at night?', 'On-grid systems draw seamlessly from the grid when generation is low; net metering credits your daytime surplus. Hybrid systems add battery backup for outages.'],
    ['Do you handle the DISCOM & net-metering paperwork?', 'Yes. We manage the entire DISCOM liaison, net-metering application, inspections and grid-synchronisation approvals end to end.'],
    ['What subsidy am I eligible for?', 'Residential consumers qualify for the PM Surya Ghar subsidy; commercial & industrial clients benefit from accelerated depreciation. We help you claim what applies.'],
    ['How long does installation take?', 'A typical rooftop is commissioned in 3–6 weeks; larger ground-mount plants follow a project schedule shared upfront and tracked with military discipline.'],
    ['What maintenance does a solar plant need?', 'Very little — periodic module cleaning and inverter checks. Our O&M packages cover preventive & corrective maintenance, monitoring and rapid fault resolution.'],
    ['Why choose Ingenieria over others?', 'A 100% veteran-led, triple-ISO team with a portfolio from 10 kWp rooftops to utility-scale solar parks — and the discipline to deliver every one on time.'],
  ];
  const cw = (w - 24) / 2, rowH = 116;
  faqs.forEach((f, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (cw + 24), yy = y + row * rowH;
    doc.save().roundedRect(x - 12, yy - 10, cw + 24, rowH - 8, 9).fill(i % 2 ? C.mint : C.paper).restore();
    if (!(i % 2)) doc.roundedRect(x - 12, yy - 10, cw + 24, rowH - 8, 9).lineWidth(0.8).strokeColor(C.line).stroke();
    doc.font('uiB').fontSize(11).fillColor(C.gold).text('Q', x, yy);
    doc.font('uiSB').fontSize(10.8).fillColor(C.ink).text(f[0], x + 18, yy, { width: cw - 18 });
    doc.font('body').fontSize(9.6).fillColor(C.body).text(f[1], x + 18, doc.y + 3, { width: cw - 18, lineGap: 2.8 });
  });
  closingBand(doc, 'Still have a question? Our veteran-led team is a phone call away — we would be glad to walk you through every detail.', { y: 716, icon: 'people', dark: true });
}

// =============================================================================
//  PAGE 20 — THANK YOU
// =============================================================================
function thankYouPage(doc) {
  const W = doc.page.width, H = doc.page.height;
  bleed(doc, C.emerD);
  doc.rect(0, 0, W, 4).fill(C.gold);
  // faint solar-farm photo that sinks smoothly into the emerald — no hard edge:
  // the veil is fully opaque emerald at the top of the band (so the photo's top
  // edge is invisible) and only softly reveals the photo toward the very bottom.
  const bandH = 300;
  drawImg(doc, photo('hero-solar-farm'), 0, H - bandH, W, bandH);
  const veil = doc.linearGradient(0, H - bandH, 0, H);
  veil.stop(0, C.emerD, 1).stop(0.5, C.emerD, 1).stop(0.8, C.emerD, 0.82).stop(1, C.emerD, 0.68);
  doc.rect(0, H - bandH, W, bandH).fill(veil);

  // logo on a clean white plate large enough to fully contain the square mark
  doc.save().roundedRect(W / 2 - 68, 82, 136, 130, 16).fillOpacity(0.96).fill('#ffffff').restore();
  logo(doc, W / 2 - 52, 90, 104, false);

  doc.font('script').fontSize(58).fillColor('#ffffff').text('Thank You', 0, 220, { width: W, align: 'center' });
  triTick(doc, W / 2 - 45, 302, 90);
  doc.font('bodyI').fontSize(14).fillColor('#dcf3e7')
     .text('We would be honoured to power your future.', 0, 326, { width: W, align: 'center' });

  // dark "cold" contact card — emerald, gold-edged (no white)
  const cw = 400, cx = W / 2 - cw / 2, cy = 376;
  panel(doc, cx, cy, cw, 136, '#0b3a2b', 12, '#1f6b4f');
  doc.rect(cx, cy, cw, 4).fill(C.gold);
  doc.font('uiSB').fontSize(9).fillColor(C.goldB).text('START YOUR SOLAR PROJECT', cx, cy + 22, { width: cw, align: 'center', characterSpacing: 1.6 });
  doc.font('H').fontSize(24).fillColor('#ffffff').text('Arrays Ingenieria Pvt. Ltd.', cx, cy + 38, { width: cw, align: 'center' });
  doc.font('body').fontSize(10).fillColor('#cfe9df')
     .text('Ex-Servicemen Led  ·  ISO 9001 · 14001 · 45001  ·  Pan-India', cx, cy + 72, { width: cw, align: 'center' });
  doc.font('uiSB').fontSize(11.5).fillColor(C.goldB)
     .text('arraysingenieria@gmail.com', cx, cy + 92, { width: cw, align: 'center' });
  doc.font('ui').fontSize(9).fillColor('#a7cfc0')
     .text('www.arraysingenieria.com', cx, cy + 110, { width: cw, align: 'center' });

  doc.font('bodyI').fontSize(11).fillColor('#a7cfc0')
     .text('Developing Green Energy for the Nation', 0, H - 66, { width: W, align: 'center' });
  doc.font('ui').fontSize(7).fillColor('#7fae9b')
     .text('This is a computer-generated document produced by the Arrays Ingenieria proposal system and is valid without a signature.',
           0, H - 46, { width: W, align: 'center' });
}

// =============================================================================
//  TECHNICAL SPECIFICATIONS (component datasheet parameters)
// =============================================================================
function normalizeSpecs(list) {
  if (!Array.isArray(list)) return null;
  const a = list.map((r) => (Array.isArray(r)
    ? [String(r[0] || '').trim(), String(r[1] || '').trim()]
    : [String(r.label || r.k || r.parameter || '').trim(), String(r.value || r.v || '').trim()]))
    .filter((r) => r[0]);
  return a.length ? a : null;
}

function technicalPage(doc, data = {}) {
  chrome(doc, 'Technical');
  const W = doc.page.width, w = W - 2 * M;
  heading(doc, 'Component Datasheets', 'Technical Specifications');
  para(doc, 'Indicative technical parameters of the proposed major components. Final makes, models and datasheets are supplied as per the requirement of the client.', M, doc.y, w, { size: 10.4 });
  let y = doc.y + 14;
  const kwp = model(data).kwp;
  const wattage = num(data.panel_wattage, 0) || num((data.inputs || {}).panel_wattage, 0) || 545;
  const moduleRows = normalizeSpecs(data.module_specs) || [
    ['Make / Model', V(data.module_brand, 'As per approved make')],
    ['Wattage (Wp)', wattage + ' Wp'],
    ['Technology', 'Mono PERC / latest equivalent'],
    ['Module Efficiency', 'As per approved datasheet'],
    ['Voc / Vmp', 'As per approved datasheet'],
    ['Isc / Imp', 'As per approved datasheet'],
    ['Dimensions / Weight', 'As per approved datasheet'],
    ['Product Warranty', 'As per manufacturer'],
    ['Performance Warranty', 'As per manufacturer'],
    ['Certifications', 'BIS / IEC certified'],
  ];
  const inverterRows = normalizeSpecs(data.inverter_specs) || [
    ['Make / Model', V(data.inverter_brand, 'As per approved make')],
    ['Rated Capacity', 'Suitable for ' + kwp + ' kWp DC (as per design)'],
    ['Type', '3-Phase Grid-Connected String Inverter'],
    ['No. of MPPTs', 'As per approved datasheet'],
    ['Max DC Voltage', 'As per approved datasheet'],
    ['Euro / Peak Efficiency', 'As per approved datasheet'],
    ['Warranty', 'As per manufacturer (extendable)'],
  ];
  const bottom = doc.page.height - 46;
  const flowY = (yy, need) => (yy + need > bottom ? (doc.addPage(), chrome(doc, 'Technical'), 110) : yy);
  const specTable = (title, rows, yy) => {
    yy = flowY(yy, 44);
    eyebrow(doc, title, M, yy, C.gold); yy += 16;
    rows.forEach((r, i) => {
      doc.font('body').fontSize(9.6);
      const vh = doc.heightOfString(String(r[1] || ''), { width: w - 208, lineGap: 1.5 });
      const rh = Math.max(26, vh + 14);
      yy = flowY(yy, rh);
      if (i % 2) doc.save().rect(M, yy, w, rh).fill(C.mint).restore();
      doc.font('uiSB').fontSize(9.2).fillColor(C.ink).text(String(r[0]), M + 12, yy + 8, { width: 178 });
      doc.font('body').fontSize(9.6).fillColor(C.body).text(String(r[1] || ''), M + 196, yy + 8, { width: w - 208, lineGap: 1.5 });
      doc.moveTo(M, yy + rh).lineTo(M + w, yy + rh).lineWidth(0.5).strokeColor(C.line).stroke();
      yy += rh;
    });
    return yy + 18;
  };
  y = specTable('Solar PV Module', moduleRows, y);
  y = specTable('Inverter', inverterRows, y);
}

// =============================================================================
//  ORCHESTRATION
// =============================================================================
// Descriptions for the documents that may follow the proposal, for the
// dynamic Contents page.
const EXTRA_TOC = {
  quotation: { label: 'Commercial Quotation', sub: 'Priced offer, scope, payment terms & conditions' },
  boq: { label: 'Bill of Quantities', sub: 'Component-level scope & pricing' },
};

export function renderProposal(doc, data = {}, opts = {}) {
  if (!opts.shared) {
    registerFonts(doc);
    doc.page.margins.bottom = 0;
    doc.on('pageAdded', () => { doc.page.margins.bottom = 0; });
  }
  // Contents lists the selected downstream docs, then the Technical & FAQ
  // annexures that always close a proposal-inclusive package.
  const extras = (opts.parts || []).map((p) => EXTRA_TOC[p]).filter(Boolean);
  extras.push({ label: 'Your Questions, Answered', sub: 'Frequently asked questions' });

  const pages = [
    (d) => coverPage(d, data),
    (d) => tocPage(d, extras),
    (d) => confidentialityPage(d),
    (d) => leadershipPage(d, data),
    (d) => aboutPage(d),
    (d) => whyPage(d),
    (d) => servicesPage(d),
    (d) => industriesPage(d),
    (d) => clientsPage(d, data),
    (d) => trackRecordPage(d),
    (d) => testimonialsPage(d),
    (d) => recognitionPage(d),
    (d) => understandPage(d, data),
    (d) => systemDesignPage(d, data),
    (d) => howItWorksPage(d),
    (d) => netMeteringPage(d, data),
    (d) => executionPage(d),
    (d) => savingsPage(d, data),
    (d) => environmentPage(d, data),
    (d) => qualityPage(d, data),
  ];
  // FAQ + Technical + Thank-You are appended by the caller (streamParts) so they
  // land at the very end of the whole package. Standalone renders add them here.
  if (!opts.shared) {
    pages.push((d) => faqPage(d, data));
    if (!opts.skipThankYou) pages.push((d) => thankYouPage(d));
  }
  pages.forEach((fn, i) => { if (i) doc.addPage(); fn(doc); });
  return doc;
}

// Annexure closers, exported so a combined package places them at the very end.
export function renderTechnical(doc, data = {}, opts = {}) {
  if (!opts.shared) { registerFonts(doc); doc.page.margins.bottom = 0; doc.on('pageAdded', () => { doc.page.margins.bottom = 0; }); }
  technicalPage(doc, data);
  return doc;
}
export function renderFaq(doc, data = {}, opts = {}) {
  if (!opts.shared) { registerFonts(doc); doc.page.margins.bottom = 0; doc.on('pageAdded', () => { doc.page.margins.bottom = 0; }); }
  faqPage(doc, data);
  return doc;
}

// The closing Thank-You page, exported so a combined package can place it last.
// Renders on the current page — the caller adds a fresh page first.
export function renderThankYou(doc, data = {}, opts = {}) {
  if (!opts.shared) { registerFonts(doc); doc.page.margins.bottom = 0; doc.on('pageAdded', () => { doc.page.margins.bottom = 0; }); }
  thankYouPage(doc);
  return doc;
}

// The branded cover, exported so ANY document pack (quotation-only, BOQ-only…)
// can open with the same front page. Renders on the current page.
export function renderCover(doc, data = {}, opts = {}) {
  if (!opts.shared) { registerFonts(doc); doc.page.margins.bottom = 0; doc.on('pageAdded', () => { doc.page.margins.bottom = 0; }); }
  coverPage(doc, data);
  return doc;
}

// Shared brand toolkit so the Quotation & BOQ documents render in the exact
// same identity (fonts, palette, chrome, helpers) as the proposal book.
export { registerFonts };
export const KIT = {
  C, M, chrome, bleed, heading, para, panel, eyebrow, triTick,
  iconChip, icon, drawImg, logo, statBand,
  photo, press, cert, news, V, num, inr, inrShort, model, addressLines, titleCaseCover,
};

export default { renderProposal, renderThankYou, PROPOSAL_BRAND, KIT, registerFonts };
