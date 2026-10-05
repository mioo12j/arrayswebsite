// ============================================================================
//  GST demo / showcase data seeder.  Run:  npm run gst:demo
//  Drives the real services so version history, audit log and the activity feed
//  populate naturally — the system looks actively used, no empty screens.
// ============================================================================

import fs from 'node:fs';
import { pool, withTransaction } from '../config/db.js';
import { gstinCheckDigit } from '../services/gst/validation.js';
import { generateBrandingAssets } from '../../scripts/gen-branding.js';
import { UPLOAD_ROOT } from '../middleware/upload.js';
import path from 'node:path';
import * as branches from '../services/gst/branchService.js';
import * as series from '../services/gst/seriesService.js';
import * as einv from '../services/gst/einvoiceService.js';
import * as ewb from '../services/gst/ewbService.js';
import * as comments from '../services/gst/commentService.js';
import * as views from '../services/gst/savedViewService.js';
import * as schedules from '../services/gst/scheduleService.js';
import * as backups from '../services/gst/backupService.js';
import * as branding from '../services/gst/brandingService.js';

const log = (...a) => console.log('[gst-demo]', ...a);
const hasAsset = (name) => (fs.existsSync(path.join(UPLOAD_ROOT, name)) ? name : undefined);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const mkGstin = (state, pan, entity = '1') => { const base = `${state}${pan}${entity}Z`; return base + gstinCheckDigit(base); };

const SELLER = { gstin: '10AARCA4610L1ZT', legalName: 'ARRAYS INGENIERIA PRIVATE LIMITED', tradeName: 'INGENIERIA', addr1: 'Vill Harpur, Kaluahi', location: 'Madhubani', pincode: '847229', stateCode: '10', email: 'arraysingenieria@gmail.com', phone: '9876543210' };

const CUSTOMERS = [
  { name: 'Tata Power Solar Systems Ltd', state: '29', pan: 'AAGCB7383J', place: 'Bengaluru', pin: '560001' },
  { name: 'Adani Green Energy Ltd', state: '24', pan: 'AAACA4682Q', place: 'Ahmedabad', pin: '380001' },
  { name: 'Reliance Industries Ltd', state: '27', pan: 'AAACR5055K', place: 'Mumbai', pin: '400001' },
  { name: 'NTPC Limited', state: '09', pan: 'AAACN0255D', place: 'Noida', pin: '201301' },
  { name: 'Jaypee Infratech Ltd', state: '33', pan: 'AAACJ6877P', place: 'Chennai', pin: '600001' },
  { name: 'Super Smelters Ltd', state: '19', pan: 'AAGCS9201H', place: 'Kolkata', pin: '700001' },
];

const PRODUCTS = [
  { description: 'Solar PV Module 540W Mono-PERC', hsn: '854143', rate: 12000 },
  { description: 'Solar Inverter 50kW (string)', hsn: '850440', rate: 185000 },
  { description: 'Module Mounting Structure (galvanised)', hsn: '730890', rate: 4500 },
  { description: 'DC Cable 4 sq.mm (per 100m)', hsn: '854442', rate: 6200 },
  { description: 'EPC Installation & Commissioning Service', hsn: '995461', rate: 90000 },
];

function buildInvoice(cust, branchId, dateStr, nItems = 3) {
  const items = Array.from({ length: nItems }, (_, i) => {
    const p = PRODUCTS[(i + cust.state.charCodeAt(1)) % PRODUCTS.length];
    const qty = 5 + ((i * 7) % 20);
    const taxable = qty * p.rate;
    const igst = taxable * 0.18;
    return { slNo: i + 1, description: p.description, isService: p.hsn.startsWith('99') ? 'Y' : 'N', hsn: p.hsn, quantity: p.hsn.startsWith('99') ? 1 : qty, unit: p.hsn.startsWith('99') ? 'OTH' : 'NOS', unitPrice: p.rate, taxableValue: taxable, gstRate: 18, igstAmount: igst, totalItemValue: taxable + igst };
  });
  const assess = items.reduce((s, it) => s + it.taxableValue, 0);
  const igst = items.reduce((s, it) => s + it.igstAmount, 0);
  return {
    supplyType: 'B2B', docType: 'INV', docDate: dateStr, branchId,
    seller: SELLER,
    buyer: { gstin: mkGstin(cust.state, cust.pan), legalName: cust.name, tradeName: cust.name, pos: cust.state, addr1: cust.place, location: cust.place, pincode: cust.pin, stateCode: cust.state },
    items, val: { assessableValue: assess, igstValue: igst, cgstValue: 0, sgstValue: 0, totalInvoiceValue: assess + igst },
  };
}

async function main() {
  const userId = (await pool.query("SELECT id FROM users WHERE email IN ('editor','admin') ORDER BY (email='editor') DESC LIMIT 1")).rows[0]?.id;
  if (!userId) throw new Error('No editor/admin user found — run npm run seed first.');

  log('generating branding image assets (logo, stamp, signature)…');
  generateBrandingAssets({ silent: true });

  log('ensuring branches + series + branding…');
  await withTransaction((db) => branches.ensureDefault(db));
  await withTransaction((db) => series.ensureDefault(db));
  // a second + third branch for multi-GSTIN realism
  for (const b of [
    { code: 'BR02', name: 'Pune Branch', gstin: mkGstin('27', 'AAPFU0939F'), legalName: 'ARRAYS INGENIERIA — PUNE', stateCode: '27', place: 'Pune', pincode: '411001' },
    { code: 'BR03', name: 'Chennai Branch', gstin: mkGstin('33', 'AAACJ6877P'), legalName: 'ARRAYS INGENIERIA — CHENNAI', stateCode: '33', place: 'Chennai', pincode: '600001' },
  ]) {
    try { await withTransaction((db) => branches.create(db, b, userId)); } catch { /* exists */ }
  }
  const branchList = await branches.list(pool);
  const HO = branchList.find((x) => x.is_default)?.id || branchList[0].id;

  await withTransaction((db) => branding.set(db, {
    headerText: 'ARRAYS INGENIERIA PVT LTD',
    footerText: 'ARRAYS INGENIERIA PVT LTD • Engineering Excellence in Renewable Energy • arraysingenieria@gmail.com',
    contactInfo: 'arraysingenieria@gmail.com • +91 98765 43210',
    terms: 'Payment due within 30 days of invoice date. Goods once sold will not be taken back. Interest @18% p.a. on delayed payments. Subject to Madhubani jurisdiction.',
    disclaimer: 'This is a digitally generated, IRP-registered tax invoice and does not require a physical signature. E. & O. E.',
    watermark: 'ORIGINAL',
    logoFile: hasAsset('demo-logo.png'),
    stampFile: hasAsset('demo-stamp.png'),
    signatureFile: hasAsset('demo-signature.png'),
  }, userId));

  log('creating e-invoices…');
  const made = [];
  for (let i = 0; i < CUSTOMERS.length + 4; i++) {
    const cust = CUSTOMERS[i % CUSTOMERS.length];
    const branchId = [HO, branchList[1]?.id || HO, branchList[2]?.id || HO][i % 3];
    const body = buildInvoice(cust, branchId, daysAgo(50 - i * 3), 2 + (i % 3));
    const rec = await withTransaction((db) => einv.createDraft(db, body, userId));
    made.push({ id: rec.id, i });
  }

  // status spread: submit IRN for most, print some, validate-only a couple, cancel one, leave drafts
  for (const { id, i } of made) {
    try {
      if (i % 5 === 0) continue;                         // leave as draft
      await withTransaction((db) => einv.validate(db, id, userId, {}));
      if (i % 5 === 1) continue;                         // validated only
      const sub = await withTransaction((db) => einv.submit(db, id, userId, {}));
      if (sub?.irn && i % 3 !== 2) await withTransaction((db) => einv.markPrinted(db, id, userId));
      if (i === 3) await withTransaction((db) => einv.cancel(db, id, { reasonCode: '2', remark: 'Order revised by customer' }, userId));
    } catch (e) { log('  einvoice', i, 'step skipped:', e.message); }
  }

  // edit one to create extra version history
  try { const t = made[2]; const b = buildInvoice(CUSTOMERS[2], HO, daysAgo(44), 4); /* won't apply if locked */ await withTransaction((db) => einv.updateDraft(db, t.id, { ...b, changeReason: 'Added installation line' }, userId)); } catch { /* locked */ }

  log('creating e-way bills…');
  const irnInvoices = (await pool.query("SELECT id FROM gst_einvoices WHERE irn IS NOT NULL AND NOT is_cancelled ORDER BY created_at DESC LIMIT 4")).rows;
  let k = 0;
  for (const inv of irnInvoices) {
    try {
      const partB = k % 3 !== 2; // one left as Part-A pending
      const ewbDraft = await withTransaction((db) => ewb.fromEInvoice(db, inv.id, partB ? { transDistance: 200 + k * 350, transMode: '1', vehicleNo: ['MH12AB1234', 'KA01CD5678', 'TN09EF4321', 'GJ05GH8765'][k % 4], vehicleType: 'R', transporterName: ['VRL Logistics', 'TCI Express', 'Safexpress'][k % 3] } : { transDistance: 150 }, userId));
      const gen = await withTransaction((db) => ewb.generate(db, ewbDraft.id, userId, {}));
      if (k === 1 && gen?.ewbNo) await withTransaction((db) => ewb.cancel(db, ewbDraft.id, { reasonCode: '2', remark: 'Vehicle changed' }, userId));
      k++;
    } catch (e) { log('  ewb skipped:', e.message); }
  }
  // a plain EWB draft
  try {
    const cust = CUSTOMERS[1];
    await withTransaction((db) => ewb.createDraft(db, {
      supplyType: 'O', subSupplyType: '1', docType: 'INV', docNo: 'MAN/EWB/01', docDate: daysAgo(2), transactionType: 1,
      fromGstin: SELLER.gstin, fromTradeName: SELLER.tradeName, fromPlace: 'Madhubani', fromPincode: '847229', fromStateCode: '10',
      toGstin: mkGstin(cust.state, cust.pan), toTradeName: cust.name, toPlace: cust.place, toPincode: cust.pin, toStateCode: cust.state,
      totInvValue: 250000, totalTaxable: 211864, transDistance: 0,
      items: [{ description: 'Solar PV Module 540W', hsn: '854143', quantity: 18, unit: 'NOS', taxableAmount: 211864 }],
    }, userId));
  } catch (e) { log('  manual ewb skipped:', e.message); }

  log('adding discussions, saved views, schedule, backup…');
  for (const inv of irnInvoices.slice(0, 2)) {
    try {
      await withTransaction((db) => comments.add(db, { objectType: 'einvoice', objectId: inv.id, kind: 'approval', content: 'Reviewed and approved for submission. Tax values reconcile.' }, userId));
      await withTransaction((db) => comments.add(db, { objectType: 'einvoice', objectId: inv.id, kind: 'internal', content: 'Customer requested PDF copy — sent. @System Admin please confirm receipt.' }, userId));
    } catch { /* */ }
  }
  for (const v of [
    { name: 'My Drafts', objectType: 'einvoice', filters: { status: 'draft' }, isPinned: true },
    { name: 'IRN Generated', objectType: 'einvoice', filters: { status: 'irn_generated' } },
    { name: 'Cancelled', objectType: 'einvoice', filters: { status: 'cancelled' }, scope: 'team' },
    { name: 'Generated EWBs', objectType: 'ewb', filters: { status: 'generated' } },
  ]) { try { await withTransaction((db) => views.create(db, v, userId)); } catch { /* */ } }

  try { await withTransaction((db) => schedules.create(db, { reportType: 'gst-summary', frequency: 'monthly', format: 'xlsx' }, userId)); } catch { /* */ }
  try { await withTransaction((db) => schedules.create(db, { reportType: 'ewb-validity', frequency: 'weekly', format: 'csv' }, userId)); } catch { /* */ }
  try { const b = await withTransaction((db) => backups.create(db, { kind: 'manual' }, userId)); await withTransaction((db) => backups.verify(db, b.id, userId)); } catch (e) { log('  backup skipped:', e.message); }

  const counts = (await pool.query(`SELECT
     (SELECT count(*) FROM gst_einvoices WHERE NOT is_deleted) einv,
     (SELECT count(*) FROM gst_einvoices WHERE irn IS NOT NULL) irn,
     (SELECT count(*) FROM gst_eway_bills WHERE NOT is_deleted) ewb,
     (SELECT count(*) FROM gst_comments) comments,
     (SELECT count(*) FROM gst_versions) versions,
     (SELECT count(*) FROM gst_saved_views) views`)).rows[0];
  log('done →', JSON.stringify(counts));
  await pool.end();
}

main().catch((e) => { console.error('[gst-demo] failed:', e); process.exit(1); });
