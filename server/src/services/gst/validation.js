// ============================================================================
//  GST validation engine — mirrors portal rules locally for fast, entry-time
//  feedback BEFORE any submission. Pure / synchronous (no DB, no network).
//
//  Every check returns a structured issue:
//     { code, field, message, severity: 'error' | 'warning' }
//  `error` blocks submission; `warning` is advisory.
// ============================================================================

import {
  STATE_CODES, PIN_PREFIX_STATE, EINV_SUPPLY_TYPES, EINV_DOC_TYPES,
  EWB_SUPPLY_TYPES, EWB_SUB_SUPPLY_TYPES, EWB_DOC_TYPES, TRANS_MODES,
  VEHICLE_TYPES, EWB_TXN_TYPES, UQC, GST_RATES,
} from './masterData.js';

const codeSet = (pairs) => new Set(pairs.map(([c]) => String(c)));
const SUP = codeSet(EINV_SUPPLY_TYPES);
const EINV_DOC = codeSet(EINV_DOC_TYPES);
const EWB_SUP = codeSet(EWB_SUPPLY_TYPES);
const EWB_SUB = codeSet(EWB_SUB_SUPPLY_TYPES);
const EWB_DOC = codeSet(EWB_DOC_TYPES);
const MODES = codeSet(TRANS_MODES);
const VTYPES = codeSet(VEHICLE_TYPES);
const TXN = codeSet(EWB_TXN_TYPES);
const UNITS = new Set(UQC.map(([c]) => c));
const RATES = new Set(GST_RATES.map(String));

// ── GSTIN format + check-digit ─────────────────────────────────────────────
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinCheckDigit(first14) {
  const mod = GSTIN_ALPHABET.length; // 36
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const cp = GSTIN_ALPHABET.indexOf(first14[i]);
    if (cp < 0) return null;
    let v = factor * cp;
    factor = factor === 2 ? 1 : 2;
    v = Math.floor(v / mod) + (v % mod);
    sum += v;
  }
  return GSTIN_ALPHABET[(mod - (sum % mod)) % mod];
}

export function isValidGstin(gstin) {
  if (typeof gstin !== 'string') return false;
  const g = gstin.trim().toUpperCase();
  if (!GSTIN_RE.test(g)) return false;
  if (!Object.prototype.hasOwnProperty.call(STATE_CODES, g.slice(0, 2))) return false;
  return gstinCheckDigit(g.slice(0, 14)) === g[14];
}

export const gstinState = (gstin) => (typeof gstin === 'string' ? gstin.trim().slice(0, 2) : '');

// ── Field helpers ──────────────────────────────────────────────────────────
const isPin = (p) => /^[1-9][0-9]{5}$/.test(String(p || ''));
const isEmail = (e) => !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e));
const isPhone = (p) => !p || /^[0-9]{6,12}$/.test(String(p).replace(/\D/g, ''));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// End of the current local day — a document dated *today* is never "in the future".
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

export function isValidHsn(hsn, { min = 4 } = {}) {
  const h = String(hsn || '').trim();
  if (!/^[0-9]+$/.test(h)) return false;
  if (![4, 6, 8].includes(h.length)) return false;
  return h.length >= min;
}

// Vehicle number — accepts standard Indian formats (and a couple of specials).
const VEHICLE_RES = [
  /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/,  // DL1CAB1234 / MH12AB1234
  /^[A-Z]{2}[0-9]{1,2}[0-9]{4}$/,            // older numeric
  /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/,          // 22BH1234AA  Bharat series
];
export function isValidVehicleNo(v) {
  const s = String(v || '').toUpperCase().replace(/[\s-]/g, '');
  return VEHICLE_RES.some((re) => re.test(s));
}

function pinStateMismatch(pin, stateCode) {
  const pre = String(pin || '').slice(0, 2);
  const expected = PIN_PREFIX_STATE[Number(pre)];
  if (!expected) return false; // unknown prefix → don't flag
  return expected !== String(stateCode).padStart(2, '0');
}

// ── e-INVOICE validation ───────────────────────────────────────────────────
export function validateEInvoice(rec = {}, opts = {}) {
  const issues = [];
  const add = (severity, code, field, message) => issues.push({ severity, code, field, message });
  const err = (c, f, m) => add('error', c, f, m);
  const warn = (c, f, m) => add('warning', c, f, m);

  const hsnMin = opts.sellerAATOAbove5cr ? 6 : 4;

  // TranDtls
  if (!SUP.has(String(rec.supplyType))) err('EINV_SUPTYP', 'supplyType', 'Invalid or missing supply type (SupTyp).');

  // DocDtls
  if (!EINV_DOC.has(String(rec.docType))) err('EINV_DOCTYP', 'docType', 'Document type must be INV, CRN or DBN.');
  const docNo = String(rec.docNo || '').trim();
  if (!docNo) err('EINV_DOCNO', 'docNo', 'Document number is required.');
  else if (docNo.length > 16) err('EINV_DOCNO_LEN', 'docNo', 'Document number cannot exceed 16 characters.');
  else if (!/^[A-Za-z0-9/-]+$/.test(docNo)) err('EINV_DOCNO_FMT', 'docNo', 'Document number may use only letters, digits, “/” and “-”.');
  else if (/^[0/-]/.test(docNo)) err('EINV_DOCNO_START', 'docNo', 'Document number cannot start with 0, “/” or “-”.');
  if (!rec.docDate) err('EINV_DOCDT', 'docDate', 'Document date is required.');
  else if (new Date(rec.docDate) > endOfToday()) err('EINV_DOCDT_FUT', 'docDate', 'Document date cannot be in the future.');

  // IRN must NOT be present in a submission payload (the IRP generates it).
  if (opts.preSubmission && rec.irn) err('EINV_IRN_PRESENT', 'irn', 'IRN must not be supplied in the request — the IRP generates it.');

  // SellerDtls
  const s = rec.seller || {};
  if (!isValidGstin(s.gstin)) err('EINV_SELLER_GSTIN', 'seller.gstin', 'Seller GSTIN is invalid (format or check-digit).');
  if (!s.legalName) err('EINV_SELLER_LGLNM', 'seller.legalName', 'Seller legal name is required.');
  if (!s.addr1) err('EINV_SELLER_ADDR', 'seller.addr1', 'Seller address line 1 is required.');
  if (!s.location) err('EINV_SELLER_LOC', 'seller.location', 'Seller location is required.');
  if (!isPin(s.pincode)) err('EINV_SELLER_PIN', 'seller.pincode', 'Seller pincode must be 6 digits.');
  if (!STATE_CODES[String(s.stateCode).padStart(2, '0')]) err('EINV_SELLER_STCD', 'seller.stateCode', 'Seller state code is invalid.');
  else if (isValidGstin(s.gstin) && gstinState(s.gstin) !== String(s.stateCode).padStart(2, '0')) err('EINV_SELLER_STMATCH', 'seller.stateCode', 'Seller state code does not match the GSTIN state.');
  if (!isEmail(s.email)) warn('EINV_SELLER_EM', 'seller.email', 'Seller email looks invalid.');
  if (!isPhone(s.phone)) warn('EINV_SELLER_PH', 'seller.phone', 'Seller phone looks invalid.');

  // BuyerDtls — export supply types may use 'URP' / state 96
  const b = rec.buyer || {};
  const isExport = ['EXPWP', 'EXPWOP'].includes(String(rec.supplyType));
  if (isExport) {
    if (b.gstin && b.gstin !== 'URP' && !isValidGstin(b.gstin)) err('EINV_BUYER_GSTIN', 'buyer.gstin', 'Export buyer GSTIN must be a valid GSTIN or “URP”.');
  } else if (!isValidGstin(b.gstin)) {
    err('EINV_BUYER_GSTIN', 'buyer.gstin', 'Buyer GSTIN is invalid (format or check-digit).');
  }
  if (!b.legalName) err('EINV_BUYER_LGLNM', 'buyer.legalName', 'Buyer legal name is required.');
  if (!b.pos || !STATE_CODES[String(b.pos).padStart(2, '0')]) err('EINV_BUYER_POS', 'buyer.pos', 'Place of supply (POS) state code is invalid.');
  if (!isExport && !isPin(b.pincode)) err('EINV_BUYER_PIN', 'buyer.pincode', 'Buyer pincode must be 6 digits.');

  // ItemList — at least 1, at most 1000
  const items = Array.isArray(rec.items) ? rec.items : [];
  if (items.length < 1) err('EINV_ITEM_MIN', 'items', 'At least one line item is required.');
  if (items.length > 1000) err('EINV_ITEM_MAX', 'items', 'An invoice cannot have more than 1000 line items.');

  let itemTotal = 0;
  items.forEach((it, i) => {
    const f = (k) => `items[${i}].${k}`;
    if (!it.description) err('EINV_IT_DESC', f('description'), `Item ${i + 1}: description is required.`);
    const isGoods = String(it.isService || 'N').toUpperCase() !== 'Y';
    if (!isValidHsn(it.hsn, { min: hsnMin })) err('EINV_IT_HSN', f('hsn'), `Item ${i + 1}: HSN must be ${hsnMin === 6 ? '6 or 8' : '4, 6 or 8'} digits${hsnMin === 6 ? ' (turnover > ₹5 cr requires ≥ 6-digit HSN)' : ''}.`);
    if (isGoods) {
      if (!(num(it.quantity) > 0)) err('EINV_IT_QTY', f('quantity'), `Item ${i + 1}: quantity is required for goods.`);
      if (it.unit && !UNITS.has(String(it.unit).toUpperCase())) err('EINV_IT_UNIT', f('unit'), `Item ${i + 1}: unit “${it.unit}” is not a valid UQC code.`);
    }
    if (!(num(it.taxableValue) >= 0)) err('EINV_IT_ASS', f('taxableValue'), `Item ${i + 1}: taxable value is required.`);
    if (it.gstRate != null && !RATES.has(String(Number(it.gstRate)))) err('EINV_IT_RATE', f('gstRate'), `Item ${i + 1}: GST rate ${it.gstRate}% is not a valid rate.`);
    itemTotal += num(it.totalItemValue) || 0;
  });

  // ValDtls reconciliation (tolerance ₹1 per portal rounding)
  const v = rec.val || {};
  const tot = num(v.totalInvoiceValue);
  if (!(tot >= 0)) err('EINV_VAL_TOT', 'val.totalInvoiceValue', 'Total invoice value is required.');
  if (items.length && Number.isFinite(tot) && Math.abs(round2(itemTotal) - round2(tot - (num(v.roundOff) || 0) - (num(v.otherCharges) || 0))) > 1) {
    warn('EINV_VAL_RECON', 'val.totalInvoiceValue', `Sum of item values (₹${round2(itemTotal)}) does not reconcile with the invoice total. Please verify.`);
  }

  return issues;
}

// ── e-WAY BILL validation ──────────────────────────────────────────────────
export function validateEwb(rec = {}, opts = {}) {
  const issues = [];
  const add = (severity, code, field, message) => issues.push({ severity, code, field, message });
  const err = (c, f, m) => add('error', c, f, m);
  const warn = (c, f, m) => add('warning', c, f, m);

  // Supply / sub-supply / doc
  if (!EWB_SUP.has(String(rec.supplyType))) err('EWB_SUPTYP', 'supplyType', 'Supply type must be O (outward) or I (inward).');
  if (!EWB_SUB.has(String(rec.subSupplyType))) err('EWB_SUBTYP', 'subSupplyType', 'Invalid sub-supply type.');
  else if (String(rec.subSupplyType) === '8' && !rec.subSupplyDesc) err('EWB_SUBDESC', 'subSupplyDesc', 'A description is required when sub-supply type is “Others”.');
  if (!EWB_DOC.has(String(rec.docType))) err('EWB_DOCTYP', 'docType', 'Invalid document type.');
  if (!rec.docNo) err('EWB_DOCNO', 'docNo', 'Document number is required.');
  if (!rec.docDate) err('EWB_DOCDT', 'docDate', 'Document date is required.');
  else if (new Date(rec.docDate) > endOfToday()) err('EWB_DOCDT_FUT', 'docDate', 'Document date cannot be in the future.');

  // Transaction type → conditional party requirements
  const txn = String(rec.transactionType);
  if (!TXN.has(txn)) err('EWB_TXN', 'transactionType', 'Invalid transaction type.');
  if (txn === '2' && !rec.shipToGstin) err('EWB_SHIPTO', 'shipToGstin', 'Ship-To GSTIN is mandatory for Bill-To Ship-To transactions.');
  if (txn === '3' && !rec.dispatchFromGstin) err('EWB_DISPFROM', 'dispatchFromGstin', 'Dispatch-From GSTIN is required for Bill-From Dispatch-From transactions.');

  // From party
  if (rec.fromGstin && rec.fromGstin !== 'URP' && !isValidGstin(rec.fromGstin)) err('EWB_FROM_GSTIN', 'fromGstin', 'From GSTIN is invalid.');
  if (!isPin(rec.fromPincode)) err('EWB_FROM_PIN', 'fromPincode', 'From pincode must be 6 digits.');
  if (!STATE_CODES[String(rec.fromStateCode).padStart(2, '0')]) err('EWB_FROM_ST', 'fromStateCode', 'From state code is invalid.');
  else if (isPin(rec.fromPincode) && pinStateMismatch(rec.fromPincode, rec.fromStateCode)) warn('EWB_FROM_PINST', 'fromPincode', 'From pincode does not look consistent with the From state.');

  // To party
  if (rec.toGstin && rec.toGstin !== 'URP' && !isValidGstin(rec.toGstin)) err('EWB_TO_GSTIN', 'toGstin', 'To GSTIN is invalid.');
  if (!isPin(rec.toPincode)) err('EWB_TO_PIN', 'toPincode', 'To pincode must be 6 digits.');
  if (!STATE_CODES[String(rec.toStateCode).padStart(2, '0')]) err('EWB_TO_ST', 'toStateCode', 'To state code is invalid.');
  else if (isPin(rec.toPincode) && pinStateMismatch(rec.toPincode, rec.toStateCode)) warn('EWB_TO_PINST', 'toPincode', 'To pincode does not look consistent with the To state.');

  // Values / distance
  if (!(num(rec.totInvValue) > 0)) err('EWB_INVVAL', 'totInvValue', 'Total invoice value must be greater than zero.');
  const dist = num(rec.transDistance);
  if (!Number.isFinite(dist) || dist < 0 || dist > 4000) err('EWB_DIST', 'transDistance', 'Transport distance must be between 0 and 4000 km.');
  else if (dist === 0) warn('EWB_DIST_AUTO', 'transDistance', 'Distance is 0 — the portal will auto-calculate from the pincodes.');

  // Transport-mode logic (Part B)
  const mode = String(rec.transMode || '');
  const wantsPartB = opts.requirePartB || rec.vehicleNo || rec.transDocNo || mode;
  if (mode && !MODES.has(mode)) err('EWB_MODE', 'transMode', 'Invalid transport mode.');
  if (wantsPartB) {
    if (!mode) err('EWB_MODE_REQ', 'transMode', 'Transport mode is required to complete Part B.');
    if (mode === '1') {
      // Road → vehicle number + type
      if (!rec.vehicleNo) err('EWB_VEH_REQ', 'vehicleNo', 'Vehicle number is required for road movement.');
      else if (!isValidVehicleNo(rec.vehicleNo)) err('EWB_VEH_FMT', 'vehicleNo', `Vehicle number “${rec.vehicleNo}” is not a valid format.`);
      if (rec.vehicleType && !VTYPES.has(String(rec.vehicleType))) err('EWB_VEH_TYPE', 'vehicleType', 'Vehicle type must be R (Regular) or O (ODC).');
    } else if (['2', '3', '4'].includes(mode)) {
      // Rail / Air / Ship → transport document instead of a vehicle
      if (!rec.transDocNo) err('EWB_TDOC_NO', 'transDocNo', 'Transport document number is required for rail/air/ship.');
      if (!rec.transDocDate) err('EWB_TDOC_DT', 'transDocDate', 'Transport document date is required for rail/air/ship.');
      if (rec.vehicleNo) warn('EWB_VEH_IGNORE', 'vehicleNo', 'Vehicle number is ignored for non-road transport modes.');
    }
  }
  if (!rec.transporterId && !wantsPartB) {
    warn('EWB_PARTB_PENDING', 'transMode', 'Only Part A is filled — assign a transporter or add Part B (vehicle / transport doc) before the goods move.');
  }

  // Items
  const items = Array.isArray(rec.items) ? rec.items : [];
  if (items.length < 1) err('EWB_ITEM_MIN', 'items', 'At least one item is required.');
  items.forEach((it, i) => {
    const f = (k) => `items[${i}].${k}`;
    if (!it.description) err('EWB_IT_DESC', f('description'), `Item ${i + 1}: product name/description is required.`);
    if (!isValidHsn(it.hsn, { min: 4 })) err('EWB_IT_HSN', f('hsn'), `Item ${i + 1}: HSN must be 4, 6 or 8 digits.`);
    if (!(num(it.taxableAmount) >= 0)) err('EWB_IT_TAX', f('taxableAmount'), `Item ${i + 1}: taxable amount is required.`);
  });

  return issues;
}

// Convenience: split issues and decide if submission may proceed.
export function summarize(issues = []) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}
