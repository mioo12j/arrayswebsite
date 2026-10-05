// ============================================================================
//  #8 Company & Branch Branding Manager.
//  Company-level branding lives in app_config('branding'); per-branch overrides
//  live in gst_branches.branding and are merged on top. Branding flows into the
//  PDF engine; a preview renders a sample document with the chosen branding.
// ============================================================================

import path from 'node:path';
import fs from 'node:fs';
import { UPLOAD_ROOT } from '../../middleware/upload.js';
import { company } from '../../config/company.js';
import * as config from './configService.js';
import { recordAudit } from './log.js';

// Text fields users can configure (logo/signature/stamp are uploaded files).
const TEXT_FIELDS = [
  'headerText', 'footerText', 'terms', 'disclaimer', 'watermark', 'contactInfo', 'emailSignature',
  // PDF theme — every colour is independently customizable (blank = sensible default)
  'pdfColor', 'headerBgColor', 'headerTextColor', 'tableHeadBgColor', 'tableHeadTextColor',
  'textColor', 'mutedColor', 'lineColor', 'watermarkColor',
  // Quotation default content blocks (used when a quote doesn't set its own)
  'quoteScope', 'quoteTerms', 'quoteExclusions',
];

export async function get(db) {
  const b = (await config.get(db, 'branding', {})) || {};
  return { headerText: company.pdfName, ...b };
}

export async function set(db, patch, userId) {
  const cur = (await config.get(db, 'branding', {})) || {};
  const next = { ...cur };
  for (const f of TEXT_FIELDS) if (patch[f] !== undefined) next[f] = patch[f];
  for (const f of ['logoFile', 'signatureFile', 'stampFile']) if (patch[f] !== undefined) next[f] = patch[f];
  await config.set(db, 'branding', next, userId);
  await recordAudit(db, { objectType: 'system', objectId: userId, eventType: 'branding_updated', message: 'Company branding updated', userId });
  return get(db);
}

export async function getForBranch(db, branchId) {
  const base = await get(db);
  if (!branchId) return base;
  const r = (await db.query('SELECT branding FROM gst_branches WHERE id=$1', [branchId])).rows[0];
  return { ...base, ...(r?.branding || {}) };
}

export async function setForBranch(db, branchId, patch, userId) {
  const r = (await db.query('SELECT branding FROM gst_branches WHERE id=$1', [branchId])).rows[0];
  if (!r) throw new Error('Branch not found');
  const next = { ...(r.branding || {}) };
  for (const f of [...TEXT_FIELDS, 'logoFile', 'signatureFile', 'stampFile']) if (patch[f] !== undefined) next[f] = patch[f];
  await db.query('UPDATE gst_branches SET branding=$2 WHERE id=$1', [branchId, JSON.stringify(next)]);
  await recordAudit(db, { objectType: 'branch', objectId: branchId, eventType: 'branding_updated', message: 'Branch branding updated', userId });
  return getForBranch(db, branchId);
}

export function filePath(branding, key) {
  const name = branding?.[key];
  if (!name) return null;
  const p = path.join(UPLOAD_ROOT, name);
  return fs.existsSync(p) ? p : null;
}

// ── Preview engine — render a sample document with the chosen branding ──────
const SAMPLE_EINV = {
  docType: 'INV', docNo: 'SAMPLE/26-27/000001', docDate: new Date().toISOString().slice(0, 10), supplyType: 'B2B',
  irn: 'a'.repeat(64), ackNo: '112620000000001', ackDate: new Date().toISOString(), signedQr: 'SAMPLE-QR-PREVIEW',
  seller: { gstin: company.gstin, legalName: company.name, addr1: company.address, location: 'Madhubani', pincode: '847229', stateCode: '10' },
  buyer: { gstin: '29AAGCB7383J1Z4', legalName: 'SAMPLE CUSTOMER PVT LTD', addr1: 'Bengaluru', location: 'Bengaluru', pincode: '560001', stateCode: '29', pos: '29' },
  items: [{ slNo: 1, description: 'Solar Panel 540W (sample)', hsn: '854143', quantity: 10, unit: 'NOS', unitPrice: 12000, taxableValue: 120000, gstRate: 18, igstAmount: 21600, totalItemValue: 141600 }],
  val: { assessableValue: 120000, igstValue: 21600, totalInvoiceValue: 141600 },
};
const SAMPLE_EWB = {
  ewbNo: '391000123456', ewbDate: new Date().toISOString(), validUpto: new Date(Date.now() + 2 * 864e5).toISOString(),
  docType: 'INV', docNo: 'SAMPLE/26-27/000001', docDate: SAMPLE_EINV.docDate, supplyType: 'O', subSupplyType: '1', transactionType: 1, transDistance: 1850,
  fromTradeName: company.shortName, fromGstin: company.gstin, fromPlace: 'Madhubani', fromPincode: '847229', fromStateCode: '10',
  toTradeName: 'SAMPLE CUSTOMER', toGstin: '29AAGCB7383J1Z4', toPlace: 'Bengaluru', toPincode: '560001', toStateCode: '29',
  totInvValue: 141600, totalTaxable: 120000, transMode: '1', vehicleNo: 'MH12AB1234', vehicleType: 'R', partBReady: true,
  items: [{ description: 'Solar Panel 540W (sample)', hsn: '854143', quantity: 10, unit: 'NOS', taxableAmount: 120000 }],
};

export async function preview(db, type, branchId, lang = 'en') {
  const branding = await getForBranch(db, branchId);
  const { einvoicePdf, ewbPdf } = await import('./pdf.js');
  return type === 'ewb' ? ewbPdf(SAMPLE_EWB, branding, lang) : einvoicePdf(SAMPLE_EINV, branding, lang);
}
