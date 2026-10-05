// ============================================================================
//  e-Way Bill lifecycle service
//  create → validate → generate (Part A / Part B) → update Part B → extend →
//  cancel / reject / close. Separate object from e-Invoice; can be generated
//  FROM an e-invoice without merging the two records.
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { validateEwb, summarize } from './validation.js';
import { buildEwbPayload, buildPartBPayload } from './ewbBuilder.js';
import { getAdapter, getMode } from './adapter.js';
import { recordApiLog, recordAudit } from './log.js';
import * as branches from './branchService.js';
import * as versions from './versionService.js';

const EDITABLE = new Set(['draft', 'validated', 'part_a', 'needs_review', 'error']);

export function rowToRecord(r) {
  if (!r) return null;
  return {
    id: r.id, status: r.status, env: r.env,
    supplyType: r.supply_type, subSupplyType: r.sub_supply_type, subSupplyDesc: r.sub_supply_desc,
    docType: r.doc_type, docNo: r.doc_no, docDate: r.doc_date, transactionType: r.transaction_type,
    fromGstin: r.from_gstin, fromTradeName: r.from_trade_name, fromAddr1: r.from_addr1, fromAddr2: r.from_addr2,
    fromPlace: r.from_place, fromPincode: r.from_pincode, fromStateCode: r.from_state_code,
    dispatchFromGstin: r.dispatch_from_gstin, actFromStateCode: r.act_from_state_code,
    toGstin: r.to_gstin, toTradeName: r.to_trade_name, toAddr1: r.to_addr1, toAddr2: r.to_addr2,
    toPlace: r.to_place, toPincode: r.to_pincode, toStateCode: r.to_state_code,
    shipToGstin: r.ship_to_gstin, actToStateCode: r.act_to_state_code,
    totInvValue: r.tot_inv_value, totalTaxable: r.tot_taxable_val,
    cgstValue: r.cgst_value, sgstValue: r.sgst_value, igstValue: r.igst_value, cessValue: r.cess_value,
    otherValue: r.other_value, transDistance: r.trans_distance,
    transporterId: r.transporter_id, transporterName: r.transporter_name, transMode: r.trans_mode,
    transDocNo: r.trans_doc_no, transDocDate: r.trans_doc_date, vehicleNo: r.vehicle_no, vehicleType: r.vehicle_type,
    items: r.item_list || [],
    partAReady: r.part_a_ready, partBReady: r.part_b_ready,
    ewbNo: r.ewb_no, ewbDate: r.ewb_date, validUpto: r.valid_upto, ewbStatusPortal: r.ewb_status_portal,
    isCancelled: r.is_cancelled, cancelReasonCode: r.cancel_reason_code, cancelRemark: r.cancel_remark,
    cancelDate: r.cancel_date, isRejected: r.is_rejected, isClosed: r.is_closed, extendedCount: r.extended_count,
    printCount: r.print_count, isArchived: r.is_archived, isDeleted: r.is_deleted,
    validationErrors: r.validation_errors || [],
    sourceEinvoiceId: r.source_einvoice_id, sourceInvoiceId: r.source_invoice_id,
    branchId: r.branch_id, branchCode: r.branch_code, branchName: r.branch_name,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    createdByName: r.created_by_name, generatedByName: r.generated_by_name,
  };
}

function insertCols(body) {
  return [
    body.env || 'sandbox', body.supplyType || 'O', body.subSupplyType || '1', body.subSupplyDesc || null,
    body.docType || 'INV', body.docNo || null, body.docDate || null, body.transactionType || 1,
    body.fromGstin || null, body.fromTradeName || null, body.fromAddr1 || null, body.fromAddr2 || null,
    body.fromPlace || null, body.fromPincode || null, body.fromStateCode || null,
    body.dispatchFromGstin || null, body.actFromStateCode || body.fromStateCode || null,
    body.toGstin || null, body.toTradeName || null, body.toAddr1 || null, body.toAddr2 || null,
    body.toPlace || null, body.toPincode || null, body.toStateCode || null,
    body.shipToGstin || null, body.actToStateCode || body.toStateCode || null,
    body.totInvValue || null, body.totalTaxable || null, body.cgstValue || 0, body.sgstValue || 0,
    body.igstValue || 0, body.cessValue || 0, body.otherValue || 0, body.transDistance || 0,
    body.transporterId || null, body.transporterName || null, body.transMode || null,
    body.transDocNo || null, body.transDocDate || null, body.vehicleNo || null, body.vehicleType || null,
    JSON.stringify(body.items || []),
  ];
}

const INSERT_SQL = `INSERT INTO gst_eway_bills
  (env, supply_type, sub_supply_type, sub_supply_desc, doc_type, doc_no, doc_date, transaction_type,
   from_gstin, from_trade_name, from_addr1, from_addr2, from_place, from_pincode, from_state_code,
   dispatch_from_gstin, act_from_state_code,
   to_gstin, to_trade_name, to_addr1, to_addr2, to_place, to_pincode, to_state_code,
   ship_to_gstin, act_to_state_code,
   tot_inv_value, tot_taxable_val, cgst_value, sgst_value, igst_value, cess_value, other_value, trans_distance,
   transporter_id, transporter_name, trans_mode, trans_doc_no, trans_doc_date, vehicle_no, vehicle_type,
   item_list, status, prepared_by, created_by, source_einvoice_id, source_invoice_id)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
          $27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,'draft',$43,$43,$44,$45)
  RETURNING *`;

export async function list(db, q = {}) {
  const clauses = ['e.is_deleted = FALSE'];
  const p = [];
  const like = (sql, val) => { p.push(`%${val}%`); clauses.push(sql.replace('$$', `$${p.length}`)); };
  if (q.search) {
    p.push(`%${q.search}%`); const i = p.length;
    clauses.push(`(e.ewb_no ILIKE $${i} OR e.doc_no ILIKE $${i} OR e.to_gstin ILIKE $${i} OR e.vehicle_no ILIKE $${i} OR e.transporter_name ILIKE $${i})`);
  }
  if (q.ewb_no) like('e.ewb_no ILIKE $$', q.ewb_no);
  if (q.doc_no) like('e.doc_no ILIKE $$', q.doc_no);
  if (q.gstin) { p.push(`%${q.gstin}%`); const i = p.length; clauses.push(`(e.from_gstin ILIKE $${i} OR e.to_gstin ILIKE $${i})`); }
  if (q.vehicle) like('e.vehicle_no ILIKE $$', q.vehicle);
  if (q.transporter) like('e.transporter_name ILIKE $$', q.transporter);
  if (q.status) { p.push(q.status); clauses.push(`e.status = $${p.length}::gst_ewb_status`); }
  if (q.from) { p.push(q.from); clauses.push(`e.doc_date >= $${p.length}`); }
  if (q.to) { p.push(q.to); clauses.push(`e.doc_date <= $${p.length}`); }
  if (q.expiring === 'true') clauses.push(`e.valid_upto IS NOT NULL AND e.valid_upto BETWEEN now() AND now() + interval '24 hours' AND e.is_cancelled=FALSE`);
  if (q.branch_id && q.branch_id !== 'all') { p.push(q.branch_id); clauses.push(`e.branch_id = $${p.length}`); }
  if (q.archived === 'true') clauses.push('e.is_archived = TRUE');
  else if (q.archived !== 'all') clauses.push('e.is_archived = FALSE');

  const { rows } = await db.query(
    `SELECT e.*, u.name AS created_by_name, gu.name AS generated_by_name, b.code AS branch_code, b.name AS branch_name
       FROM gst_eway_bills e
       LEFT JOIN users u ON u.id=e.created_by
       LEFT JOIN users gu ON gu.id=e.generated_by
       LEFT JOIN gst_branches b ON b.id=e.branch_id
      WHERE ${clauses.join(' AND ')} ORDER BY e.created_at DESC LIMIT 500`, p
  );
  return rows.map(rowToRecord);
}

export async function get(db, id) {
  const { rows } = await db.query(
    `SELECT e.*, u.name AS created_by_name, gu.name AS generated_by_name, b.code AS branch_code, b.name AS branch_name
       FROM gst_eway_bills e LEFT JOIN users u ON u.id=e.created_by LEFT JOIN users gu ON gu.id=e.generated_by
       LEFT JOIN gst_branches b ON b.id=e.branch_id
      WHERE e.id=$1`, [id]);
  if (!rows[0]) throw new ApiError(404, 'e-Way Bill not found');
  const rec = rowToRecord(rows[0]);
  const { rows: timeline } = await db.query(
    `SELECT a.*, u.name AS user_name FROM gst_audit_events a LEFT JOIN users u ON u.id=a.user_id
      WHERE a.object_type='ewb' AND a.object_id=$1 ORDER BY a.created_at ASC`, [id]);
  const { rows: apiLogs } = await db.query(
    `SELECT id, action, response_status, http_status, error_code, error_message, created_at
       FROM gst_api_logs WHERE object_type='ewb' AND object_id=$1 ORDER BY created_at ASC`, [id]);
  return { ...rec, timeline, apiLogs };
}

export async function createDraft(db, body, userId) {
  await branches.ensureDefault(db);
  const branchId = body.branchId || await branches.getDefaultId(db);
  const cols = insertCols(body);
  cols.push(userId, body.sourceEinvoiceId || null, body.sourceInvoiceId || null);
  const { rows } = await db.query(INSERT_SQL, cols);
  if (branchId) { await db.query('UPDATE gst_eway_bills SET branch_id=$2 WHERE id=$1', [rows[0].id, branchId]); rows[0].branch_id = branchId; }
  await recordAudit(db, { objectType: 'ewb', objectId: rows[0].id, eventType: 'created', message: `EWB draft created (doc ${body.docNo || '—'})`, userId });
  await versions.record(db, { objectType: 'ewb', objectId: rows[0].id, row: rows[0], reason: 'Initial draft' }, userId);
  return rowToRecord(rows[0]);
}

export async function updateDraft(db, id, body, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 AND is_deleted=FALSE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (!EDITABLE.has(cur.status)) throw new ApiError(409, `An e-way bill in “${cur.status}” state cannot be edited.`);
  await db.query(
    `UPDATE gst_eway_bills SET
      supply_type=$2, sub_supply_type=$3, sub_supply_desc=$4, doc_type=$5, doc_no=$6, doc_date=$7, transaction_type=$8,
      from_gstin=$9, from_trade_name=$10, from_addr1=$11, from_addr2=$12, from_place=$13, from_pincode=$14, from_state_code=$15,
      dispatch_from_gstin=$16, act_from_state_code=$17,
      to_gstin=$18, to_trade_name=$19, to_addr1=$20, to_addr2=$21, to_place=$22, to_pincode=$23, to_state_code=$24,
      ship_to_gstin=$25, act_to_state_code=$26,
      tot_inv_value=$27, tot_taxable_val=$28, cgst_value=$29, sgst_value=$30, igst_value=$31, cess_value=$32, other_value=$33, trans_distance=$34,
      transporter_id=$35, transporter_name=$36, trans_mode=$37, trans_doc_no=$38, trans_doc_date=$39, vehicle_no=$40, vehicle_type=$41,
      item_list=$42
     WHERE id=$1`,
    [id, ...insertCols(body)]
  );
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'edited', message: 'EWB draft edited', userId });
  const fresh = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1', [id])).rows[0];
  await versions.record(db, { objectType: 'ewb', objectId: id, row: fresh, reason: body.changeReason }, userId);
  return get(db, id);
}

// Restore a previous version — only while the EWB has not been generated.
export async function restoreVersion(db, id, versionId, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 AND is_deleted=FALSE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (cur.ewb_no) throw new ApiError(409, 'This e-way bill is generated and locked — earlier versions are viewable but cannot be restored.');
  if (!EDITABLE.has(cur.status)) throw new ApiError(409, `Cannot restore a version while in “${cur.status}”.`);
  const v = await versions.get(db, versionId);
  if (v.object_id !== id) throw new ApiError(400, 'Version does not belong to this document.');
  const s = v.snapshot;
  await db.query(
    `UPDATE gst_eway_bills SET supply_type=$2, sub_supply_type=$3, doc_type=$4, doc_no=$5, doc_date=$6, transaction_type=$7,
       from_gstin=$8, from_pincode=$9, from_state_code=$10, to_gstin=$11, to_pincode=$12, to_state_code=$13,
       tot_inv_value=$14, tot_taxable_val=$15, trans_distance=$16, transporter_id=$17, transporter_name=$18,
       trans_mode=$19, vehicle_no=$20, vehicle_type=$21, item_list=$22 WHERE id=$1`,
    [id, s.supply_type, s.sub_supply_type, s.doc_type, s.doc_no, s.doc_date, s.transaction_type,
     s.from_gstin, s.from_pincode, s.from_state_code, s.to_gstin, s.to_pincode, s.to_state_code,
     s.tot_inv_value, s.tot_taxable_val, s.trans_distance, s.transporter_id, s.transporter_name,
     s.trans_mode, s.vehicle_no, s.vehicle_type, JSON.stringify(s.item_list || [])]
  );
  const fresh = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1', [id])).rows[0];
  await versions.record(db, { objectType: 'ewb', objectId: id, row: fresh, reason: `Restored from v${v.version_no}` }, userId);
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'version_restored', message: `Restored content from version ${v.version_no}`, userId });
  return rowToRecord(fresh);
}

export async function validate(db, id, userId, { requirePartB = false } = {}) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 AND is_deleted=FALSE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  const issues = validateEwb(rowToRecord(cur), { requirePartB });
  const sum = summarize(issues);
  await db.query('UPDATE gst_eway_bills SET status=$2::gst_ewb_status, validation_errors=$3 WHERE id=$1',
    [id, sum.ok ? 'validated' : 'needs_review', JSON.stringify(issues)]);
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'validated', message: sum.ok ? 'Validation passed' : `Validation found ${sum.errors.length} error(s)`, userId });
  return { ...sum };
}

// Generate the EWB. If transport (Part B) is present → fully generated;
// otherwise Part A only (status part_a) until Part B is updated later.
export async function generate(db, id, userId, { idempotencyKey } = {}) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 AND is_deleted=FALSE FOR UPDATE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (cur.ewb_no) return { alreadyDone: true, ewbNo: cur.ewb_no, status: cur.status };
  if (cur.is_cancelled) throw new ApiError(409, 'A cancelled e-way bill cannot be regenerated.');

  const rec = rowToRecord(cur);
  const hasPartB = !!(rec.vehicleNo || rec.transDocNo);
  const issues = validateEwb(rec, { requirePartB: hasPartB });
  const sum = summarize(issues);
  if (!sum.ok) {
    await db.query('UPDATE gst_eway_bills SET status=$2::gst_ewb_status, validation_errors=$3 WHERE id=$1', [id, 'needs_review', JSON.stringify(issues)]);
    throw new ApiError(422, `Cannot generate — ${sum.errors.length} validation error(s) must be fixed first.`);
  }

  const payload = buildEwbPayload(rec);
  const started = Date.now();
  const resp = getAdapter().ewbGenerate(payload);
  await recordApiLog(db, {
    objectType: 'ewb', objectId: id, env: cur.env, action: 'generate', requestPayload: payload,
    responsePayload: resp.data || { error: resp.errorMessage }, responseStatus: resp.ok ? 'accepted' : 'rejected',
    httpStatus: resp.httpStatus, errorCode: resp.errorCode, errorMessage: resp.errorMessage, idempotencyKey, durationMs: Date.now() - started, userId,
  });
  if (!resp.ok) {
    await db.query('UPDATE gst_eway_bills SET status=$2::gst_ewb_status, last_error=$3 WHERE id=$1', [id, 'error', `${resp.errorCode}: ${resp.errorMessage}`]);
    await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'error', message: `EWB portal rejected: ${resp.errorMessage}`, userId });
    throw new ApiError(502, `EWB portal rejected: ${resp.errorMessage}`);
  }
  const d = resp.data;
  const status = hasPartB ? 'generated' : 'part_a';
  const { rows } = await db.query(
    `UPDATE gst_eway_bills SET status=$2::gst_ewb_status, ewb_no=$3, ewb_date=$4, valid_upto=$5,
       ewb_status_portal='ACT', part_a_ready=TRUE, part_b_ready=$6, canonical_payload=$7,
       generated_by=$8, generated_at=now(), idempotency_key=COALESCE(idempotency_key,$9), validation_errors='[]', last_error=NULL
     WHERE id=$1 RETURNING *`,
    [id, status, d.ewbNo, d.ewbDate, d.validUpto, hasPartB, JSON.stringify(payload), userId, idempotencyKey || null]
  );
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'generated', field: 'ewb_no', newValue: d.ewbNo, message: hasPartB ? `EWB generated (Part A+B), valid upto ${d.validUpto}` : `Part A generated (Part B pending), EWB ${d.ewbNo}`, userId });
  return { ok: true, mode: getMode(), partB: hasPartB, ...rowToRecord(rows[0]) };
}

export async function updatePartB(db, id, body, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 AND is_deleted=FALSE FOR UPDATE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (!cur.ewb_no) throw new ApiError(409, 'Generate the e-way bill (Part A) before updating Part B.');
  if (cur.is_cancelled) throw new ApiError(409, 'A cancelled e-way bill cannot be updated.');

  // merge transport fields, then validate Part B
  const merged = { ...rowToRecord(cur), ...body };
  const issues = validateEwb(merged, { requirePartB: true }).filter((i) => i.field?.startsWith('trans') || i.field?.startsWith('vehicle'));
  const sum = summarize(issues);
  if (!sum.ok) throw new ApiError(422, sum.errors.map((e) => e.message).join(' '));

  const payload = buildPartBPayload({ ...merged, ewbNo: cur.ewb_no });
  const started = Date.now();
  const resp = getAdapter().ewbUpdatePartB(payload);
  await recordApiLog(db, {
    objectType: 'ewb', objectId: id, env: cur.env, action: 'update_partb', requestPayload: payload,
    responsePayload: resp.data || { error: resp.errorMessage }, responseStatus: resp.ok ? 'accepted' : 'rejected',
    httpStatus: resp.httpStatus, errorCode: resp.errorCode, errorMessage: resp.errorMessage, durationMs: Date.now() - started, userId,
  });
  if (!resp.ok) throw new ApiError(502, `Part B update rejected: ${resp.errorMessage}`);

  const { rows } = await db.query(
    `UPDATE gst_eway_bills SET trans_mode=$2, vehicle_no=$3, vehicle_type=$4, trans_doc_no=$5, trans_doc_date=$6,
       transporter_id=COALESCE($7,transporter_id), transporter_name=COALESCE($8,transporter_name),
       valid_upto=$9, part_b_ready=TRUE, status='generated'
     WHERE id=$1 RETURNING *`,
    [id, body.transMode || cur.trans_mode, body.vehicleNo || null, body.vehicleType || 'R',
     body.transDocNo || null, body.transDocDate || null, body.transporterId || null, body.transporterName || null,
     resp.data.validUpto]
  );
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'part_b_updated', message: `Part B updated (vehicle ${body.vehicleNo || '—'})`, userId });
  return rowToRecord(rows[0]);
}

export async function extend(db, id, body, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (!cur.ewb_no || cur.is_cancelled) throw new ApiError(409, 'Only a live e-way bill can be extended.');
  const resp = getAdapter().ewbExtend({ ewbNo: cur.ewb_no, ...body });
  await recordApiLog(db, { objectType: 'ewb', objectId: id, env: cur.env, action: 'extend', requestPayload: { ewbNo: cur.ewb_no, ...body }, responsePayload: resp.data, responseStatus: resp.ok ? 'accepted' : 'rejected', httpStatus: resp.httpStatus, errorCode: resp.errorCode, errorMessage: resp.errorMessage, userId });
  if (!resp.ok) throw new ApiError(502, `Extension rejected: ${resp.errorMessage}`);
  const { rows } = await db.query('UPDATE gst_eway_bills SET valid_upto=$2, extended_count=extended_count+1 WHERE id=$1 RETURNING *', [id, resp.data.validUpto]);
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'extended', message: `Validity extended to ${resp.data.validUpto}`, userId });
  return rowToRecord(rows[0]);
}

export async function cancel(db, id, { reasonCode, remark }, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (!cur.ewb_no) throw new ApiError(409, 'Only a generated e-way bill can be cancelled at the portal. A draft can simply be deleted.');
  if (cur.is_cancelled) throw new ApiError(409, 'This e-way bill is already cancelled.');
  if (cur.is_closed) throw new ApiError(409, 'A closed e-way bill cannot be cancelled.');
  if (!reasonCode) throw new ApiError(400, 'A cancellation reason code is required.');
  // EWB cancel window: within 24h of generation
  if (cur.ewb_date && (Date.now() - new Date(cur.ewb_date).getTime()) > 24 * 3600 * 1000) {
    throw new ApiError(409, 'This e-way bill is older than 24 hours and can no longer be cancelled at the portal.');
  }
  const resp = getAdapter().ewbCancel(cur.ewb_no, { reasonCode, remark });
  await recordApiLog(db, { objectType: 'ewb', objectId: id, env: cur.env, action: 'cancel', requestPayload: { ewbNo: cur.ewb_no, cancelRsnCode: reasonCode, cancelRmrk: remark }, responsePayload: resp.data, responseStatus: resp.ok ? 'accepted' : 'rejected', httpStatus: resp.httpStatus, errorCode: resp.errorCode, errorMessage: resp.errorMessage, userId });
  if (!resp.ok) throw new ApiError(502, `Cancellation rejected: ${resp.errorMessage}`);
  const { rows } = await db.query(
    `UPDATE gst_eway_bills SET status='cancelled', is_cancelled=TRUE, ewb_status_portal='CNL',
       cancel_reason_code=$2, cancel_remark=$3, cancel_date=now(), cancelled_by=$4 WHERE id=$1 RETURNING *`,
    [id, reasonCode, remark || null, userId]);
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'cancelled', field: 'status', newValue: 'cancelled', message: `Cancelled at portal (reason ${reasonCode})`, userId });
  return rowToRecord(rows[0]);
}

export async function close(db, id, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (!cur.ewb_no || cur.is_cancelled) throw new ApiError(409, 'Only a live e-way bill can be closed.');
  const resp = getAdapter().ewbClose({ ewbNo: cur.ewb_no });
  await recordApiLog(db, { objectType: 'ewb', objectId: id, env: cur.env, action: 'close', requestPayload: { ewbNo: cur.ewb_no }, responsePayload: resp.data, responseStatus: resp.ok ? 'accepted' : 'rejected', httpStatus: resp.httpStatus, errorCode: resp.errorCode, errorMessage: resp.errorMessage, userId });
  if (!resp.ok) throw new ApiError(502, `Closure rejected: ${resp.errorMessage}`);
  const { rows } = await db.query("UPDATE gst_eway_bills SET status='closed', is_closed=TRUE, closed_at=now(), closed_by=$2 WHERE id=$1 RETURNING *", [id, userId]);
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'closed', message: 'EWB closed (delivery complete)', userId });
  return rowToRecord(rows[0]);
}

export async function reject(db, id, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (!cur.ewb_no) throw new ApiError(409, 'Only a generated e-way bill can be rejected.');
  const resp = getAdapter().ewbReject(cur.ewb_no);
  await recordApiLog(db, { objectType: 'ewb', objectId: id, env: cur.env, action: 'reject', requestPayload: { ewbNo: cur.ewb_no }, responsePayload: resp.data, responseStatus: resp.ok ? 'accepted' : 'rejected', httpStatus: resp.httpStatus, errorCode: resp.errorCode, errorMessage: resp.errorMessage, userId });
  if (!resp.ok) throw new ApiError(502, `Rejection failed: ${resp.errorMessage}`);
  const { rows } = await db.query("UPDATE gst_eway_bills SET status='rejected', is_rejected=TRUE WHERE id=$1 RETURNING *", [id]);
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'rejected', message: 'EWB rejected', userId });
  return rowToRecord(rows[0]);
}

// Build an EWB draft directly from an existing e-invoice (cross-link, no merge).
export async function fromEInvoice(db, einvoiceId, body, userId) {
  const e = (await db.query('SELECT * FROM gst_einvoices WHERE id=$1 AND is_deleted=FALSE', [einvoiceId])).rows[0];
  if (!e) throw new ApiError(404, 'Source e-invoice not found');
  const seller = e.seller_dtls || {}; const buyer = e.buyer_dtls || {}; const val = e.val_dtls || {};
  const items = (e.item_list || []).map((it) => ({
    description: it.description, hsn: it.hsn, quantity: it.quantity, unit: it.unit,
    taxableAmount: it.taxableValue, cgstRate: 0, sgstRate: 0, igstRate: it.gstRate, cessRate: it.cessRate || 0,
  }));
  const draft = {
    env: e.env, supplyType: 'O', subSupplyType: '1', docType: 'INV', docNo: e.doc_no, docDate: e.doc_date,
    transactionType: 1,
    fromGstin: seller.gstin, fromTradeName: seller.tradeName || seller.legalName, fromAddr1: seller.addr1,
    fromPlace: seller.location, fromPincode: seller.pincode, fromStateCode: seller.stateCode,
    toGstin: buyer.gstin, toTradeName: buyer.tradeName || buyer.legalName, toAddr1: buyer.addr1,
    toPlace: buyer.location, toPincode: buyer.pincode, toStateCode: buyer.stateCode,
    totInvValue: val.totalInvoiceValue, totalTaxable: val.assessableValue,
    cgstValue: val.cgstValue, sgstValue: val.sgstValue, igstValue: val.igstValue, cessValue: val.cessValue || 0,
    transDistance: body.transDistance || 0, transMode: body.transMode || null, vehicleNo: body.vehicleNo || null,
    vehicleType: body.vehicleType || null, transporterId: body.transporterId || null, transporterName: body.transporterName || null,
    transDocNo: body.transDocNo || null, transDocDate: body.transDocDate || null,
    items, sourceEinvoiceId: einvoiceId, sourceInvoiceId: e.source_invoice_id,
  };
  const created = await createDraft(db, draft, userId);
  await recordAudit(db, { objectType: 'ewb', objectId: created.id, eventType: 'created', message: `Generated from e-invoice ${e.doc_no || einvoiceId}`, userId });
  return created;
}

export async function setArchived(db, id, archived, userId) {
  const { rows } = await db.query('UPDATE gst_eway_bills SET is_archived=$2 WHERE id=$1 AND is_deleted=FALSE RETURNING *', [id, archived]);
  if (!rows[0]) throw new ApiError(404, 'e-Way Bill not found');
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: archived ? 'archived' : 'unarchived', message: archived ? 'Archived' : 'Unarchived', userId });
  return rowToRecord(rows[0]);
}

export async function softDelete(db, id, userId) {
  const cur = (await db.query('SELECT * FROM gst_eway_bills WHERE id=$1', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'e-Way Bill not found');
  if (cur.ewb_no && !cur.is_cancelled) throw new ApiError(409, 'A generated e-way bill cannot be deleted. Cancel it lawfully first.');
  await db.query('UPDATE gst_eway_bills SET is_deleted=TRUE, deleted_at=now(), deleted_by=$2 WHERE id=$1', [id, userId]);
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'deleted', message: 'Soft-deleted (recoverable)', userId });
  return { ok: true };
}

export async function restore(db, id, userId) {
  const { rows } = await db.query('UPDATE gst_eway_bills SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL WHERE id=$1 RETURNING *', [id]);
  if (!rows[0]) throw new ApiError(404, 'e-Way Bill not found');
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'restored', message: 'Restored local draft/record', userId });
  return rowToRecord(rows[0]);
}

export async function markPrinted(db, id, userId) {
  const { rows } = await db.query('UPDATE gst_eway_bills SET print_count=print_count+1, last_printed_at=now() WHERE id=$1 RETURNING *', [id]);
  if (!rows[0]) throw new ApiError(404, 'e-Way Bill not found');
  await recordAudit(db, { objectType: 'ewb', objectId: id, eventType: 'printed', message: 'Printed / PDF generated', userId });
  return rowToRecord(rows[0]);
}
