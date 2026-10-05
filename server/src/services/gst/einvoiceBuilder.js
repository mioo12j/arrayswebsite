// ============================================================================
//  e-Invoice JSON builder — notified schema v1.1
//
//  Maps our internal, storage-friendly record into the EXACT keys the IRP
//  expects (Version, TranDtls, DocDtls, SellerDtls, BuyerDtls, DispDtls,
//  ShipDtls, ItemList, ValDtls, …). Keeping this mapping in one place means a
//  future schema change touches only this file — never the rest of the app.
// ============================================================================

import { toDdMmYyyy, yn, n2, intOrNull, strOrNull } from './util.js';

const SCHEMA_VERSION = '1.1';

function sellerBlock(s = {}) {
  return {
    Gstin: strOrNull(s.gstin),
    LglNm: strOrNull(s.legalName),
    TrdNm: strOrNull(s.tradeName) || strOrNull(s.legalName),
    Addr1: strOrNull(s.addr1),
    Addr2: strOrNull(s.addr2),
    Loc: strOrNull(s.location),
    Pin: intOrNull(s.pincode),
    Stcd: strOrNull(String(s.stateCode || '').padStart(2, '0')),
    Ph: strOrNull(s.phone),
    Em: strOrNull(s.email),
  };
}

function buyerBlock(b = {}) {
  return {
    Gstin: strOrNull(b.gstin),
    LglNm: strOrNull(b.legalName),
    TrdNm: strOrNull(b.tradeName) || strOrNull(b.legalName),
    Pos: strOrNull(String(b.pos || '').padStart(2, '0')),
    Addr1: strOrNull(b.addr1),
    Addr2: strOrNull(b.addr2),
    Loc: strOrNull(b.location),
    Pin: intOrNull(b.pincode),
    Stcd: strOrNull(String(b.stateCode || '').padStart(2, '0')),
    Ph: strOrNull(b.phone),
    Em: strOrNull(b.email),
  };
}

function addrBlock(a) {
  if (!a) return undefined;
  return {
    Gstin: strOrNull(a.gstin),
    LglNm: strOrNull(a.legalName),
    TrdNm: strOrNull(a.tradeName),
    Addr1: strOrNull(a.addr1),
    Addr2: strOrNull(a.addr2),
    Loc: strOrNull(a.location),
    Pin: intOrNull(a.pincode),
    Stcd: strOrNull(String(a.stateCode || '').padStart(2, '0')),
  };
}

function itemBlock(it, i) {
  return {
    SlNo: String(it.slNo || i + 1),
    PrdDesc: strOrNull(it.description),
    IsServc: String(it.isService || 'N').toUpperCase() === 'Y' ? 'Y' : 'N',
    HsnCd: strOrNull(it.hsn),
    Barcde: strOrNull(it.barcode),
    Qty: it.quantity != null ? Number(it.quantity) : null,
    FreeQty: Number(it.freeQty || 0),
    Unit: strOrNull(it.unit ? String(it.unit).toUpperCase() : null),
    UnitPrice: n2(it.unitPrice),
    TotAmt: n2(it.grossAmount != null ? it.grossAmount : (Number(it.unitPrice || 0) * Number(it.quantity || 0))),
    Discount: n2(it.discount),
    PreTaxVal: n2(it.preTaxValue || 0),
    AssAmt: n2(it.taxableValue),
    GstRt: Number(it.gstRate || 0),
    IgstAmt: n2(it.igstAmount),
    CgstAmt: n2(it.cgstAmount),
    SgstAmt: n2(it.sgstAmount),
    CesRt: Number(it.cessRate || 0),
    CesAmt: n2(it.cessAmount),
    CesNonAdvlAmt: n2(it.cessNonAdvlAmount || 0),
    StateCesRt: Number(it.stateCessRate || 0),
    StateCesAmt: n2(it.stateCessAmount || 0),
    StateCesNonAdvlAmt: n2(it.stateCessNonAdvlAmount || 0),
    OthChrg: n2(it.otherCharges || 0),
    TotItemVal: n2(it.totalItemValue),
    OrdLineRef: strOrNull(it.orderLineRef),
    OrgCntry: strOrNull(it.originCountry),
    PrdSlNo: strOrNull(it.productSerial),
    BchDtls: it.batch || undefined,
  };
}

function valBlock(v = {}) {
  return {
    AssVal: n2(v.assessableValue),
    CgstVal: n2(v.cgstValue),
    SgstVal: n2(v.sgstValue),
    IgstVal: n2(v.igstValue),
    CesVal: n2(v.cessValue || 0),
    StCesVal: n2(v.stateCessValue || 0),
    Discount: n2(v.discount || 0),
    OthChrg: n2(v.otherCharges || 0),
    RndOffAmt: n2(v.roundOff || 0),
    TotInvVal: n2(v.totalInvoiceValue),
    TotInvValFc: n2(v.totalInvoiceValueFc || 0),
  };
}

// Strip undefined/null/'' keys so optional empty fields are ABSENT rather than
// sent as null — the NIC validator rejects explicit nulls on typed optional
// fields. Numbers (incl. 0) and booleans are always kept.
function prune(obj) {
  if (Array.isArray(obj)) return obj.map(prune);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(obj)) {
      if (val === undefined || val === null || val === '') continue;
      out[k] = prune(val);
    }
    return out;
  }
  return obj;
}

export function buildEInvoicePayload(rec = {}) {
  const payload = {
    Version: SCHEMA_VERSION,
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: strOrNull(rec.supplyType),
      RegRev: yn(rec.reverseCharge),
      EcmGstin: strOrNull(rec.ecomGstin),
      IgstOnIntra: yn(rec.igstOnIntra),
    },
    DocDtls: {
      Typ: strOrNull(rec.docType),
      No: strOrNull(rec.docNo),
      Dt: toDdMmYyyy(rec.docDate),
    },
    SellerDtls: sellerBlock(rec.seller),
    BuyerDtls: buyerBlock(rec.buyer),
    DispDtls: addrBlock(rec.dispatch),
    ShipDtls: addrBlock(rec.shipTo),
    ItemList: (Array.isArray(rec.items) ? rec.items : []).map(itemBlock),
    ValDtls: valBlock(rec.val),
    PayDtls: rec.payment || undefined,
    RefDtls: rec.reference || undefined,
    AddlDocDtls: rec.additionalDocs || undefined,
    ExpDtls: rec.exportDetails || undefined,
    EwbDtls: rec.ewb || undefined,
  };
  return prune(payload);
}

export { SCHEMA_VERSION };
