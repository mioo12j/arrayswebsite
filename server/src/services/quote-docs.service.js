// =============================================================================
//  ARRAYS INGENIERIA — Commercial Quotation & Bill of Quantities (pdfkit)
//  Renders in the same brand identity as the proposal book (see KIT).
//  Exports renderQuotation(doc, data) and renderBOQ(doc, data), each of which
//  appends its pages to a shared doc (first page on the current page, then
//  addPage between its own pages) so they can be combined into one PDF.
// =============================================================================
import { KIT, registerFonts } from './proposal-pdf.service.js';

const { C, M, chrome, heading, para, panel, eyebrow, triTick, drawImg, logo,
        photo, V, num, inr, inrShort, addressLines, titleCaseCover, model } = KIT;

// Fixed company bank account (same for every quote) — printed in the PDF only,
// not collected in the software. Fill account_no / ifsc with the real details.
const DEFAULT_BANK = {
  bank_name: 'IDBI Bank',
  bank_branch: 'Greater Noida, Gautam Buddha Nagar',
  account_name: 'ARRAYS INGENIERIA PRIVATE LIMITED',
  account_no: '0875102000012290',
  ifsc: 'IBKL0000875',
};

// ---- shared helpers ---------------------------------------------------------
function money(n) { return n || n === 0 ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'; }

// Distribute the operator's margin across BOQ items: 40% civil, 40% installation
// & commissioning, 20% the rest — normalised over whichever buckets are present.
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

// GST split — inter-state = single IGST line; else CGST + SGST (half each).
function gstRows(c, data) {
  const pct = c.taxable ? Math.round((c.gst / c.taxable) * 10000) / 100 : 0;
  if (String(data.gst_split || '').toLowerCase() === 'igst') return [[`IGST (${pct}%)`, c.gst]];
  const half = c.gst / 2, hpct = Math.round(pct / 2 * 100) / 100;
  return [[`CGST (${hpct}%)`, half], [`SGST (${hpct}%)`, half]];
}

// Split "Title: body" into parts; no colon => body only.
function parseTitleBody(s) {
  const str = String(s).trim();
  const m = str.match(/^([^:\n]{2,44}):\s*([\s\S]+)$/);
  return m ? { title: m[1].trim(), body: m[2].trim() } : { title: '', body: str };
}
// Accept structured [{title,body}], ["Title: body"], or a newline string.
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
// Payment milestones: [{pct,stage,against}] in any common key spelling.
function normalizeSchedule(s) {
  if (!Array.isArray(s) || !s.length) return null;
  const a = s.map((p) => ({
    pct: String(p.pct ?? p.percent ?? p.percentage ?? '').replace(/%*$/, '') + '%',
    stage: String(p.stage ?? p.label ?? p.milestone ?? '').trim(),
    against: String(p.against ?? p.note ?? p.description ?? '').trim(),
  })).filter((p) => p.stage || p.against);
  return a.length ? a : null;
}

// pull a readable module / inverter description out of the BOQ line items
function hardware(items) {
  const find = (re) => (items.find((i) => re.test(String(i.item))) || {}).item;
  return {
    module: find(/panel|module|wp|mono|topcon|perc/i),
    inverter: find(/inverter/i),
    structure: find(/structure|mounting/i),
  };
}

// commercial figures, resilient to which columns are populated
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
  const perW = num(data.per_watt, 0) || (kwp ? total / (kwp * 1000) : 0);       // incl. GST
  const perWBasic = num(data.per_watt_basic, 0) || (kwp ? taxable / (kwp * 1000) : 0); // basic (what we quote on)
  return { items, subtotal, contingency, margin, taxable, gst, total, subsidy, net, kwp, perW, perWBasic };
}

function metaCard(doc, data, x, y, w) {
  const addr = (addressLines ? addressLines(data) : []);
  const rows = [
    ['Client', data.client_name || data.client_full_name || data.customer_name],
    ['Address', addr.length ? addr : null],           // array => multi-line, height adjusts
    ['Project', data.project_name || data.site_name],
    ['Capacity', num(data.capacity_kw, 0) ? num(data.capacity_kw, 0) + ' kWp' : null],
    ['Reference', data.quote_number],
    ['Date', new Date(data.issue_date || data.date || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
    ['Valid Until', data.valid_until ? new Date(data.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '30 days from issue'],
  ].filter((r) => r[1]);
  // Measure each value's real wrapped height so long addresses / project names
  // never overlap the next row. Value column starts at x+106, width w-122.
  const valW = w - 122;
  const gap = 13;                              // vertical padding between rows
  const rowH = (r) => {
    if (Array.isArray(r[1])) return r[1].length * 11;
    doc.font('uiSB').fontSize(9.5);
    return Math.max(11, doc.heightOfString(String(V(r[1])), { width: valW, lineGap: 1.5 }));
  };
  const heights = rows.map(rowH);
  let h = 12;
  heights.forEach((hh) => { h += hh + gap; });
  panel(doc, x, y, w, h, C.mint, 9, C.line);
  doc.rect(x, y, 4, h).fill(C.gold);
  let yy = y + 12;
  rows.forEach((r, i) => {
    doc.font('ui').fontSize(7.5).fillColor(C.mute).text(String(r[0]).toUpperCase(), x + 18, yy + 1, { characterSpacing: 0.8, width: 84 });
    if (Array.isArray(r[1])) {
      doc.font('uiSB').fontSize(9).fillColor(C.ink);
      r[1].forEach((ln, k) => doc.text(ln, x + 106, yy + k * 11, { width: valW }));
    } else {
      doc.font('uiSB').fontSize(9.5).fillColor(C.ink).text(V(r[1]), x + 106, yy, { width: valW, lineGap: 1.5 });
    }
    yy += heights[i] + gap;
    if (i < rows.length - 1) doc.moveTo(x + 18, yy - gap / 2).lineTo(x + w - 16, yy - gap / 2).lineWidth(0.5).strokeColor(C.line).stroke();
  });
  return y + h;
}

// =============================================================================
//  QUOTATION
// =============================================================================
export function renderQuotation(doc, data = {}, opts = {}) {
  if (!opts.shared) { registerFonts(doc); doc.page.margins.bottom = 0; doc.on('pageAdded', () => { doc.page.margins.bottom = 0; }); }
  const W = doc.page.width, w = W - 2 * M;
  const c = commercials(data);
  const hw = hardware(c.items);

  // ---- PAGE 1 — commercial summary ----
  chrome(doc, 'Commercial Quotation');
  heading(doc, 'Priced Offer', 'Commercial Quotation');
  let y = doc.y + 2;

  // left: meta card ; right: system config
  const colW = (w - 22) / 2;
  const metaBottom = metaCard(doc, data, M, y, colW);
  // system config card
  const scX = M + colW + 22;
  const titleCase = (s) => String(s).replace(/\b\w/g, (m) => m.toUpperCase());
  // operator-entered system configuration; DC capacity only shows if provided
  const dcCap = num(data.dc_capacity, 0);
  // Scope of supply — only the parts we actually provide appear on the quotation.
  // Defaults to all in-scope; the operator can drop panel / inverter / I&C.
  const scPanel = data.scope_panel !== false && String(data.scope_panel) !== 'false';
  const scInverter = data.scope_inverter !== false && String(data.scope_inverter) !== 'false';
  const cfg = [
    ...(scPanel ? [['Solar Module', data.module_config || '545 Wp Mono PERC / latest equivalent technology']] : []),
    // Panel type (DCR / Non-DCR) only shows when the operator has chosen one
    ...(scPanel && data.panel_type ? [['Panel Type', data.panel_type === 'DCR'
      ? 'DCR — Domestic Content Requirement (India-made cells & modules)'
      : data.panel_type === 'Non-DCR'
        ? 'Non-DCR — imported cells / modules permitted'
        : String(data.panel_type)]] : []),
    ...(scInverter ? [['Inverter', data.inverter_config || 'Three-phase grid-connected string inverter (as per design)']] : []),
    ...(dcCap > 0 ? [['DC Capacity', dcCap + ' kWp']] : []),
    ['Mounting (MMS)', data.mms_config || data.structure_type || 'Aluminium / GI structure suitable for rooftop'],
    ['System', data.system_config || 'Grid-connected rooftop solar system'],
    // Always stated up-front so scope is unambiguous (default: not included)
    ['Net Metering', data.net_metering === 'included' ? 'Included' : 'Not included'],
    ['Battery Backup', data.battery_backup === 'included' ? 'Included' : 'Not included'],
  ].filter((r) => r[1]);
  const cfgRowH = (r) => { doc.font('bodyM').fontSize(9.4); return Math.max(30, doc.heightOfString(String(r[1]), { width: colW - 32, lineGap: 1.5 }) + 20); };
  const cH = 34 + cfg.reduce((s, r) => s + cfgRowH(r), 0);
  panel(doc, scX, y, colW, cH, C.paper, 9, C.line);
  doc.rect(scX, y, colW, 3).fill(C.emer);
  doc.font('uiSB').fontSize(8.5).fillColor(C.emer).text('SYSTEM CONFIGURATION', scX + 16, y + 14, { characterSpacing: 1 });
  let scy = y + 34;
  cfg.forEach((r) => {
    doc.font('ui').fontSize(7.5).fillColor(C.mute).text(String(r[0]).toUpperCase(), scX + 16, scy, { characterSpacing: 0.6 });
    doc.font('bodyM').fontSize(9.4).fillColor(C.ink).text(String(r[1]), scX + 16, scy + 10, { width: colW - 32, lineGap: 1.5 });
    scy += cfgRowH(r);
  });
  y = Math.max(metaBottom, y + cH) + 18;

  // commercial offer table
  eyebrow(doc, 'Commercial Offer', M, y, C.gold); y += 18;
  const line = (label, val, opt = {}) => {
    // row height grows with the (possibly multi-line) label
    doc.font(opt.big ? 'uiSB' : 'ui').fontSize(opt.big ? 11 : 10);
    const lh = doc.heightOfString(String(label), { width: w - 230 });
    const rh = opt.big ? Math.max(40, lh + 22) : Math.max(26, lh + 14);
    if (opt.fill) panel(doc, M, y, w, rh, opt.fill, 6);
    const tv = y + (rh - lh) / 2;                    // vertically centre the text
    doc.font(opt.big ? 'uiSB' : 'ui').fontSize(opt.big ? 11 : 10).fillColor(opt.big ? '#fff' : C.body)
       .text(String(label), M + 16, tv, { width: w - 230 });
    doc.font(opt.big ? 'uiB' : 'uiSB').fontSize(opt.big ? 16 : 10.5).fillColor(opt.big ? '#fff' : (opt.accent || C.ink))
       .text(money(val), M + w - 200, y + (rh - (opt.big ? 16 : 11)) / 2, { width: 184, align: 'right' });
    if (!opt.fill && !opt.big) doc.moveTo(M, y + rh).lineTo(M + w, y + rh).lineWidth(0.5).strokeColor(C.line).stroke();
    y += rh;
  };
  // Client-facing: a single system price (never expose internal contingency/margin).
  // The offer description is operator-defined.
  // scope-aware default for the offer description (operator can override via Name of Work)
  const scInc = data.scope_inc !== false && String(data.scope_inc) !== 'false';
  const defaultOffer = scInc
    ? 'Design, Engineering, Supply, Installation, Testing & Commissioning of Solar PV System'
    : 'Design, Engineering & Supply of Solar PV System materials';
  line(data.commercial_scope || data.supply_description || defaultOffer, c.taxable);
  gstRows(c, data).forEach(([l, v]) => line(l, v));
  y += 4;
  line('Total Investment (incl. GST)', c.total, { big: true, fill: C.emer });
  y += 6;
  if (c.subsidy) { line('Less: Government Subsidy', -c.subsidy, { accent: C.emer }); }
  if (c.subsidy) { line('Net Investment After Subsidy', c.net, { big: true, fill: C.emerD }); }
  if (c.kwp && c.perWBasic) {
    y += 8;
    panel(doc, M, y, w, 34, C.cream, 8);
    doc.rect(M, y, 4, 34).fill(C.gold);
    doc.font('uiSB').fontSize(9).fillColor(C.gold).text('EFFECTIVE PRICE', M + 18, y + 13, { characterSpacing: 0.6 });
    // Basic price is what we quote on (GST is a pass-through to the government);
    // the GST-inclusive figure is shown alongside for the client's reference.
    doc.font('uiSB').fontSize(10.5).fillColor(C.ink)
       .text(`₹ ${c.perWBasic.toFixed(2)} / Watt basic`, M + 130, y + 12);
    doc.font('ui').fontSize(9).fillColor(C.mute)
       .text(`(₹ ${c.perW.toFixed(2)} / Watt incl. GST)`, M + 260, y + 13);
    y += 34;
  }
  doc.font('bodyI').fontSize(8).fillColor(C.mute)
     .text('All figures in Indian Rupees. This quotation is subject to the terms, validity and exclusions set out on the following pages.', M, y + 10, { width: w });
  y += 30;

  // The full return-on-investment detail lives on the "Payment & Returns" page;
  // the proposal book also covers it — so it is deliberately NOT repeated here.
  const mm = model(data);   // used by the Payment & Returns page below

  // page-flow guard — starts a fresh page (with chrome) when a block won't fit
  const bottom = doc.page.height - 46;
  const flowY = (yy, need) => (yy + need > bottom ? (doc.addPage(), chrome(doc, 'Commercial Quotation'), 110) : yy);

  // ---- PAGE 2 — payment schedule, returns, acceptance ----
  doc.addPage(); chrome(doc, 'Commercial Quotation');
  heading(doc, 'Terms of Business', 'Payment & Returns');
  y = doc.y + 2;

  // payment schedule — operator-defined milestones (any number)
  eyebrow(doc, 'Payment Schedule', M, y, C.gold); y += 18;
  const sched = normalizeSchedule(data.payment_schedule) || [
    { pct: '30%', stage: 'Advance', against: 'Along with the confirmed Purchase Order' },
    { pct: '60%', stage: 'On Material Readiness', against: 'Against readiness of modules, inverter & balance-of-system for dispatch (prior to delivery)' },
    { pct: '5%', stage: 'On Installation', against: 'On completion of mechanical installation at site' },
    { pct: '5%', stage: 'On Commissioning', against: 'On successful testing, commissioning & handover' },
  ];
  sched.forEach((s) => {
    doc.font('body').fontSize(9);
    const bodyH = doc.heightOfString(s.against || '', { width: w - 120, lineGap: 1.6 });
    const rh = Math.max(42, bodyH + 30);
    y = flowY(y, rh + 8);
    panel(doc, M, y, w, rh, C.mint, 8, C.line);
    doc.rect(M, y, 4, rh).fill(C.gold);
    doc.font('uiB').fontSize(19).fillColor(C.emer).text(s.pct, M + 16, y + (rh - 19) / 2, { width: 66 });
    doc.font('uiSB').fontSize(10.5).fillColor(C.ink).text(s.stage, M + 92, y + 10, { width: w - 108 });
    doc.font('body').fontSize(9).fillColor(C.body).text(s.against, M + 92, y + 25, { width: w - 108, lineGap: 1.6 });
    y += rh + 8;
  });
  y += 6;   // the PI payment-method note is stated once, on the terms page

  // return on investment + disclaimer
  y = flowY(y, 120);
  eyebrow(doc, 'Your Return on Investment', M, y, C.gold); y += 18;
  const roi = [
    ['Annual Savings', inrShort(mm.save1), C.emer],
    ['Payback Period', mm.paybackYrs.toFixed(1) + ' yrs', C.gold],
    ['25-Year Savings', inrShort(mm.cum25), C.emerM],
    ['Net Investment', inrShort(mm.netInvest), C.navy],
  ];
  const rw = (w - 3 * 12) / 4;
  roi.forEach((r, i) => {
    const x = M + i * (rw + 12);
    panel(doc, x, y, rw, 62, C.paper, 9, C.line);
    doc.rect(x, y, 4, 62).fill(r[2]);
    doc.font('ui').fontSize(7.3).fillColor(C.mute).text(String(r[0]).toUpperCase(), x + 14, y + 12, { characterSpacing: 0.5 });
    doc.font('uiB').fontSize(15).fillColor(C.ink).text(r[1], x + 14, y + 27);
  });
  y += 62 + 8;
  doc.font('bodyI').fontSize(7.6).fillColor(C.mute)
     .text(`Indicative only — calculated at ₹${mm.tariff}/unit with ~${Math.round(mm.gen1).toLocaleString('en-IN')} units/year (3.5% tariff escalation, 0.6%/yr degradation). Not a guarantee; actual savings vary with consumption, weather, tariff revisions and DISCOM policy.`, M, y, { width: w, lineGap: 1.5 });
  y = doc.y + 14;

  // scope of work (Arrays + client) — the only place scope appears
  y = scopeAndExclusions(doc, data, y, flowY);

  // extra technical requirements / notes (operator-entered), after exclusions
  if (data.notes && String(data.notes).trim()) {
    y = flowY(y + 4, 70);
    eyebrow(doc, 'Extra Technical Requirements / Notes', M, y, C.gold); y += 16;
    doc.font('body').fontSize(9.4);
    const nH = doc.heightOfString(String(data.notes), { width: w - 36, lineGap: 2.6 }) + 22;
    y = flowY(y, nH);
    panel(doc, M, y, w, nH, C.mint, 9, C.line);
    doc.rect(M, y, 4, nH).fill(C.emer);
    doc.font('body').fontSize(9.4).fillColor(C.body).text(String(data.notes), M + 16, y + 12, { width: w - 36, lineGap: 2.6 });
    y += nH + 8;
  }

  // ---- Terms, then payment/bank details, then client acceptance ----
  // Flow straight after the exclusions (new page only if it won't fit) so we
  // never leave a near-empty page between the two.
  y = flowY(y + 18, 150);
  y = heading(doc, 'Please Read Carefully', 'Terms & Conditions', { y }) + 2;
  const terms = normalizeTerms(data.terms) || defaultTerms();
  terms.forEach((t) => {
    doc.font('body').fontSize(9.2);
    const bodyH = doc.heightOfString(t.body, { width: w - 24, lineGap: 2.6 });
    const need = (t.title ? 15 : 0) + bodyH + 12;
    y = flowY(y, need);
    doc.circle(M + 4, y + 6, 2.4).fill(C.gold);
    if (t.title) { doc.font('uiSB').fontSize(9.8).fillColor(C.ink).text(t.title, M + 18, y, { width: w - 24 }); y = doc.y + 2; }
    doc.font('body').fontSize(9.2).fillColor(C.body).text(t.body, M + 18, y, { width: w - 24, lineGap: 2.6 });
    y = doc.y + 9;
  });

  // payment & company details + payment method + the client acceptance are kept
  // together as one "commercial & signing" block — break to a fresh page if the
  // whole set won't fit, rather than splitting it or leaving a near-empty page.
  y = flowY(y + 10, 330);
  y = companyBankBlock(doc, data, y, flowY);

  // client acceptance signature — room to sign, seal & fill details
  y = flowY(y + 12, 128);
  const sw = (w - 24) / 2;
  const clientNm2 = data.client_name || data.client_full_name || data.customer_name || 'the Client';
  doc.font('uiSB').fontSize(8.5).fillColor(C.gold).text('ACCEPTED BY THE CLIENT', M, y, { characterSpacing: 0.8 });
  doc.font('body').fontSize(9).fillColor(C.body).text('We have read and accept the scope, pricing and terms set out in this quotation.', M, y + 14, { width: sw - 10 });
  // right column — "For <client>", open space to sign & stamp, then labelled blanks
  const sigX = M + w - sw, sigW = sw;
  doc.font('bodyI').fontSize(10.5).fillColor(C.ink).text(`For ${clientNm2}`, sigX, y + 4);
  const fieldLine = (lx, lw, yy, label) => {
    doc.moveTo(lx, yy).lineTo(lx + lw, yy).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.font('ui').fontSize(7).fillColor(C.mute).text(String(label).toUpperCase(), lx, yy + 3, { characterSpacing: 0.5 });
  };
  // blank band for the physical signature + company seal
  const sigY = y + 62;
  doc.moveTo(sigX, sigY).lineTo(sigX + sigW, sigY).lineWidth(0.8).strokeColor(C.ink).stroke();
  doc.font('ui').fontSize(7.5).fillColor(C.mute).text('AUTHORISED SIGNATORY  ·  SIGN & COMPANY SEAL', sigX, sigY + 4, { characterSpacing: 0.4 });
  // Name / Designation / Date blanks below the signature
  const sigCol = (sigW - 12) / 2;
  fieldLine(sigX, sigCol, sigY + 30, 'Name');
  fieldLine(sigX + sigCol + 12, sigCol, sigY + 30, 'Designation');
  fieldLine(sigX, sigCol, sigY + 54, 'Date');
  fieldLine(sigX + sigCol + 12, sigCol, sigY + 54, 'Place');
  y = sigY + 66;

  autoGenNote(doc, Math.min(y + 8, doc.page.height - 54), 'quotation');

  return doc;
}

// Default, PI-centric terms (used until the operator supplies their own).
function defaultTerms() {
  // Payment terms, delay-interest, scope and warranty details are stated in their
  // own sections (Payment Schedule, Bank details, Scope of Work, Warranty), so
  // they are deliberately NOT repeated here to avoid contradiction.
  return [
    { title: 'GST & Taxes', body: 'GST is charged extra at prevailing rates as applicable on the date of invoicing, over and above the quoted value.' },
    { title: 'Warranty', body: 'Solar modules and inverter carry the respective manufacturer / brand warranty and are supplied as per the requirement of the client.' },
    { title: 'Delivery & Timeline', body: 'Delivery and commissioning commence from receipt of the advance, a technically clear order and continuous unobstructed access to a ready site.' },
    { title: 'Insurance', body: 'Transit and erection-all-risk cover, where required, is arranged at actuals. The client shall insure the plant after handover.' },
    { title: 'Force Majeure', body: 'Neither party shall be liable for delay or non-performance due to events beyond reasonable control — weather, strikes, regulatory change, grid unavailability or acts of God.' },
    { title: 'Jurisdiction & Confidentiality', body: 'This quotation is confidential, remains our property, and any dispute is subject to the jurisdiction of the courts at our registered office.' },
  ];
}

// Scope of Work (Arrays + client) followed by Exclusions — rendered inside the
// Commercial Quotation. This is the only place scope appears.
function scopeAndExclusions(doc, data, y, flowY) {
  const W = doc.page.width, w = W - 2 * M;
  const ours = asList(data.scope_ours) || [
    'Design, engineering, drawings & single-line diagram (SLD)',
    'Supply of solar modules, inverter & balance-of-system as per client requirement',
    'Module mounting structure, DC/AC cabling, earthing & lightning protection',
    'Installation, testing & commissioning',
    'DISCOM liaison & net-metering application',
    'Datasheets, test certificates & O&M orientation',
  ];
  const clientScope = asList(data.scope_client) || [
    'Clear, secure, shadow-free site with structural adequacy',
    'Construction power & water and safe storage at site',
    'Sanctioned load details, latest electricity bill & KYC',
    'DISCOM deposits, feasibility & statutory fees (at actuals)',
    'Timely release of payments as per the agreed schedule',
  ];
  const colW = (w - 16) / 2;
  const measure = (list) => { let h = 42; list.forEach((t) => { doc.font('body').fontSize(9); h += Math.max(18, doc.heightOfString(t, { width: colW - 52, lineGap: 1.8 }) + 10); }); return h; };
  const scopeH = Math.max(measure(ours), measure(clientScope));
  y = flowY(y, scopeH + 40);
  eyebrow(doc, 'Scope of Work', M, y, C.gold); y += 16;
  const col = (x, title, list, accent, chip) => {
    panel(doc, x, y, colW, scopeH, C.paper, 10, C.line);
    doc.save().roundedRect(x, y, colW, 30, 10).fill(accent).restore();
    doc.rect(x, y + 20, colW, 10).fill(accent);
    doc.font('uiSB').fontSize(10).fillColor('#ffffff').text(title, x + 14, y + 9, { width: colW - 28 });
    let yy = y + 40;
    list.forEach((t) => {
      doc.save().roundedRect(x + 12, yy, 14, 14, 4).fill(chip).restore();
      doc.save().lineWidth(1.5).strokeColor(accent).moveTo(x + 15.5, yy + 7).lineTo(x + 18.5, yy + 10).lineTo(x + 23, yy + 3.5).stroke().restore();
      const h = doc.font('body').fontSize(9).heightOfString(t, { width: colW - 52, lineGap: 1.8 });
      doc.font('body').fontSize(9).fillColor(C.body).text(t, x + 34, yy, { width: colW - 52, lineGap: 1.8 });
      yy += Math.max(18, h + 10);
    });
  };
  col(M, 'Arrays Ingenieria Scope', ours, C.emer, C.mint2);
  col(M + colW + 16, 'Client Scope', clientScope, C.gold, C.cream);
  y += scopeH + 14;

  const exc = asList(data.exclusions) || [
    'Anything not expressly listed under our Scope of Work, or agreed by us in writing, is deemed to be in the client’s scope and is chargeable at actuals.',
    'DISCOM deposits, metering charges, feasibility and any statutory / approval fees are at actuals.',
  ];
  doc.font('body').fontSize(9);
  const excBody = 30 + exc.reduce((s, e) => s + Math.max(14, doc.heightOfString('•  ' + e, { width: w - 36 })) + 4, 0);
  y = flowY(y, excBody);
  panel(doc, M, y, w, excBody, C.mint, 9, C.line);
  doc.rect(M, y, 4, excBody).fill(C.emer);
  doc.font('uiSB').fontSize(8.5).fillColor(C.emer).text('EXCLUSIONS', M + 18, y + 12, { characterSpacing: 1 });
  let ey = y + 28;
  exc.forEach((e) => { doc.font('body').fontSize(9).fillColor(C.body).text('•  ' + e, M + 18, ey, { width: w - 36 }); ey = doc.y + 4; });
  return y + excBody + 12;
}

// GST / bank / delay-payment block on the last quotation page.
function companyBankBlock(doc, data, y, flowY) {
  const W = doc.page.width, w = W - 2 * M;
  y = flowY(y, 210);
  eyebrow(doc, 'Payment & Company Details', M, y, C.gold); y += 16;
  const colW = (w - 16) / 2, bh = 130;
  // left — company / GST
  panel(doc, M, y, colW, bh, C.paper, 9, C.line);
  doc.rect(M, y, colW, 3).fill(C.gold);
  doc.font('uiSB').fontSize(8).fillColor(C.emer).text('SUPPLIER', M + 14, y + 12, { characterSpacing: 0.8 });
  const supplierRows = [
    ['Company', data.company_name || 'Arrays Ingenieria Pvt. Ltd.'],
    ['GSTIN', data.company_gstin || '—'],
    ['Office', [data.office_name, data.office_place].filter(Boolean).join(' · ') || '—'],
  ];
  let ly = y + 28;
  supplierRows.forEach((r) => {
    doc.font('ui').fontSize(7.2).fillColor(C.mute).text(String(r[0]).toUpperCase(), M + 14, ly, { characterSpacing: 0.5 });
    doc.font('uiSB').fontSize(9).fillColor(C.ink).text(String(r[1]), M + 14, ly + 9, { width: colW - 28 });
    ly = doc.y + 4;
  });
  // right — bank
  const bx = M + colW + 16;
  panel(doc, bx, y, colW, bh, C.paper, 9, C.line);
  doc.rect(bx, y, colW, 3).fill(C.emer);
  doc.font('uiSB').fontSize(8).fillColor(C.emer).text('BANK DETAILS FOR PAYMENT', bx + 14, y + 12, { characterSpacing: 0.8 });
  const bankRows = [
    ['Bank / Branch', [DEFAULT_BANK.bank_name, DEFAULT_BANK.bank_branch].filter(Boolean).join(', ') || '—'],
    ['Account Name', DEFAULT_BANK.account_name],
    ['Account No.', DEFAULT_BANK.account_no || '—'],
    ['IFSC', DEFAULT_BANK.ifsc || '—'],
  ];
  let by = y + 28;
  bankRows.forEach((r) => {
    doc.font('ui').fontSize(7.2).fillColor(C.mute).text(String(r[0]).toUpperCase(), bx + 14, by, { characterSpacing: 0.5 });
    doc.font('uiSB').fontSize(9).fillColor(C.ink).text(String(r[1]), bx + 14, by + 9, { width: colW - 28 });
    by = doc.y + 4;
  });
  y += bh + 10;
  // payment-method note — the key commercial condition (box grows to fit)
  const pmText = `Payment is credited only against our Proforma Invoice. No GST tax invoice is issued until the payment is received in our account. Delay beyond the due date attracts interest at ${data.delay_interest || '18% per annum'}.`;
  doc.font('body').fontSize(9);
  const pmH = doc.heightOfString(pmText, { width: w - 32, lineGap: 1.5 }) + 34;
  panel(doc, M, y, w, pmH, C.cream, 8);
  doc.rect(M, y, 4, pmH).fill(C.gold);
  doc.font('uiSB').fontSize(8).fillColor(C.gold).text('PAYMENT METHOD', M + 16, y + 11, { characterSpacing: 0.8 });
  doc.font('body').fontSize(9).fillColor(C.body).text(pmText, M + 16, y + 23, { width: w - 32, lineGap: 1.5 });
  return y + pmH + 6;
}

// A small closing notice for standalone transactional documents.
function autoGenNote(doc, y, kind = 'document') {
  const W = doc.page.width, w = W - 2 * M;
  if (y > doc.page.height - 60) y = doc.page.height - 60;
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.5).strokeColor(C.line).stroke();
  doc.font('ui').fontSize(7).fillColor(C.mute)
     .text(`This is a computer-generated ${kind} produced by the Arrays Ingenieria system and is valid without a physical signature. Figures are indicative and subject to the terms stated herein.`,
           M, y + 6, { width: w, align: 'center', lineGap: 1.3 });
}

// =============================================================================
//  BILL OF QUANTITIES
// =============================================================================
export function renderBOQ(doc, data = {}, opts = {}) {
  if (!opts.shared) { registerFonts(doc); doc.page.margins.bottom = 0; doc.on('pageAdded', () => { doc.page.margins.bottom = 0; }); }
  const W = doc.page.width, w = W - 2 * M;
  const c = commercials(data);

  chrome(doc, 'Bill of Quantities');
  heading(doc, 'Detailed Scope', 'Bill of Quantities');
  para(doc, `A component-level breakdown for the proposed ${c.kwp ? c.kwp + ' kWp ' : ''}grid-connected solar PV system — every item, quantity and rate, in full transparency.`, M, doc.y, w, { size: 10.4 });
  let y = doc.y + 14;

  // column geometry
  const cNo = M + 8, cDesc = M + 40, cUnit = M + w - 250, cQty = M + w - 190, cRate = M + w - 120, cAmt = M + w - 6;
  const headerRow = (yy) => {
    panel(doc, M, yy, w, 24, C.emer, 5);
    doc.font('uiSB').fontSize(8).fillColor('#fff');
    doc.text('#', cNo, yy + 8);
    doc.text('DESCRIPTION', cDesc, yy + 8);
    doc.text('UNIT', cUnit, yy + 8, { width: 50 });
    doc.text('QTY', cQty, yy + 8, { width: 56, align: 'right' });
    doc.text('RATE', cRate, yy + 8, { width: 56, align: 'right' });
    doc.text('AMOUNT', cAmt - 90, yy + 8, { width: 90, align: 'right' });
    return yy + 24;
  };
  y = headerRow(y);

  // Client-facing prices: distribute the operator's margin into each item's rate
  // (never shown as a line) — 40% to civil, 40% to installation & commissioning,
  // 20% across the rest, with graceful fallback when a category is absent.
  const rawItems = c.items.length ? c.items : null;
  const items = rawItems || [{ item: 'Complete Solar PV System — Supply, Installation & Commissioning', qty: 1, unit: 'Lot', rate: c.taxable, amount: c.taxable }];
  // New calc engine already folds the margin into each line's amount/rate. Only
  // old saved quotes (where the line amounts still sum to the pre-margin subtotal)
  // need the margin distributed here — detect that and fall back gracefully.
  const itemsSum = items.reduce((s, i) => s + num(i.amount, 0), 0);
  const needMargin = rawItems && c.taxable > 0 && itemsSum < c.taxable - 1;
  const margin = needMargin ? Math.max(0, (c.taxable || 0) - (c.subtotal || 0)) : 0;
  const alloc = distributeMargin(items, margin);
  items.forEach((it, i) => {
    // measure description height
    doc.font('bodyM').fontSize(9.6);
    const descH = doc.heightOfString(String(it.item || '—'), { width: cUnit - cDesc - 10, lineGap: 1.5 });
    const rh = Math.max(30, descH + 16);
    if (y + rh > 792) { doc.addPage(); chrome(doc, 'Bill of Quantities'); y = headerRow(100); }
    if (i % 2) doc.save().rect(M, y, w, rh).fill(C.mint).restore();
    const qtyD = num(it.qty, 0) || 1;
    const dispAmount = num(it.amount, 0) + (alloc.get(it) || 0);
    const dispRate = dispAmount / qtyD;
    doc.font('uiSB').fontSize(9).fillColor(C.gold).text(String(i + 1), cNo, y + 9, { width: 24 });
    doc.font('bodyM').fontSize(9.6).fillColor(C.ink).text(String(it.item || '—'), cDesc, y + 8, { width: cUnit - cDesc - 10, lineGap: 1.5 });
    doc.font('ui').fontSize(9).fillColor(C.mute).text(V(it.unit, '—'), cUnit, y + 9, { width: 50 });
    doc.font('ui').fontSize(9).fillColor(C.body).text(num(it.qty, 0).toLocaleString('en-IN'), cQty, y + 9, { width: 56, align: 'right' });
    doc.font('ui').fontSize(9).fillColor(C.body).text(money(dispRate), cRate, y + 9, { width: 56, align: 'right' });
    doc.font('uiSB').fontSize(9.4).fillColor(C.ink).text(money(dispAmount), cAmt - 90, y + 9, { width: 90, align: 'right' });
    doc.moveTo(M, y + rh).lineTo(M + w, y + rh).lineWidth(0.5).strokeColor(C.line).stroke();
    y += rh;
  });

  // totals
  y += 8;
  const totRow = (label, val, fill) => {
    const rh = fill ? 34 : 24;
    if (fill) panel(doc, M + w - 300, y, 300, rh, fill, 6);
    doc.font(fill ? 'uiSB' : 'ui').fontSize(fill ? 10.5 : 9.6).fillColor(fill ? '#fff' : C.body)
       .text(label, M + w - 288, y + (fill ? 11 : 6), { width: 150 });
    doc.font('uiB').fontSize(fill ? 14 : 10).fillColor(fill ? '#fff' : C.ink)
       .text(money(val), M + w - 130, y + (fill ? 10 : 6), { width: 120, align: 'right' });
    y += rh + 4;
  };
  if (y + 120 > 792) { doc.addPage(); chrome(doc, 'Bill of Quantities'); y = 110; }
  totRow('Sub-Total (before GST)', c.taxable);
  gstRows(c, data).forEach(([l, v]) => totRow(l, v));
  totRow('Grand Total (incl. GST)', c.total, C.emer);

  doc.font('bodyI').fontSize(8).fillColor(C.mute)
     .text('Quantities, makes and specifications are as per the requirement of the client. Errors & omissions excepted.', M, Math.min(y + 6, 792), { width: w });
  autoGenNote(doc, Math.min(y + 24, doc.page.height - 54), 'bill of quantities');
  return doc;
}

// =============================================================================
//  SCOPE OF WORK  (responsibilities — ours vs the client's)
//  Operator can override via data.scope_ours / data.scope_client (arrays or
//  newline-separated strings); otherwise a comprehensive default is used.
// =============================================================================
function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (v && String(v).trim()) return String(v).split(/\n+/).map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  return null;
}

export function renderScope(doc, data = {}, opts = {}) {
  if (!opts.shared) { registerFonts(doc); doc.page.margins.bottom = 0; doc.on('pageAdded', () => { doc.page.margins.bottom = 0; }); }
  const W = doc.page.width, w = W - 2 * M;
  const c = commercials(data);

  chrome(doc, 'Scope of Work');
  heading(doc, 'Responsibilities, Defined', 'Scope of Work');
  para(doc, `A clear division of responsibilities for the ${c.kwp ? c.kwp + ' kWp ' : ''}solar power plant — what Arrays Ingenieria delivers, and what we request from you — so there are no surprises on site.`, M, doc.y, w, { size: 10.4 });
  let y = doc.y + 16;

  const ours = asList(data.scope_ours) || [
    'Detailed engineering, structural & electrical design and shop drawings',
    'Geo-technical survey, shadow analysis and system sizing',
    'Supply of Tier-1 modules, inverters and BIS-grade balance-of-system',
    'Hydraulic piling, RCC foundations and hot-dip galvanised mounting structures',
    'Module mounting, DC/AC cabling, earthing and lightning protection',
    'LT/HT works, inverter & metering panel installation and terminations',
    'DISCOM liaison, net-metering application and inspection coordination',
    'Testing, grid synchronisation, commissioning and performance demonstration',
    'As-built documentation, O&M manuals and operator orientation',
    'Safety management to ISO 45001 throughout execution',
  ];
  const client = asList(data.scope_client) || [
    'Clear, secure and continuous access to a ready, level site',
    'Shadow-free installation area (roof or land) with structural adequacy',
    'Construction power and water at site free of cost',
    'Safe covered storage space for materials and equipment',
    'Statutory space and provision for inverters, panels and metering',
    'Sanctioned load details, latest electricity bill and KYC documents',
    'Any internal approvals, society/landlord NOCs or permissions',
    'DISCOM deposits, feasibility charges and statutory fees (at actuals)',
    'Timely release of payments as per the agreed schedule',
    'Insurance of the commissioned plant post-handover',
  ];

  const colW = (w - 20) / 2;
  const drawCol = (x, title, list, accent, chip) => {
    const rowH = (t) => { doc.font('body').fontSize(9.4); return doc.heightOfString(t, { width: colW - 52, lineGap: 2 }) + 12; };
    let total = 44; list.forEach((t) => { total += rowH(t); });
    panel(doc, x, y, colW, total, C.paper, 10, C.line);
    doc.roundedRect(x, y, colW, 34, 10).fill(accent);
    doc.rect(x, y + 24, colW, 10).fill(accent);
    doc.font('uiSB').fontSize(11).fillColor('#ffffff').text(title, x + 16, y + 11, { width: colW - 32 });
    let yy = y + 44;
    list.forEach((t) => {
      // check-mark chip
      doc.save().roundedRect(x + 14, yy, 16, 16, 4).fill(chip).restore();
      doc.save().lineWidth(1.6).strokeColor(accent)
         .moveTo(x + 18, yy + 8).lineTo(x + 21.5, yy + 11.5).lineTo(x + 26, yy + 5).stroke().restore();
      const h = rowH(t);
      doc.font('body').fontSize(9.4).fillColor(C.body).text(t, x + 40, yy + 1, { width: colW - 52, lineGap: 2 });
      yy += h;
    });
    return y + total;
  };
  const b1 = drawCol(M, 'Arrays Ingenieria Scope', ours, C.emer, C.mint2);
  const b2 = drawCol(M + colW + 20, 'Client Scope', client, C.gold, C.cream);
  y = Math.max(b1, b2) + 16;

  if (y < 760) {
    panel(doc, M, y, w, Math.min(48, 790 - y), C.mint, 9, C.line);
    doc.rect(M, y, 4, Math.min(48, 790 - y)).fill(C.emer);
    doc.font('bodyI').fontSize(9.5).fillColor(C.body)
       .text('Anything not expressly listed under Arrays Ingenieria Scope is deemed to be in the Client Scope or chargeable at actuals. This division may be tailored to your project by mutual written agreement.', M + 18, y + 12, { width: w - 36, lineGap: 2.5 });
    y += Math.min(48, 790 - y);
  }
  autoGenNote(doc, Math.min(y + 16, doc.page.height - 54), 'scope of work');
  return doc;
}

export default { renderQuotation, renderBOQ, renderScope };
