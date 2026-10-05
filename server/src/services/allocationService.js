// ============================================================================
//  Payment allocation / tagging — splits a single bank transaction (receipt or
//  payment) across projects / sites / milestones, or "Other" (free text). These
//  live in their own tables and NEVER touch the original receipts/payments rows
//  (amount, date, reference, party stay locked). Allocation total must not
//  exceed the transaction amount; when any line is present it must equal it.
// ============================================================================
import { ApiError } from '../utils/asyncHandler.js';

const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const sum = (items) => r2((items || []).reduce((s, x) => s + Number(x.amount || 0), 0));

function validate(items, amount) {
  const clean = (items || []).filter((x) => Number(x.amount || 0) > 0 || x.project_id || x.site_id || x.milestone_id || (x.description && x.description.trim()));
  const total = sum(clean);
  const amt = r2(amount);
  if (total - amt > 0.01) throw new ApiError(400, `Allocations total ₹${total.toLocaleString('en-IN')} exceed the payment amount ₹${amt.toLocaleString('en-IN')}.`);
  if (clean.length && Math.abs(total - amt) > 0.01) {
    throw new ApiError(400, `Total allocation (₹${total.toLocaleString('en-IN')}) must equal the payment amount (₹${amt.toLocaleString('en-IN')}). ₹${r2(amt - total).toLocaleString('en-IN')} is still unallocated.`);
  }
  return clean;
}

// ── Incoming (receipts): project + milestone + Other ────────────────────────
export async function getReceiptAllocations(db, receiptId) {
  const { rows } = await db.query(
    `SELECT a.*, pr.name AS project_name, t.title AS milestone_title
       FROM incoming_payment_allocations a
       LEFT JOIN projects pr ON pr.id = a.project_id
       LEFT JOIN project_payment_terms t ON t.id = a.milestone_id
      WHERE a.receipt_id = $1 ORDER BY a.created_at`, [receiptId]);
  return rows;
}

export async function setReceiptAllocations(db, receiptId, items, amount) {
  const clean = validate(items, amount);
  await db.query('DELETE FROM incoming_payment_allocations WHERE receipt_id=$1', [receiptId]);
  for (const it of clean) {
    await db.query(
      `INSERT INTO incoming_payment_allocations (receipt_id, project_id, milestone_id, description, amount)
       VALUES ($1,$2,$3,$4,$5)`,
      [receiptId, it.project_id || null, it.milestone_id || null, it.description || null, r2(it.amount)]);
  }
  return getReceiptAllocations(db, receiptId);
}

// ── Outgoing (payments): project + site + Other ─────────────────────────────
export async function getPaymentAllocations(db, paymentId) {
  const { rows } = await db.query(
    `SELECT a.*, pr.name AS project_name, s.name AS site_name
       FROM outgoing_payment_allocations a
       LEFT JOIN projects pr ON pr.id = a.project_id
       LEFT JOIN sites s ON s.id = a.site_id
      WHERE a.payment_id = $1 ORDER BY a.created_at`, [paymentId]);
  return rows;
}

export async function setPaymentAllocations(db, paymentId, items, amount) {
  const clean = validate(items, amount);
  await db.query('DELETE FROM outgoing_payment_allocations WHERE payment_id=$1', [paymentId]);
  for (const it of clean) {
    await db.query(
      `INSERT INTO outgoing_payment_allocations (payment_id, project_id, site_id, description, amount)
       VALUES ($1,$2,$3,$4,$5)`,
      [paymentId, it.project_id || null, it.site_id || null, it.description || null, r2(it.amount)]);
  }
  return getPaymentAllocations(db, paymentId);
}
