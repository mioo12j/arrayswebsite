// ============================================================================
//  Receipt helpers — client-ledger posting and soft delete / restore so an
//  incoming receipt can be removed (and its credit reversed) yet recovered from
//  the System Recovery Center. The settled value (cash + TDS + retention +
//  other deductions) is what reduces the client receivable.
// ============================================================================
import { postLedgerEntry, removeLedgerForSource, refreshInvoiceStatus } from './ledger.service.js';

const settledValue = (r) =>
  Number(r.credited_amount || 0) + Number(r.deduction_amount || 0) +
  Number(r.tds_amount || 0) + Number(r.retention_amount || 0);

export async function postReceiptLedger(db, r, userId) {
  await postLedgerEntry(db, {
    partyType: 'client', partyId: r.client_id, direction: 'credit',
    amount: settledValue(r), entryDate: r.credited_date,
    description: r.comment || `Receipt ${r.reference_id || ''}`.trim(),
    projectId: r.project_id, siteId: r.site_id, sourceType: 'receipt', sourceId: r.id, userId,
  });
}

// A vendor REFUND is money coming back from a vendor — it reduces the net amount
// paid to them, so it posts a CREDIT to the vendor's ledger (not client income).
export async function postRefundLedger(db, r, userId) {
  if (!r.vendor_id) return;
  await postLedgerEntry(db, {
    partyType: 'vendor', partyId: r.vendor_id, direction: 'credit',
    amount: Number(r.credited_amount || 0), entryDate: r.credited_date,
    description: r.comment || `Refund ${r.reference_id || ''}`.trim(),
    projectId: r.project_id, siteId: r.site_id, sourceType: 'receipt', sourceId: r.id, userId,
  });
}

// Post whichever ledger a receipt belongs to, based on its kind.
export async function postForKind(db, r, userId) {
  if (r.txn_kind === 'income' && r.client_id) return postReceiptLedger(db, r, userId);
  if (r.txn_kind === 'refund' && r.vendor_id) return postRefundLedger(db, r, userId);
}

// Soft delete → hidden everywhere, recoverable. The client-ledger credit is
// removed and the linked invoice's status is refreshed so receivables stay right.
export async function softDelete(db, id, userId) {
  const r = (await db.query('SELECT * FROM receipts WHERE id=$1', [id])).rows[0];
  if (!r) return null;
  await removeLedgerForSource(db, 'receipt', id);
  await db.query('UPDATE receipts SET is_deleted=TRUE, deleted_at=now(), deleted_by=$2 WHERE id=$1', [id, userId || null]);
  if (r.invoice_id) await refreshInvoiceStatus(db, r.invoice_id).catch(() => {});
  return r;
}

// Restore a soft-deleted receipt and re-post its client-ledger credit — but ONLY
// for real income. Internal transfers / financing / refunds / duplicates never
// credit a client, even after restore (they may still carry a client_id).
export async function restore(db, id, userId) {
  const { rows } = await db.query(
    'UPDATE receipts SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL WHERE id=$1 RETURNING *', [id]);
  const r = rows[0];
  if (!r) return null;
  await postForKind(db, r, userId);
  if (r.txn_kind === 'income' && r.invoice_id) await refreshInvoiceStatus(db, r.invoice_id).catch(() => {});
  return r;
}
