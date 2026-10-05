// ============================================================================
//  Payment helpers — payee-ledger posting and soft delete / restore so an
//  outgoing payment can be removed (and its debit reversed) yet recovered from
//  the System Recovery Center. A payment posts to exactly one payee ledger:
//  the employee if set, otherwise the vendor.
// ============================================================================
import { postLedgerEntry, removeLedgerForSource } from './ledger.service.js';
import { normalizeName } from './vendor-match.service.js';

// Find an existing employee by (fuzzy) name, or create one from the payment's
// beneficiary name. Used when the operator pays an "employee" who isn't in the
// Employee Master yet — the payee is added automatically.
export async function findOrCreateEmployee(db, name) {
  const clean = String(name || '').trim();
  if (clean.length < 2) return null;
  const norm = normalizeName(name);
  const m = (await db.query(
    `SELECT id FROM employees
      WHERE is_active=TRUE
        AND GREATEST(similarity(name,$1), word_similarity($1,name), word_similarity(name,$1)) > 0.5
      ORDER BY GREATEST(similarity(name,$1), word_similarity($1,name), word_similarity(name,$1)) DESC
      LIMIT 1`, [norm || clean])).rows[0];
  if (m) return { id: m.id, created: false };
  const { rows } = await db.query(
    `INSERT INTO employees (name, is_active, notes) VALUES ($1, TRUE, 'Auto-created from a payment') RETURNING id`,
    [clean]);
  return { id: rows[0].id, created: true };
}

export async function postPaymentLedger(db, pay, userId) {
  if (pay.employee_id) {
    await postLedgerEntry(db, {
      partyType: 'employee', partyId: pay.employee_id, direction: 'debit',
      amount: pay.amount, entryDate: pay.payment_date, description: pay.comment,
      projectId: pay.project_id, siteId: pay.site_id, sourceType: 'payment', sourceId: pay.id, userId,
    });
  } else if (pay.vendor_id) {
    await postLedgerEntry(db, {
      partyType: 'vendor', partyId: pay.vendor_id, direction: 'debit',
      amount: pay.amount, entryDate: pay.payment_date, description: pay.comment,
      projectId: pay.project_id, siteId: pay.site_id, sourceType: 'payment', sourceId: pay.id, userId,
    });
  }
}

// Soft delete → hidden everywhere, recoverable. The payee-ledger debit is
// removed so the vendor/employee balance stays correct.
export async function softDelete(db, id, userId) {
  const pay = (await db.query('SELECT * FROM payments WHERE id=$1', [id])).rows[0];
  if (!pay) return null;
  await removeLedgerForSource(db, 'payment', id);
  await db.query('UPDATE payments SET is_deleted=TRUE, deleted_at=now(), deleted_by=$2 WHERE id=$1', [id, userId || null]);
  return pay;
}

// Restore a soft-deleted payment and re-post its payee-ledger debit — but ONLY
// for real expenses. Internal transfers / financing / duplicates must never hit
// a party ledger even after restore (they may still carry a vendor_id).
export async function restore(db, id, userId) {
  const { rows } = await db.query(
    'UPDATE payments SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL WHERE id=$1 RETURNING *', [id]);
  const pay = rows[0];
  if (!pay) return null;
  if (pay.txn_kind === 'expense') await postPaymentLedger(db, pay, userId);
  return pay;
}
