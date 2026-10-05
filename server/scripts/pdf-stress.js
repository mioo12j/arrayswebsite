// PDF stress + pagination test. Generates e-Invoice and EWB PDFs across item
// counts and long-content variants, writes them to uploads/_pdftest/, and
// reports page counts (parsed from each PDF buffer).  Run: node scripts/pdf-stress.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { einvoicePdf, ewbPdf } from '../src/services/gst/pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'uploads', '_pdftest');
fs.mkdirSync(OUT, { recursive: true });

const pageCount = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;

const branding = {
  headerText: 'ARRAYS INGENIERIA PVT LTD', watermark: 'ORIGINAL',
  terms: 'Payment due within 30 days of invoice date. Goods once sold will not be taken back. Interest @18% p.a. on delayed payments. Subject to Madhubani jurisdiction.',
  disclaimer: 'This is a digitally generated, IRP-registered tax invoice and does not require a physical signature. E. & O. E.',
  logoFile: 'demo-logo.png', stampFile: 'demo-stamp.png', signatureFile: 'demo-signature.png',
};

const mkItem = (i, long = false) => ({
  slNo: i + 1,
  description: long ? `Monocrystalline PERC Bifacial PV Module 545Wp (Series ${1000 + i}) with extended 30-year linear performance warranty and anti-PID glass coating` : `PV Module 540Wp #${i + 1}`,
  hsn: '85414011', quantity: 10 + i, unit: 'NOS', unitPrice: 11500,
  taxableValue: (10 + i) * 11500, gstRate: 18, igstAmount: (10 + i) * 11500 * 0.18,
  totalItemValue: (10 + i) * 11500 * 1.18, taxableAmount: (10 + i) * 11500,
  productName: `PV Module 540Wp #${i + 1}`,
});

const einvRec = (n, long = false) => {
  const items = Array.from({ length: n }, (_, i) => mkItem(i, long));
  const taxable = items.reduce((s, it) => s + it.taxableValue, 0);
  const igst = items.reduce((s, it) => s + it.igstAmount, 0);
  return {
    docType: 'INV', docNo: `ARR/HO/26-27/${String(n).padStart(6, '0')}`, docDate: '2026-06-01', supplyType: 'B2B',
    irn: 'a'.repeat(64), ackNo: '112620000000007', ackDate: new Date().toISOString(), signedQr: 'DEMO-QR-' + 'x'.repeat(300),
    seller: { gstin: '10AARCA4610L1ZT', legalName: 'ARRAYS INGENIERIA PRIVATE LIMITED', addr1: long ? 'Vill Harpur, Near the old water tower, Kaluahi Block, PO Harpur' : 'Vill Harpur, Kaluahi', location: 'Madhubani', pincode: '847229', stateCode: '10' },
    buyer: { gstin: '27AAACR5055K1Z5', legalName: long ? 'Maharashtra Renewable Energy & Solar Distribution Private Limited (Pune Division)' : 'Maharashtra Solar Distributors LLP', addr1: 'Plot 12, MIDC Industrial Area, Phase II', location: 'Pune', pincode: '411019', stateCode: '27' },
    items,
    val: { assessableValue: taxable, cgstValue: 0, sgstValue: 0, igstValue: igst, cessValue: 0, roundOff: 0, totalInvoiceValue: taxable + igst },
  };
};

const ewbRec = (n, long = false) => {
  const items = Array.from({ length: n }, (_, i) => mkItem(i, long));
  return {
    ewbNo: '291006543210', ewbDate: '2026-06-01', validUpto: '2026-06-05',
    docType: 'INV', docNo: 'ARR/HO/26-27/000007', docDate: '2026-06-01', supplyType: 'O', subSupplyType: 'Supply',
    transactionType: 'Regular', totInvValue: 814200, totalTaxable: 690000, transDistance: 1180,
    fromTradeName: 'ARRAYS INGENIERIA', fromGstin: '10AARCA4610L1ZT', fromAddr1: 'Vill Harpur, Kaluahi', fromPlace: 'Madhubani', fromPincode: '847229', fromStateCode: '10',
    toTradeName: long ? 'Maharashtra Renewable Energy & Solar Distribution Private Limited' : 'Maharashtra Solar Distributors', toGstin: '27AAACR5055K1Z5', toAddr1: 'Plot 12, MIDC Phase II', toPlace: 'Pune', toPincode: '411019', toStateCode: '27',
    partBReady: true, vehicleNo: 'MH12AB1234', transMode: 1, vehicleType: 'R',
    transporterName: long ? 'BlueDart Express Heavy Cargo & Project Logistics Division' : 'BlueDart Express', transporterId: '29AABCB1234C1Z5', transDocNo: 'LR-99812', transDocDate: '2026-06-01',
    items,
  };
};

const rows = [];
for (const n of [1, 5, 10, 20, 50, 100]) {
  const ei = await einvoicePdf(einvRec(n), branding);
  fs.writeFileSync(path.join(OUT, `einvoice_${n}.pdf`), ei);
  rows.push(['e-Invoice', `${n} items`, pageCount(ei), (ei.length / 1024).toFixed(0) + ' KB']);
  const eb = await ewbPdf(ewbRec(n), branding);
  fs.writeFileSync(path.join(OUT, `ewb_${n}.pdf`), eb);
  rows.push(['EWB', `${n} items`, pageCount(eb), (eb.length / 1024).toFixed(0) + ' KB']);
}
// long-content variants
const eiLong = await einvoicePdf(einvRec(8, true), branding);
fs.writeFileSync(path.join(OUT, 'einvoice_long.pdf'), eiLong);
rows.push(['e-Invoice', '8 items (long text)', pageCount(eiLong), (eiLong.length / 1024).toFixed(0) + ' KB']);
const ebLong = await ewbPdf(ewbRec(8, true), branding);
fs.writeFileSync(path.join(OUT, 'ewb_long.pdf'), ebLong);
rows.push(['EWB', '8 items (long text)', pageCount(ebLong), (ebLong.length / 1024).toFixed(0) + ' KB']);
// draft variants (no IRN / no EWB no → watermark DRAFT)
const eiDraft = await einvoicePdf({ ...einvRec(3), irn: null, ackNo: null, ackDate: null, signedQr: null }, { ...branding, watermark: null });
rows.push(['e-Invoice', '3 items (DRAFT)', pageCount(eiDraft), (eiDraft.length / 1024).toFixed(0) + ' KB']);

console.log('\n  TYPE         SCENARIO                PAGES   SIZE');
console.log('  ' + '─'.repeat(54));
for (const r of rows) console.log(`  ${r[0].padEnd(12)} ${r[1].padEnd(22)} ${String(r[2]).padStart(3)}     ${r[3]}`);
console.log(`\n  Wrote ${rows.length} PDFs → ${OUT}\n`);

// expectation check
const expect = { '1 items': 1, '5 items': 1, '10 items': 1, '20 items': 1, '8 items (long text)': 1, '3 items (DRAFT)': 1 };
let warn = 0;
for (const r of rows) { if (expect[r[1]] && r[2] > expect[r[1]]) { console.log(`  ⚠ ${r[0]} ${r[1]} → ${r[2]} pages (expected ${expect[r[1]]})`); warn++; } }
console.log(warn ? `  ${warn} pagination warning(s).` : '  ✓ One-page optimization holds for all small documents.');
