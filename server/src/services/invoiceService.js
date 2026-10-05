// ============================================================================
//  §2/§3/§4 Standard Invoice service — accounting-grade invoices with line
//  items, CGST/SGST/IGST, addresses, and bidirectional e-Way-Bill linkage.
//  Standard invoices live in `invoices` (+ invoice_items); GST e-invoices live
//  in gst_einvoices. The unified list merges both for one dashboard.
// ============================================================================
import { company } from '../config/company.js';
import { postLedgerEntry, removeLedgerForSource, refreshInvoiceStatus } from './ledger.service.js';

const n = (v) => Number(v || 0);
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const SELLER_STATE_DEFAULT = String(company.gstin || '09').slice(0, 2);

// CGST+SGST when place-of-supply matches the seller state, else IGST.
export function computeInvoiceTotals(placeOfSupply, sellerState, items = []) {
  const pos = String(placeOfSupply || '').padStart(2, '0');
  const seller = String(sellerState || SELLER_STATE_DEFAULT).padStart(2, '0');
  const inter = pos && seller ? pos !== seller : false;
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const rows = items.map((it, i) => {
    const qty = n(it.quantity) || 0;
    const base = it.taxableValue != null && it.taxableValue !== '' ? n(it.taxableValue) : qty * n(it.rate);
    const tax = round2(base * n(it.gstRate) / 100);
    // Running-account quantities: present = quantity, previous = prior bills,
    // order = total contracted (defaults to present + previous when omitted).
    const prevQty = n(it.previousQty);
    const orderQty = it.orderQty != null && it.orderQty !== '' ? n(it.orderQty) : round2(prevQty + qty);
    const row = {
      lineNo: it.lineNo || i + 1, description: it.description || '—', hsn: it.hsn || null,
      quantity: qty, unit: it.unit || 'NOS', rate: n(it.rate), taxableValue: round2(base), gstRate: n(it.gstRate),
      cgstAmount: inter ? 0 : round2(tax / 2), sgstAmount: inter ? 0 : round2(tax / 2), igstAmount: inter ? tax : 0,
      amount: round2(base + tax), previousQty: prevQty, orderQty,
    };
    taxable += base; cgst += row.cgstAmount; sgst += row.sgstAmount; igst += row.igstAmount;
    return row;
  });
  const gst = round2(cgst + sgst + igst);
  return {
    inter, items: rows,
    totals: { taxable: round2(taxable), cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst), gst, total: round2(taxable + gst) },
  };
}

export async function sellerStateFor(db, branchId) {
  if (!branchId) return SELLER_STATE_DEFAULT;
  try { const r = (await db.query('SELECT state_code FROM gst_branches WHERE id=$1', [branchId])).rows[0]; return r?.state_code || SELLER_STATE_DEFAULT; }
  catch { return SELLER_STATE_DEFAULT; }
}

export async function writeItems(db, invoiceId, items) {
  await db.query('DELETE FROM invoice_items WHERE invoice_id=$1', [invoiceId]);
  let line = 1;
  for (const it of items) {
    await db.query(
      `INSERT INTO invoice_items (invoice_id, line_no, description, hsn, quantity, unit, rate, taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, amount, order_qty, previous_qty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [invoiceId, it.lineNo || line, it.description, it.hsn, n(it.quantity), it.unit || 'NOS', n(it.rate),
       n(it.taxableValue), n(it.gstRate), n(it.cgstAmount), n(it.sgstAmount), n(it.igstAmount), n(it.amount),
       it.orderQty != null ? n(it.orderQty) : null, n(it.previousQty)]);
    line++;
  }
}

export async function items(db, invoiceId) {
  const { rows } = await db.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY line_no', [invoiceId]);
  return rows;
}

// Soft delete → record is hidden everywhere but recoverable from the Recovery
// Center. The client billing-ledger debit is removed so balances stay correct.
export async function softDelete(db, id, userId) {
  const inv = (await db.query('SELECT * FROM invoices WHERE id=$1', [id])).rows[0];
  if (!inv) return null;
  await removeLedgerForSource(db, 'invoice', id);
  await db.query('UPDATE invoices SET is_deleted=TRUE, deleted_at=now(), deleted_by=$2 WHERE id=$1', [id, userId || null]);
  return inv;
}

// Restore a soft-deleted invoice and re-post its ledger debit (if it was issued).
export async function restore(db, id, userId) {
  const { rows } = await db.query(
    'UPDATE invoices SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL WHERE id=$1 RETURNING *', [id]);
  const inv = rows[0];
  if (!inv) return null;
  if (inv.status !== 'draft' && inv.client_id) {
    await postLedgerEntry(db, {
      partyType: 'client', partyId: inv.client_id, direction: 'debit',
      amount: inv.total_amount, entryDate: inv.issue_date, description: `Invoice ${inv.invoice_number}`,
      projectId: inv.project_id, siteId: inv.site_id, sourceType: 'invoice', sourceId: inv.id, userId,
    });
  }
  await refreshInvoiceStatus(db, inv.id).catch(() => {});
  return inv;
}

// ── Unified dashboard: standard invoices (BLUE) + GST e-invoices (GREEN) ─────
export async function listUnified(db, q = {}) {
  const standard = (await db.query(
    `SELECT i.id, i.invoice_number, i.status::text AS status, i.issue_date AS date,
            i.total_amount AS amount, COALESCE(i.customer_name, c.name) AS party,
            i.customer_gstin AS gstin, u.name AS created_by_name,
            w.ewb_no AS linked_ewb_no, w.status::text AS linked_ewb_status, w.id AS linked_ewb_id
       FROM invoices i
       LEFT JOIN clients c ON c.id=i.client_id
       LEFT JOIN users u ON u.id=i.created_by
       LEFT JOIN gst_eway_bills w ON w.id=i.linked_ewb_id
      WHERE i.is_deleted=FALSE
      ORDER BY i.issue_date DESC NULLS LAST, i.created_at DESC LIMIT 500`)).rows
    .map((r) => ({ ...r, type: 'standard' }));

  let einv = [];
  try {
    einv = (await db.query(
      `SELECT e.id, e.doc_no AS invoice_number, e.status::text AS status, e.doc_date AS date,
              e.total_inv_val AS amount, e.buyer_name AS party, e.buyer_gstin AS gstin,
              e.irn, u.name AS created_by_name,
              w.ewb_no AS linked_ewb_no, w.status::text AS linked_ewb_status, w.id AS linked_ewb_id
         FROM gst_einvoices e
         LEFT JOIN users u ON u.id=e.created_by
         LEFT JOIN gst_eway_bills w ON w.source_einvoice_id=e.id
        WHERE e.is_deleted=FALSE
        ORDER BY e.doc_date DESC NULLS LAST, e.created_at DESC LIMIT 500`)).rows
      .map((r) => ({ ...r, type: 'einvoice' }));
  } catch { einv = []; }

  let all = [...standard, ...einv];
  if (q.type === 'standard') all = standard;
  else if (q.type === 'einvoice') all = einv;
  if (q.status) all = all.filter((r) => r.status === q.status);
  if (q.search) { const s = q.search.toLowerCase(); all = all.filter((r) => `${r.invoice_number} ${r.party || ''} ${r.gstin || ''}`.toLowerCase().includes(s)); }
  all.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return all;
}
