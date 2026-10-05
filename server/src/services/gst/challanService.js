// ============================================================================
//  Delivery Challan lifecycle service  (Rule 55 CGST — movement of goods
//  WITHOUT a tax invoice).
//    draft → pending_approval → approved → dispatched → in_transit →
//    delivered / partially_delivered → (returned) → converted / closed
//  Every state change writes an audit event + a status-history row. Numbering,
//  branches, attachments, comments and the EWB module are reused, not rebuilt.
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';
import { todayIST } from './util.js';
import * as branches from './branchService.js';
import * as series from './seriesService.js';
import { financialYear } from './seriesService.js';
import { STATE_CODES } from './masterData.js';

const EDITABLE = new Set(['draft', 'pending_approval', 'rejected']);
const n = (v) => Number(v || 0);
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// ── GST computation — intra-state ⇒ CGST+SGST, inter-state ⇒ IGST ───────────
export function computeTotals(consignor = {}, consignee = {}, items = []) {
  const fromState = String(consignor.stateCode || '').padStart(2, '0');
  const toState = String(consignee.stateCode || consignee.pos || '').padStart(2, '0');
  const interState = fromState && toState ? fromState !== toState : false;
  let taxable = 0, cgst = 0, sgst = 0, igst = 0, cess = 0, qty = 0;
  const computed = items.map((it, i) => {
    const q = n(it.quantity);
    const base = it.taxableValue != null && it.taxableValue !== '' ? n(it.taxableValue) : q * n(it.rate);
    const rate = n(it.gstRate);
    const tax = round2(base * rate / 100);
    const cessAmt = round2(base * n(it.cessRate) / 100);
    const row = {
      ...it, lineNo: it.lineNo || i + 1, quantity: q, taxableValue: round2(base),
      cgstAmount: interState ? 0 : round2(tax / 2), sgstAmount: interState ? 0 : round2(tax / 2),
      igstAmount: interState ? tax : 0, cessAmount: cessAmt,
    };
    taxable += base; qty += q;
    cgst += row.cgstAmount; sgst += row.sgstAmount; igst += row.igstAmount; cess += cessAmt;
    return row;
  });
  const totals = {
    totalQty: round2(qty), taxableValue: round2(taxable),
    cgstValue: round2(cgst), sgstValue: round2(sgst), igstValue: round2(igst), cessValue: round2(cess),
    totalValue: round2(taxable + cgst + sgst + igst + cess), interState,
  };
  return { items: computed, totals };
}

// ── row → API record ────────────────────────────────────────────────────────
export function rowToRecord(r, items = [], history = [], returns = []) {
  if (!r) return null;
  return {
    id: r.id, challanNo: r.challan_no, challanDate: r.challan_date, challanTime: r.challan_time, fy: r.fy,
    branchId: r.branch_id, branchCode: r.branch_code, branchName: r.branch_name,
    challanType: r.challan_type, challanTypeName: r.challan_type_name, dispatchReason: r.dispatch_reason,
    status: r.status, currency: r.currency, remarks: r.remarks, internalNotes: r.internal_notes,
    consignor: r.consignor || {}, consignee: r.consignee || {}, consigneeKind: r.consignee_kind,
    transport: r.transport || {}, isInterstate: r.is_interstate,
    ewbId: r.ewb_id, ewbNo: r.ewb_no, ewbDate: r.ewb_date, ewbValidFrom: r.ewb_valid_from, ewbValidTo: r.ewb_valid_to, ewbDistance: r.ewb_distance,
    totalQty: r.total_qty, taxableValue: r.taxable_value, cgstValue: r.cgst_value, sgstValue: r.sgst_value,
    igstValue: r.igst_value, cessValue: r.cess_value, totalValue: r.total_value,
    delivery: r.delivery || null,
    sourceInvoiceId: r.source_invoice_id, convertedInvoiceId: r.converted_invoice_id, invoiceId: r.invoice_id,
    preparedBy: r.prepared_by, approvedBy: r.approved_by, approvedAt: r.approved_at,
    dispatchedBy: r.dispatched_by, dispatchedAt: r.dispatched_at,
    createdBy: r.created_by, createdByName: r.created_by_name, createdAt: r.created_at, updatedAt: r.updated_at,
    items: items.map(itemRow), statusHistory: history, returns,
  };
}
const itemRow = (it) => ({
  id: it.id, lineNo: it.line_no, productName: it.product_name, productCode: it.product_code, sku: it.sku, barcode: it.barcode,
  hsn: it.hsn, description: it.description, batchNo: it.batch_no, serialNo: it.serial_no,
  quantity: it.quantity, unit: it.unit, unitConversion: it.unit_conversion, grossWeight: it.gross_weight, netWeight: it.net_weight,
  rate: it.rate, taxableValue: it.taxable_value, declaredValue: it.declared_value, insuranceValue: it.insurance_value,
  gstRate: it.gst_rate, cgstAmount: it.cgst_amount, sgstAmount: it.sgst_amount, igstAmount: it.igst_amount,
  cessRate: it.cess_rate, cessAmount: it.cess_amount, warehouse: it.warehouse, rack: it.rack, bin: it.bin, returnedQty: it.returned_qty,
});

const SELECT = `SELECT c.*, b.code AS branch_code, b.name AS branch_name,
  u.name AS created_by_name, md.name AS challan_type_name
  FROM delivery_challans c
  LEFT JOIN gst_branches b ON b.id=c.branch_id
  LEFT JOIN users u ON u.id=c.created_by
  LEFT JOIN gst_master_data md ON md.category='dc_type' AND md.code=c.challan_type`;

// ── List with filters ───────────────────────────────────────────────────────
export async function list(db, q = {}) {
  const clauses = ['c.is_deleted = FALSE'];
  const p = [];
  const eq = (col, val) => { p.push(val); clauses.push(`${col}=$${p.length}`); };
  if (q.status) eq('c.status', q.status);
  if (q.challanType) eq('c.challan_type', q.challanType);
  if (q.branchId && q.branchId !== 'all') eq('c.branch_id', q.branchId);
  if (q.from) { p.push(q.from); clauses.push(`c.challan_date >= $${p.length}`); }
  if (q.to) { p.push(q.to); clauses.push(`c.challan_date <= $${p.length}`); }
  if (q.search) {
    p.push(`%${q.search}%`);
    clauses.push(`(c.challan_no ILIKE $${p.length} OR c.consignee->>'legalName' ILIKE $${p.length}
      OR c.consignee->>'gstin' ILIKE $${p.length} OR c.ewb_no ILIKE $${p.length}
      OR c.transport->>'vehicleNo' ILIKE $${p.length} OR c.transport->>'transporterName' ILIKE $${p.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(`${SELECT} ${where} ORDER BY c.challan_date DESC, c.created_at DESC LIMIT ${Math.min(Number(q.limit) || 200, 500)}`, p);
  return rows.map((r) => rowToRecord(r));
}

export async function get(db, id) {
  const r = (await db.query(`${SELECT} WHERE c.id=$1`, [id])).rows[0];
  if (!r) throw new ApiError(404, 'Delivery challan not found');
  const items = (await db.query('SELECT * FROM delivery_challan_items WHERE challan_id=$1 ORDER BY line_no', [id])).rows;
  const history = (await db.query(
    `SELECT h.*, u.name AS user_name FROM delivery_challan_status_history h LEFT JOIN users u ON u.id=h.user_id
     WHERE h.challan_id=$1 ORDER BY h.created_at`, [id])).rows;
  const returns = (await db.query('SELECT * FROM delivery_challan_returns WHERE challan_id=$1 ORDER BY return_date DESC', [id])).rows;
  return rowToRecord(r, items, history, returns);
}

async function logStatus(db, id, from, to, note, userId) {
  await db.query(
    'INSERT INTO delivery_challan_status_history (challan_id, from_status, to_status, note, user_id) VALUES ($1,$2,$3,$4,$5)',
    [id, from, to, note || null, userId || null]);
  await recordAudit(db, { objectType: 'delivery_challan', objectId: id, eventType: 'status_changed', field: 'status', oldValue: from, newValue: to, message: note || `${from} → ${to}`, userId });
}

async function writeItems(db, challanId, items) {
  await db.query('DELETE FROM delivery_challan_items WHERE challan_id=$1', [challanId]);
  let line = 1;
  for (const it of items) {
    await db.query(
      `INSERT INTO delivery_challan_items
        (challan_id, line_no, product_name, product_code, sku, barcode, hsn, description, batch_no, serial_no,
         quantity, unit, unit_conversion, gross_weight, net_weight, rate, taxable_value, declared_value, insurance_value,
         gst_rate, cgst_amount, sgst_amount, igst_amount, cess_rate, cess_amount, warehouse, rack, bin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
      [challanId, it.lineNo || line, it.productName || '—', it.productCode || null, it.sku || null, it.barcode || null,
       it.hsn || null, it.description || null, it.batchNo || null, it.serialNo || null,
       n(it.quantity), it.unit || 'NOS', it.unitConversion || null, it.grossWeight || null, it.netWeight || null,
       n(it.rate), n(it.taxableValue), it.declaredValue ?? null, it.insuranceValue ?? null,
       n(it.gstRate), n(it.cgstAmount), n(it.sgstAmount), n(it.igstAmount), n(it.cessRate), n(it.cessAmount),
       it.warehouse || null, it.rack || null, it.bin || null]);
    line++;
  }
}

// ── Create ──────────────────────────────────────────────────────────────────
export async function create(db, body, userId) {
  await branches.ensureDefault(db);
  await series.ensureDefault(db);
  const branchId = body.branchId || await branches.getDefaultId(db);
  let challanNo = body.challanNo;
  if (!challanNo) {
    const b = branchId ? await branches.get(db, branchId).catch(() => null) : null;
    challanNo = await series.allocate(db, { branchId, docType: 'DC', branchCode: b?.code || '' }, userId)
      || `DC/${financialYear()}/${Date.now().toString().slice(-6)}`;
  }
  const { items, totals } = computeTotals(body.consignor, body.consignee, body.items || []);
  const { rows } = await db.query(
    `INSERT INTO delivery_challans
      (challan_no, challan_date, challan_time, fy, branch_id, challan_type, dispatch_reason, status, currency,
       remarks, internal_notes, consignor, consignee, consignee_kind, transport, is_interstate,
       ewb_no, ewb_date, ewb_valid_from, ewb_valid_to, ewb_distance,
       total_qty, taxable_value, cgst_value, sgst_value, igst_value, cess_value, total_value,
       source_invoice_id, prepared_by, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$29)
     RETURNING id`,
    [challanNo, body.challanDate || todayIST(), body.challanTime || null, financialYear(),
     branchId, body.challanType || 'job_work', body.dispatchReason || null, body.currency || 'INR',
     body.remarks || null, body.internalNotes || null,
     JSON.stringify(body.consignor || {}), JSON.stringify(body.consignee || {}), body.consigneeKind || 'registered',
     JSON.stringify(body.transport || {}), totals.interState,
     body.ewbNo || null, body.ewbDate || null, body.ewbValidFrom || null, body.ewbValidTo || null, body.ewbDistance || null,
     totals.totalQty, totals.taxableValue, totals.cgstValue, totals.sgstValue, totals.igstValue, totals.cessValue, totals.totalValue,
     body.sourceInvoiceId || null, userId]);
  const id = rows[0].id;
  await writeItems(db, id, items);
  await recordAudit(db, { objectType: 'delivery_challan', objectId: id, eventType: 'created', message: `Challan ${challanNo} created`, userId });
  await logStatus(db, id, null, 'draft', 'Created', userId);
  return get(db, id);
}

// ── Update (only in editable states) ────────────────────────────────────────
export async function update(db, id, body, userId) {
  const cur = (await db.query('SELECT * FROM delivery_challans WHERE id=$1', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'Delivery challan not found');
  if (!EDITABLE.has(cur.status)) throw new ApiError(409, `A challan in “${cur.status}” status cannot be edited.`);
  const consignor = body.consignor ?? cur.consignor;
  const consignee = body.consignee ?? cur.consignee;
  const { items, totals } = computeTotals(consignor, consignee, body.items || []);
  await db.query(
    `UPDATE delivery_challans SET
       challan_date=COALESCE($2,challan_date), challan_time=$3, challan_type=COALESCE($4,challan_type),
       dispatch_reason=$5, remarks=$6, internal_notes=$7, consignor=$8, consignee=$9, consignee_kind=COALESCE($10,consignee_kind),
       transport=$11, is_interstate=$12, ewb_no=$13, ewb_date=$14, ewb_valid_from=$15, ewb_valid_to=$16, ewb_distance=$17,
       total_qty=$18, taxable_value=$19, cgst_value=$20, sgst_value=$21, igst_value=$22, cess_value=$23, total_value=$24
     WHERE id=$1`,
    [id, body.challanDate || null, body.challanTime || null, body.challanType || null, body.dispatchReason || null,
     body.remarks ?? cur.remarks, body.internalNotes ?? cur.internal_notes,
     JSON.stringify(consignor || {}), JSON.stringify(consignee || {}), body.consigneeKind || null,
     JSON.stringify(body.transport ?? cur.transport ?? {}), totals.interState,
     body.ewbNo || null, body.ewbDate || null, body.ewbValidFrom || null, body.ewbValidTo || null, body.ewbDistance || null,
     totals.totalQty, totals.taxableValue, totals.cgstValue, totals.sgstValue, totals.igstValue, totals.cessValue, totals.totalValue]);
  if (body.items) await writeItems(db, id, items);
  await recordAudit(db, { objectType: 'delivery_challan', objectId: id, eventType: 'edited', message: 'Challan edited', userId });
  return get(db, id);
}

// ── Lifecycle transitions ───────────────────────────────────────────────────
async function requireStatus(db, id, allowed) {
  const cur = (await db.query('SELECT * FROM delivery_challans WHERE id=$1', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'Delivery challan not found');
  if (!allowed.includes(cur.status)) throw new ApiError(409, `Action not allowed from “${cur.status}” status.`);
  return cur;
}

export async function submitForApproval(db, id, userId) {
  const cur = await requireStatus(db, id, ['draft', 'rejected']);
  const items = (await db.query('SELECT 1 FROM delivery_challan_items WHERE challan_id=$1 LIMIT 1', [id])).rows;
  if (!items.length) throw new ApiError(422, 'Add at least one line item before submitting for approval.');
  await db.query("UPDATE delivery_challans SET status='pending_approval' WHERE id=$1", [id]);
  await logStatus(db, id, cur.status, 'pending_approval', 'Submitted for approval', userId);
  return get(db, id);
}

export async function approve(db, id, userId) {
  const cur = await requireStatus(db, id, ['pending_approval']);
  await db.query("UPDATE delivery_challans SET status='approved', approved_by=$2, approved_at=now() WHERE id=$1", [id, userId]);
  await logStatus(db, id, cur.status, 'approved', 'Approved', userId);
  return get(db, id);
}

export async function reject(db, id, reason, userId) {
  const cur = await requireStatus(db, id, ['pending_approval']);
  await db.query("UPDATE delivery_challans SET status='rejected' WHERE id=$1", [id]);
  await logStatus(db, id, cur.status, 'rejected', reason || 'Rejected', userId);
  return get(db, id);
}

export async function dispatch(db, id, body = {}, userId) {
  // Single-operator model: no approval gate — dispatch directly from draft.
  const cur = await requireStatus(db, id, ['draft', 'pending_approval', 'approved', 'rejected']);
  const hasItems = (await db.query('SELECT 1 FROM delivery_challan_items WHERE challan_id=$1 LIMIT 1', [id])).rows.length;
  if (!hasItems) throw new ApiError(422, 'Add at least one line item before dispatching.');
  // record transport details captured at dispatch (vehicle/driver/LR/dispatch time)
  const transport = { ...(cur.transport || {}), ...(body.transport || {}) };
  await db.query("UPDATE delivery_challans SET status='dispatched', transport=$2, dispatched_by=$3, dispatched_at=now() WHERE id=$1",
    [id, JSON.stringify(transport), userId]);
  await logStatus(db, id, cur.status, 'dispatched', body.note || 'Dispatched', userId);
  return get(db, id);
}

export async function markInTransit(db, id, userId) {
  const cur = await requireStatus(db, id, ['dispatched']);
  await db.query("UPDATE delivery_challans SET status='in_transit' WHERE id=$1", [id]);
  await logStatus(db, id, cur.status, 'in_transit', 'In transit', userId);
  return get(db, id);
}

export async function deliver(db, id, body = {}, userId) {
  const cur = await requireStatus(db, id, ['dispatched', 'in_transit', 'partially_delivered']);
  const partial = body.partial === true;
  const delivery = {
    date: body.date || todayIST(), time: body.time || null,
    receiverName: body.receiverName || null, receiverMobile: body.receiverMobile || null,
    signatureFile: body.signatureFile || null, podFile: body.podFile || null, gps: body.gps || null,
  };
  const to = partial ? 'partially_delivered' : 'delivered';
  await db.query('UPDATE delivery_challans SET status=$2, delivery=$3 WHERE id=$1', [id, to, JSON.stringify(delivery)]);
  await logStatus(db, id, cur.status, to, body.note || (partial ? 'Partially delivered' : 'Delivered'), userId);
  return get(db, id);
}

export async function returnGoods(db, id, body = {}, userId) {
  const cur = await requireStatus(db, id, ['dispatched', 'in_transit', 'delivered', 'partially_delivered']);
  await db.query(
    `INSERT INTO delivery_challan_returns (challan_id, return_date, return_qty, reason, damage_notes, transport, items, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, body.returnDate || todayIST(), n(body.returnQty), body.reason || null,
     body.damageNotes || null, JSON.stringify(body.transport || {}), JSON.stringify(body.items || []), userId]);
  // update returned_qty per item if provided
  for (const r of (body.items || [])) {
    if (r.itemId) await db.query('UPDATE delivery_challan_items SET returned_qty=returned_qty+$2 WHERE id=$1 AND challan_id=$3', [r.itemId, n(r.qty), id]);
  }
  await db.query("UPDATE delivery_challans SET status='returned' WHERE id=$1", [id]);
  await logStatus(db, id, cur.status, 'returned', body.reason || 'Goods returned', userId);
  return get(db, id);
}

export async function cancel(db, id, reason, userId) {
  const cur = await requireStatus(db, id, ['draft', 'pending_approval', 'approved', 'rejected']);
  await db.query("UPDATE delivery_challans SET status='cancelled' WHERE id=$1", [id]);
  await logStatus(db, id, cur.status, 'cancelled', reason || 'Cancelled', userId);
  return get(db, id);
}

export async function close(db, id, userId) {
  const cur = await requireStatus(db, id, ['delivered', 'partially_delivered', 'returned', 'converted']);
  await db.query("UPDATE delivery_challans SET status='closed' WHERE id=$1", [id]);
  await logStatus(db, id, cur.status, 'closed', 'Closed', userId);
  return get(db, id);
}

export async function softDelete(db, id, userId) {
  const cur = await requireStatus(db, id, ['draft', 'rejected', 'cancelled']);
  await db.query('UPDATE delivery_challans SET is_deleted=TRUE, deleted_at=now(), deleted_by=$2 WHERE id=$1', [id, userId]);
  await recordAudit(db, { objectType: 'delivery_challan', objectId: id, eventType: 'deleted', message: 'Challan deleted', userId });
  return { ok: true, deleted: id, status: cur.status };
}

// Recover a soft-deleted challan (§12 Recovery Center).
export async function restore(db, id, userId) {
  const r = (await db.query('SELECT id FROM delivery_challans WHERE id=$1 AND is_deleted=TRUE', [id])).rows[0];
  if (!r) throw new ApiError(404, 'Deleted challan not found');
  await db.query('UPDATE delivery_challans SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL WHERE id=$1', [id]);
  await recordAudit(db, { objectType: 'delivery_challan', objectId: id, eventType: 'restored', message: 'Challan recovered from deleted', userId });
  return get(db, id);
}

// ── Convert to a standard Tax Invoice (a real local invoice, not an e-invoice) ─
export async function convertToInvoice(db, id, userId) {
  const dc = await get(db, id);
  if (['cancelled', 'rejected', 'draft'].includes(dc.status)) throw new ApiError(409, `A challan in “${dc.status}” status cannot be converted.`);
  const cur = (await db.query('SELECT invoice_id FROM delivery_challans WHERE id=$1', [id])).rows[0];
  if (cur?.invoice_id) throw new ApiError(409, 'This challan has already been converted to an invoice.');
  const branch = dc.branchId ? await branches.get(db, dc.branchId).catch(() => null) : null;
  const invNo = await series.allocate(db, { branchId: dc.branchId, docType: 'INV', branchCode: branch?.code || '' }, userId)
    || `INV/${financialYear()}/${Date.now().toString().slice(-6)}`;
  const cee = dc.consignee || {};
  const r = await db.query(
    `INSERT INTO invoices
      (invoice_number, type, status, branch_id, customer_name, customer_gstin, billing_address, place_of_supply,
       taxable_amount, gst_amount, cgst_amount, sgst_amount, igst_amount, total_amount, issue_date, created_by)
     VALUES ($1,'tax','issued',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,$13) RETURNING *`,
    [invNo, dc.branchId || null, cee.legalName || cee.tradeName || '—', cee.gstin || null,
     [cee.addr1, cee.location, cee.pincode].filter(Boolean).join(', ') || null, cee.stateCode || cee.pos || null,
     dc.taxableValue, round2(n(dc.cgstValue) + n(dc.sgstValue) + n(dc.igstValue)), dc.cgstValue, dc.sgstValue, dc.igstValue, dc.totalValue, userId]);
  const inv = r.rows[0];
  const invSvc = await import('../invoiceService.js');
  await invSvc.writeItems(db, inv.id, dc.items.map((it) => ({
    lineNo: it.lineNo, description: it.productName, hsn: it.hsn, quantity: it.quantity, unit: it.unit, rate: it.rate,
    taxableValue: it.taxableValue, gstRate: it.gstRate, cgstAmount: it.cgstAmount, sgstAmount: it.sgstAmount, igstAmount: it.igstAmount,
    amount: round2(n(it.taxableValue) + n(it.cgstAmount) + n(it.sgstAmount) + n(it.igstAmount)),
  })));
  await db.query('UPDATE delivery_challans SET invoice_id=$2, status=$3 WHERE id=$1', [id, inv.id, 'converted']);
  await recordAudit(db, { objectType: 'delivery_challan', objectId: id, eventType: 'converted', message: `Converted to invoice ${invNo}`, userId });
  await logStatus(db, id, dc.status, 'converted', `Converted to invoice ${invNo}`, userId);
  return { challan: await get(db, id), invoice: inv };
}

// ── Create an e-Way Bill draft from this challan (links the two) ─────────────
export async function createEwbDraft(db, id, userId) {
  const dc = await get(db, id);
  const ewb = await import('./ewbService.js');
  const cor = dc.consignor || {}, cee = dc.consignee || {}, tr = dc.transport || {};
  const draft = await ewb.createDraft(db, {
    branchId: dc.branchId, docType: 'CHL', docNo: dc.challanNo, docDate: dc.challanDate,
    supplyType: 'O', subSupplyType: '8', // 8 = Others / job-work-ish; user can refine
    fromGstin: cor.gstin, fromTradeName: cor.legalName || cor.tradeName, fromAddr1: cor.addr1, fromPlace: cor.location, fromPincode: cor.pincode, fromStateCode: cor.stateCode,
    toGstin: cee.gstin, toTradeName: cee.legalName || cee.tradeName, toAddr1: cee.addr1, toPlace: cee.location, toPincode: cee.pincode, toStateCode: cee.stateCode || cee.pos,
    totInvValue: dc.totalValue, totalTaxable: dc.taxableValue,
    transMode: tr.mode === 'rail' ? '2' : tr.mode === 'air' ? '3' : tr.mode === 'ship' ? '4' : '1',
    vehicleNo: tr.vehicleNo, transporterName: tr.transporterName, transporterId: tr.transporterId,
    transDistance: dc.ewbDistance || 0,
    items: dc.items.map((it) => ({ description: it.productName, hsn: it.hsn, quantity: it.quantity, unit: it.unit, taxableAmount: it.taxableValue })),
  }, userId);
  await db.query('UPDATE delivery_challans SET ewb_id=$2 WHERE id=$1', [id, draft.id]);
  await recordAudit(db, { objectType: 'delivery_challan', objectId: id, eventType: 'ewb_linked', message: `e-Way Bill draft ${draft.docNo || draft.id} created from challan`, userId });
  return { challanId: id, ewb: draft };
}

// ── Dashboard stats ─────────────────────────────────────────────────────────
export async function stats(db, branchId) {
  const w = branchId && branchId !== 'all' ? 'AND branch_id=$1' : '';
  const p = branchId && branchId !== 'all' ? [branchId] : [];
  const byStatus = (await db.query(
    `SELECT status, count(*) c FROM delivery_challans WHERE is_deleted=FALSE ${w} GROUP BY status`, p)).rows
    .reduce((a, r) => { a[r.status] = Number(r.c); return a; }, {});
  const today = (await db.query(
    `SELECT count(*) c FROM delivery_challans WHERE is_deleted=FALSE AND challan_date=CURRENT_DATE ${w}`, p)).rows[0].c;
  const ewbExpiring = (await db.query(
    `SELECT count(*) c FROM delivery_challans WHERE is_deleted=FALSE AND ewb_valid_to IS NOT NULL
       AND ewb_valid_to BETWEEN now() AND now()+interval '24 hours' ${w}`, p)).rows[0].c;
  const active = ['draft', 'pending_approval', 'approved', 'dispatched', 'in_transit', 'partially_delivered']
    .reduce((s, k) => s + (byStatus[k] || 0), 0);
  const topTransporters = (await db.query(
    `SELECT transport->>'transporterName' AS name, count(*) c FROM delivery_challans
     WHERE is_deleted=FALSE AND transport->>'transporterName' IS NOT NULL ${w}
     GROUP BY 1 ORDER BY c DESC LIMIT 5`, p)).rows;
  const monthly = (await db.query(
    `SELECT to_char(date_trunc('month', challan_date),'Mon') AS month, count(*) c, COALESCE(sum(total_value),0) value
     FROM delivery_challans WHERE is_deleted=FALSE AND challan_date >= now()-interval '6 months' ${w}
     GROUP BY date_trunc('month', challan_date) ORDER BY date_trunc('month', challan_date)`, p)).rows;
  return {
    byStatus, active,
    today: Number(today),
    pendingApproval: byStatus.pending_approval || 0,
    pendingDelivery: (byStatus.dispatched || 0) + (byStatus.in_transit || 0),
    pendingReturns: byStatus.returned || 0,
    ewbExpiring: Number(ewbExpiring),
    topTransporters, monthly,
  };
}

// ── Register rows (for reports / export) ────────────────────────────────────
export async function register(db, q = {}) {
  const recs = await list(db, { ...q, limit: 1000 });
  const st = (c) => STATE_CODES[String(c || '').padStart(2, '0')] || '';
  return recs.map((c) => ({
    challan_no: c.challanNo, date: c.challanDate, type: c.challanTypeName || c.challanType,
    consignee: c.consignee?.legalName || c.consignee?.tradeName || '—',
    consignee_gstin: c.consignee?.gstin || '', to_state: st(c.consignee?.stateCode || c.consignee?.pos),
    vehicle: c.transport?.vehicleNo || '', transporter: c.transport?.transporterName || '',
    ewb_no: c.ewbNo || '', qty: c.totalQty, taxable: c.taxableValue, total: c.totalValue, status: c.status,
  }));
}
