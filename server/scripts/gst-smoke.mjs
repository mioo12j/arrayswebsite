// Foundation smoke test for the GST compliance engine.
//   node scripts/gst-smoke.mjs
import { pool } from '../src/config/db.js';
import { seedMasterData, loadMaster } from '../src/services/gst/masterData.js';
import { validateEInvoice, validateEwb, summarize, isValidGstin } from '../src/services/gst/validation.js';
import { buildEInvoicePayload } from '../src/services/gst/einvoiceBuilder.js';
import { buildEwbPayload } from '../src/services/gst/ewbBuilder.js';
import { getAdapter, getMode } from '../src/services/gst/adapter.js';

const line = (s) => console.log('\n' + s);
const adapter = getAdapter();

// Two real, checksum-valid GSTINs (Maharashtra / Karnataka demo numbers).
const SELLER_GSTIN = '27AAPFU0939F1ZV';
const BUYER_GSTIN = '29AAGCB7383J1Z4';

async function main() {
  line('1) Seed + load master data');
  const n = await seedMasterData(pool);
  const master = await loadMaster(pool, true);
  console.log(`   master rows: ${n}; categories: ${Object.keys(master).length}`);
  console.log(`   GSTIN checksum — seller ${SELLER_GSTIN}: ${isValidGstin(SELLER_GSTIN)}, garbage 27AAPFU0939F1ZZ: ${isValidGstin('27AAPFU0939F1ZZ')}`);

  line('2) Validate a GOOD e-invoice');
  const goodInv = {
    supplyType: 'B2B', docType: 'INV', docNo: 'ARR/2026/001', docDate: '2026-06-01',
    seller: { gstin: SELLER_GSTIN, legalName: 'ARRAYS INGENIERIA PVT LTD', addr1: 'Andheri East', location: 'Mumbai', pincode: '400001', stateCode: '27', email: 'a@b.com', phone: '9876543210' },
    buyer: { gstin: BUYER_GSTIN, legalName: 'TATA POWER SOLAR', pos: '29', addr1: 'Bengaluru', location: 'Bengaluru', pincode: '560001', stateCode: '29' },
    items: [{ slNo: 1, description: 'Solar Panel 540W', isService: 'N', hsn: '854143', quantity: 10, unit: 'NOS', unitPrice: 12000, grossAmount: 120000, taxableValue: 120000, gstRate: 18, igstAmount: 21600, totalItemValue: 141600 }],
    val: { assessableValue: 120000, igstValue: 21600, cgstValue: 0, sgstValue: 0, totalInvoiceValue: 141600 },
  };
  const r1 = summarize(validateEInvoice(goodInv, { preSubmission: true, sellerAATOAbove5cr: true }));
  console.log(`   ok=${r1.ok}  errors=${r1.errors.length}  warnings=${r1.warnings.length}`);

  line('3) Validate a BAD e-invoice (bad GSTIN, 4-digit HSN >5cr, no items)');
  const badInv = { ...goodInv, seller: { ...goodInv.seller, gstin: '27BADGSTIN0000' }, items: [{ ...goodInv.items[0], hsn: '8541' }] };
  const r2 = summarize(validateEInvoice(badInv, { preSubmission: true, sellerAATOAbove5cr: true }));
  console.log(`   ok=${r2.ok}  errors=${r2.errors.length}`);
  r2.errors.slice(0, 4).forEach((e) => console.log(`     • [${e.code}] ${e.field}: ${e.message}`));

  line('4) Build e-Invoice v1.1 payload + simulate IRN');
  const payload = buildEInvoicePayload(goodInv);
  console.log(`   Version=${payload.Version}  blocks=${Object.keys(payload).join(',')}`);
  const irnRes = adapter.einvoiceGenerateIRN(payload);
  console.log(`   adapter(${getMode()}) ok=${irnRes.ok}  IRN=${irnRes.data?.Irn?.slice(0, 24)}…  AckNo=${irnRes.data?.AckNo}`);
  const irnRes2 = adapter.einvoiceGenerateIRN(payload);
  console.log(`   de-dup check — same IRN on resubmit: ${irnRes.data.Irn === irnRes2.data.Irn}`);

  line('5) Validate + generate an e-Way Bill');
  const ewb = {
    supplyType: 'O', subSupplyType: '1', docType: 'INV', docNo: 'ARR/2026/001', docDate: '2026-06-01',
    transactionType: 1, fromGstin: SELLER_GSTIN, fromPincode: '400001', fromStateCode: '27',
    toGstin: BUYER_GSTIN, toPincode: '560001', toStateCode: '29',
    totInvValue: 141600, totalTaxable: 120000, igstValue: 21600, transDistance: 1850,
    transMode: '1', vehicleNo: 'MH12AB1234', vehicleType: 'R',
    items: [{ description: 'Solar Panel 540W', hsn: '854143', quantity: 10, unit: 'NOS', taxableAmount: 120000, igstRate: 18 }],
  };
  const r3 = summarize(validateEwb(ewb, { requirePartB: true }));
  console.log(`   validation ok=${r3.ok}  errors=${r3.errors.length}  warnings=${r3.warnings.length}`);
  const ewbPayload = buildEwbPayload(ewb);
  const ewbRes = adapter.ewbGenerate(ewbPayload);
  console.log(`   adapter ok=${ewbRes.ok}  EWB=${ewbRes.data?.ewbNo}  validUpto=${ewbRes.data?.validUpto}  partB=${ewbRes.data?.partB}`);

  line('6) Transport-mode logic: Rail with no transport doc must fail');
  const railBad = { ...ewb, transMode: '2', vehicleNo: null };
  const r4 = summarize(validateEwb(railBad, { requirePartB: true }));
  console.log(`   ok=${r4.ok}  errors:`);
  r4.errors.filter((e) => e.code.startsWith('EWB_TDOC')).forEach((e) => console.log(`     • [${e.code}] ${e.message}`));

  await pool.end();
  console.log('\n✅ GST foundation smoke test complete.');
}

main().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1); });
