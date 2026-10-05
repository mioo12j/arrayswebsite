// ============================================================================
//  e-Way Bill JSON builder — maps the internal record to the EWB generate
//  schema keys. State codes are numeric; pincodes numeric; dates dd/mm/yyyy.
//  Separate object from the e-Invoice — never merged.
// ============================================================================

import { toDdMmYyyy, n2, intOrNull, strOrNull } from './util.js';

function itemBlock(it) {
  return {
    productName: strOrNull(it.productName || it.description),
    productDesc: strOrNull(it.description),
    hsnCode: intOrNull(it.hsn),
    quantity: it.quantity != null ? Number(it.quantity) : null,
    qtyUnit: strOrNull(it.unit ? String(it.unit).toUpperCase() : null),
    cgstRate: Number(it.cgstRate || 0),
    sgstRate: Number(it.sgstRate || 0),
    igstRate: Number(it.igstRate || 0),
    cessRate: Number(it.cessRate || 0),
    cessNonadvol: Number(it.cessNonAdvol || 0),
    taxableAmount: n2(it.taxableAmount),
  };
}

export function buildEwbPayload(rec = {}) {
  const payload = {
    supplyType: strOrNull(rec.supplyType),
    subSupplyType: strOrNull(rec.subSupplyType),
    subSupplyDesc: strOrNull(rec.subSupplyDesc) || '',
    docType: strOrNull(rec.docType),
    docNo: strOrNull(rec.docNo),
    docDate: toDdMmYyyy(rec.docDate),

    fromGstin: strOrNull(rec.fromGstin),
    fromTrdName: strOrNull(rec.fromTradeName),
    fromAddr1: strOrNull(rec.fromAddr1),
    fromAddr2: strOrNull(rec.fromAddr2),
    fromPlace: strOrNull(rec.fromPlace),
    fromPincode: intOrNull(rec.fromPincode),
    fromStateCode: intOrNull(rec.fromStateCode),
    actFromStateCode: intOrNull(rec.actFromStateCode != null ? rec.actFromStateCode : rec.fromStateCode),
    dispatchFromGSTIN: strOrNull(rec.dispatchFromGstin),

    toGstin: strOrNull(rec.toGstin),
    toTrdName: strOrNull(rec.toTradeName),
    toAddr1: strOrNull(rec.toAddr1),
    toAddr2: strOrNull(rec.toAddr2),
    toPlace: strOrNull(rec.toPlace),
    toPincode: intOrNull(rec.toPincode),
    toStateCode: intOrNull(rec.toStateCode),
    actToStateCode: intOrNull(rec.actToStateCode != null ? rec.actToStateCode : rec.toStateCode),
    shipToGSTIN: strOrNull(rec.shipToGstin),

    transactionType: intOrNull(rec.transactionType),
    totalValue: n2(rec.totalTaxable),
    cgstValue: n2(rec.cgstValue),
    sgstValue: n2(rec.sgstValue),
    igstValue: n2(rec.igstValue),
    cessValue: n2(rec.cessValue),
    cessNonAdvolValue: n2(rec.cessNonAdvolValue || 0),
    otherValue: n2(rec.otherValue || 0),
    totInvValue: n2(rec.totInvValue),

    transporterId: strOrNull(rec.transporterId),
    transporterName: strOrNull(rec.transporterName),
    transDocNo: strOrNull(rec.transDocNo),
    transDocDate: toDdMmYyyy(rec.transDocDate),
    transMode: strOrNull(rec.transMode),
    transDistance: String(rec.transDistance != null ? rec.transDistance : 0),
    vehicleNo: strOrNull(rec.vehicleNo ? String(rec.vehicleNo).toUpperCase().replace(/[\s-]/g, '') : null),
    vehicleType: strOrNull(rec.vehicleType),

    itemList: (Array.isArray(rec.items) ? rec.items : []).map(itemBlock),
  };

  // Drop null/empty keys to keep the payload tidy (portal treats absent as unset).
  for (const k of Object.keys(payload)) {
    if (payload[k] === null) delete payload[k];
  }
  return payload;
}

// Part-A-only payload (no transport) — used when transport details arrive later.
export function buildPartBPayload(rec = {}) {
  return {
    ewbNo: strOrNull(rec.ewbNo),
    vehicleNo: strOrNull(rec.vehicleNo ? String(rec.vehicleNo).toUpperCase().replace(/[\s-]/g, '') : null),
    fromPlace: strOrNull(rec.fromPlace),
    fromState: intOrNull(rec.fromStateCode),
    reasonCode: strOrNull(rec.reasonCode) || '1',
    reasonRem: strOrNull(rec.reasonRemark) || 'Vehicle assigned',
    transDocNo: strOrNull(rec.transDocNo),
    transDocDate: toDdMmYyyy(rec.transDocDate),
    transMode: strOrNull(rec.transMode),
    vehicleType: strOrNull(rec.vehicleType) || 'R',
  };
}
