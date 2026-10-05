// ============================================================================
//  Ledger service — the automation core.
//  Posting a payment / receipt / invoice creates double-sided ledger entries
//  against the vendor or client. Balances are derived from these entries
//  (see v_vendor_balances / v_client_balances views) so they always reconcile.
// ============================================================================

/**
 * Post a ledger entry. Accepts a pg client (inside a transaction) or falls
 * back to the pool query.
 */
export async function postLedgerEntry(db, {
  partyType,           // 'vendor' | 'client'
  partyId,
  direction,           // 'debit' | 'credit'
  amount,
  entryDate,
  description,
  projectId = null,
  siteId = null,
  sourceType,          // 'payment' | 'receipt' | 'invoice' | 'opening' | 'adjustment'
  sourceId,
  userId = null,
}) {
  if (!partyId || !amount) return null;
  const { rows } = await db.query(
    `INSERT INTO ledger_entries
      (party_type, party_id, direction, amount, entry_date, description,
       project_id, site_id, source_type, source_id, created_by)
     VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [partyType, partyId, direction, amount, entryDate, description,
     projectId, siteId, sourceType, sourceId, userId]
  );
  return rows[0];
}

/** Remove all ledger entries originating from a given source record. */
export async function removeLedgerForSource(db, sourceType, sourceId) {
  await db.query(
    'DELETE FROM ledger_entries WHERE source_type=$1 AND source_id=$2',
    [sourceType, sourceId]
  );
}

/**
 * Recomputes an invoice's amount_received from linked receipts and updates its
 * status accordingly.
 */
export async function refreshInvoiceStatus(db, invoiceId) {
  if (!invoiceId) return;
  const { rows: inv } = await db.query('SELECT * FROM invoices WHERE id=$1', [invoiceId]);
  if (!inv[0]) return;
  const invoice = inv[0];

  const { rows: agg } = await db.query(
    `SELECT COALESCE(SUM(credited_amount + deduction_amount + tds_amount + retention_amount),0) AS received
       FROM receipts WHERE invoice_id=$1 AND is_deleted=FALSE AND txn_kind='income'`,
    [invoiceId]
  );
  const received = agg[0].received;

  let status = invoice.status;
  if (status !== 'closed' && status !== 'draft') {
    if (received <= 0) status = invoice.status === 'paid' ? 'raised' : invoice.status;
    else if (received < invoice.total_amount) status = 'partially_paid';
    else status = 'paid';

    // Overdue check (only if not fully paid)
    if (status !== 'paid' && invoice.due_date && new Date(invoice.due_date) < new Date()) {
      status = 'overdue';
    }
  }

  await db.query('UPDATE invoices SET amount_received=$1, status=$2 WHERE id=$3', [
    received, status, invoiceId,
  ]);
}
