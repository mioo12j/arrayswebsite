// ============================================================================
//  Pluggable IRP / e-Way Bill adapter
//
//  The rest of the app talks ONLY to this interface, never to a portal URL
//  directly. Today it runs in `simulation` mode (returns valid-format
//  IRN / AckNo / signed QR / EWB number) so every screen, PDF, status flow and
//  audit trail is fully exercisable. Switching to `live` later means
//  implementing LiveAdapter (auth token, payload encryption, digital signature)
//  and setting GST_MODE=live — no caller changes.
//
//  Standard result envelope from every method:
//    { ok, status: 'accepted'|'rejected'|'unknown', httpStatus, data,
//      errorCode, errorMessage }
// ============================================================================

import crypto from 'node:crypto';

export function getMode() {
  return (process.env.GST_MODE || 'simulation').toLowerCase();
}

// ── helpers ────────────────────────────────────────────────────────────────
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function financialYear(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const y = d.getFullYear();
  const fyStart = d.getMonth() >= 3 ? y : y - 1; // FY starts in April
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
}

function tsStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const b64 = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64');

// A JWT-shaped placeholder so the QR/SignedInvoice look structurally real.
function fakeSignedToken(payloadObj) {
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64(payloadObj);
  const sig = sha(header + '.' + body).slice(0, 43);
  return `${header}.${body}.${sig}`;
}

const ok = (data, extra = {}) => ({ ok: true, status: 'accepted', httpStatus: 200, data, errorCode: null, errorMessage: null, ...extra });
const fail = (errorCode, errorMessage, httpStatus = 400) => ({ ok: false, status: 'rejected', httpStatus, data: null, errorCode, errorMessage });

// ── Simulation adapter ─────────────────────────────────────────────────────
const SimulationAdapter = {
  mode: 'simulation',

  // e-Invoice → IRN. Deterministic per (seller, docType, docNo, FY) so repeat
  // submissions return the SAME IRN, mirroring the IRP's de-duplication.
  einvoiceGenerateIRN(payload) {
    const seller = payload?.SellerDtls?.Gstin || '';
    const doc = payload?.DocDtls || {};
    if (!seller || !doc.No) return fail('SIM_EINV_INPUT', 'Missing seller GSTIN or document number.');
    const fy = financialYear(doc.Dt && doc.Dt.split('/').reverse().join('-'));
    const irn = sha(`${seller}|${doc.Typ}|${doc.No}|${fy}`); // 64-hex
    const now = new Date();
    const ackNo = Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${(BigInt(Math.floor(now.getTime())) % 100000000n).toString().padStart(8, '0')}`);
    const qrData = {
      SellerGstin: seller,
      BuyerGstin: payload?.BuyerDtls?.Gstin || null,
      DocNo: doc.No,
      DocTyp: doc.Typ,
      DocDt: doc.Dt,
      TotInvVal: payload?.ValDtls?.TotInvVal ?? null,
      ItemCnt: Array.isArray(payload?.ItemList) ? payload.ItemList.length : 0,
      MainHsnCode: payload?.ItemList?.[0]?.HsnCd || null,
      Irn: irn,
      IrnDt: tsStamp(now),
    };
    return ok({
      Irn: irn,
      AckNo: String(ackNo),
      AckDt: tsStamp(now),
      SignedInvoice: fakeSignedToken({ data: payload, irn }),
      SignedQRCode: fakeSignedToken(qrData),
      Status: 'ACT',
      EwbNo: null,
    });
  },

  einvoiceCancel(irn, { reasonCode, remark } = {}) {
    if (!irn) return fail('SIM_EINV_CNL_INPUT', 'IRN is required to cancel.');
    if (!reasonCode) return fail('SIM_EINV_CNL_RSN', 'Cancellation reason code is required.');
    return ok({ Irn: irn, CancelDate: tsStamp(), Reason: reasonCode, Remark: remark || null, Status: 'CNL' });
  },

  // e-Way Bill → EWB number + validity.
  ewbGenerate(payload) {
    if (!payload?.docNo) return fail('SIM_EWB_INPUT', 'Document number is required.');
    const now = new Date();
    const ewbNo = (BigInt(Math.floor(now.getTime())) % 1000000000000n).toString().padStart(12, '0');
    const dist = Number(payload.transDistance || 0);
    const odc = payload.vehicleType === 'O';
    const perDay = odc ? 20 : 200;
    const days = Math.max(1, Math.ceil((dist || perDay) / perDay));
    const valid = new Date(now);
    valid.setDate(valid.getDate() + days);
    valid.setHours(23, 59, 0, 0);
    const partB = !!(payload.vehicleNo || payload.transDocNo);
    return ok({
      ewbNo,
      ewbDate: tsStamp(now),
      validUpto: tsStamp(valid),
      alert: null,
      partB,
    });
  },

  ewbUpdatePartB(payload) {
    if (!payload?.ewbNo) return fail('SIM_EWB_PARTB_INPUT', 'EWB number is required.');
    const now = new Date();
    const valid = new Date(now); valid.setDate(valid.getDate() + 1); valid.setHours(23, 59, 0, 0);
    return ok({ ewbNo: payload.ewbNo, vehUpdDate: tsStamp(now), validUpto: tsStamp(valid) });
  },

  ewbExtend(payload) {
    if (!payload?.ewbNo) return fail('SIM_EWB_EXT_INPUT', 'EWB number is required.');
    const now = new Date();
    const valid = new Date(now); valid.setDate(valid.getDate() + 1); valid.setHours(23, 59, 0, 0);
    return ok({ ewbNo: payload.ewbNo, updDate: tsStamp(now), validUpto: tsStamp(valid) });
  },

  ewbCancel(ewbNo, { reasonCode, remark } = {}) {
    if (!ewbNo) return fail('SIM_EWB_CNL_INPUT', 'EWB number is required.');
    if (!reasonCode) return fail('SIM_EWB_CNL_RSN', 'Cancellation reason code is required.');
    return ok({ ewbNo, cancelDate: tsStamp(), reason: reasonCode, remark: remark || null });
  },

  ewbReject(ewbNo) {
    if (!ewbNo) return fail('SIM_EWB_REJ_INPUT', 'EWB number is required.');
    return ok({ ewbNo, rejectDate: tsStamp() });
  },

  ewbClose(payload) {
    if (!payload?.ewbNo) return fail('SIM_EWB_CLS_INPUT', 'EWB number is required.');
    return ok({ ewbNo: payload.ewbNo, closeDate: tsStamp() });
  },
};

// ── Live adapter (stub until GSP credentials + crypto are wired) ────────────
function liveNotConfigured() {
  return {
    ok: false, status: 'unknown', httpStatus: 503, data: null,
    errorCode: 'LIVE_NOT_CONFIGURED',
    errorMessage: 'Live GST mode is not configured. Provide GSP credentials and the encryption/signature module, then set GST_MODE=live.',
  };
}
const LiveAdapter = {
  mode: 'live',
  einvoiceGenerateIRN: liveNotConfigured,
  einvoiceCancel: liveNotConfigured,
  ewbGenerate: liveNotConfigured,
  ewbUpdatePartB: liveNotConfigured,
  ewbExtend: liveNotConfigured,
  ewbCancel: liveNotConfigured,
  ewbReject: liveNotConfigured,
  ewbClose: liveNotConfigured,
};

export function getAdapter() {
  return getMode() === 'live' ? LiveAdapter : SimulationAdapter;
}
