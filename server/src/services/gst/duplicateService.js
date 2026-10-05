// ============================================================================
//  #8 Duplicate-prevention engine — catches near-identical invoices before
//  submission. Warn mode (default) flags; block mode hard-stops without an
//  override + reason. Recon/notifications detect after the fact; this is the
//  entry-time guard.
// ============================================================================

export function mode() {
  return String(process.env.GST_DUP_MODE || 'warn').toLowerCase(); // warn | block
}

// Find likely duplicates of an e-invoice being created/edited.
export async function check(db, { buyerGstin, docDate, totalInvVal, docNo, branchId, excludeId } = {}) {
  const out = { exactDocNo: [], near: [], mode: mode() };

  // Exact document-number clash within the same branch (a hard integrity issue).
  if (docNo) {
    const { rows } = await db.query(
      `SELECT id, doc_no, buyer_name, total_inv_val, status, created_at
       FROM gst_einvoices
       WHERE is_deleted=FALSE AND doc_no=$1 AND ($2::uuid IS NULL OR branch_id=$2) AND ($3::uuid IS NULL OR id<>$3)`,
      [docNo, branchId || null, excludeId || null]);
    out.exactDocNo = rows;
  }

  // Near-duplicate pattern: same customer + date + value.
  if (buyerGstin && docDate && totalInvVal != null) {
    const { rows } = await db.query(
      `SELECT id, doc_no, buyer_name, total_inv_val, status, created_at
       FROM gst_einvoices
       WHERE is_deleted=FALSE AND is_cancelled=FALSE AND buyer_gstin=$1 AND doc_date=$2
         AND abs(coalesce(total_inv_val,0) - $3) < 1 AND ($4::uuid IS NULL OR id<>$4)`,
      [buyerGstin, docDate, Number(totalInvVal), excludeId || null]);
    out.near = rows;
  }

  out.hasExact = out.exactDocNo.length > 0;
  out.hasNear = out.near.length > 0;
  out.blocked = mode() === 'block' && out.hasExact;
  return out;
}
