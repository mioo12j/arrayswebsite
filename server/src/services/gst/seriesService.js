// ============================================================================
//  Invoice Number Series Manager
//  FY-aware, branch-aware, document-type-aware numbering with a token template.
//  Tokens: {BRANCH} {FY} {DOCTYPE} {SEQ}.  Allocation is atomic (row lock).
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';

// Indian financial year label for a date, e.g. 25-26.
export function financialYear(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const start = dt.getMonth() >= 3 ? y : y - 1; // FY starts April
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function format(series, seqNum, branchCode = '') {
  const fy = series.current_fy || financialYear();
  const seq = String(seqNum).padStart(series.padding || 6, '0');
  let s = series.prefix || '';
  s = s.replace(/\{BRANCH\}/gi, branchCode || '')
       .replace(/\{FY\}/gi, fy)
       .replace(/\{DOCTYPE\}/gi, series.doc_type || '');
  if (/\{SEQ\}/i.test(s)) s = s.replace(/\{SEQ\}/gi, seq);
  else s += seq;
  // Tidy up when an optional token (e.g. {BRANCH}) resolved to empty: drop a
  // leading separator and collapse any doubled ones, so a no-branch invoice reads
  // "26-27/00001" not "/26-27/00001".
  return s.replace(/([/\-]){2,}/g, '$1').replace(/^[/\-]+/, '');
}

export async function list(db, { branchId } = {}) {
  const cl = []; const p = [];
  if (branchId) { p.push(branchId); cl.push(`(s.branch_id=$${p.length} OR s.branch_id IS NULL)`); }
  const where = cl.length ? `WHERE ${cl.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT s.*, b.code AS branch_code, b.name AS branch_name FROM gst_number_series s
     LEFT JOIN gst_branches b ON b.id=s.branch_id ${where} ORDER BY b.code NULLS FIRST, s.doc_type`, p);
  return rows.map((r) => ({ ...r, preview: format(r, r.next_number, r.branch_code) }));
}

export async function create(db, body, userId) {
  const { rows } = await db.query(
    `INSERT INTO gst_number_series (branch_id, doc_type, name, prefix, padding, next_number, fy_reset, current_fy, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
    [body.branchId || null, body.docType || 'INV', body.name || null, body.prefix || '{FY}/', Number(body.padding) || 6,
     Number(body.nextNumber) || 1, body.fyReset !== false, body.currentFy || financialYear()]
  );
  await recordAudit(db, { objectType: 'series', objectId: rows[0].id, eventType: 'created', message: `Number series ${body.prefix || ''} created`, userId });
  return rows[0];
}

export async function update(db, id, body, userId) {
  const cur = (await db.query('SELECT * FROM gst_number_series WHERE id=$1', [id])).rows[0];
  if (!cur) throw new ApiError(404, 'Series not found');
  if (cur.is_locked && (body.prefix !== undefined || body.nextNumber !== undefined || body.padding !== undefined))
    throw new ApiError(409, 'This series is locked and its numbering rule cannot be changed.');
  const { rows } = await db.query(
    `UPDATE gst_number_series SET
       doc_type=COALESCE($2,doc_type), name=COALESCE($3,name), prefix=COALESCE($4,prefix),
       padding=COALESCE($5,padding), next_number=COALESCE($6,next_number), fy_reset=COALESCE($7,fy_reset),
       is_locked=COALESCE($8,is_locked), is_active=COALESCE($9,is_active), branch_id=COALESCE($10,branch_id)
     WHERE id=$1 RETURNING *`,
    [id, body.docType ?? null, body.name ?? null, body.prefix ?? null, body.padding ?? null,
     body.nextNumber ?? null, body.fyReset ?? null, body.isLocked ?? null, body.isActive ?? null, body.branchId ?? null]
  );
  await recordAudit(db, { objectType: 'series', objectId: id, eventType: 'edited', message: 'Number series updated', userId });
  return rows[0];
}

export async function remove(db, id, userId) {
  await db.query('DELETE FROM gst_number_series WHERE id=$1', [id]);
  await recordAudit(db, { objectType: 'series', objectId: id, eventType: 'deleted', message: 'Number series removed', userId });
  return { ok: true };
}

// Find the best-matching active series for (branch, docType): branch-specific first.
async function pick(db, branchId, docType) {
  const { rows } = await db.query(
    `SELECT * FROM gst_number_series
     WHERE is_active=TRUE AND doc_type=$2 AND (branch_id=$1 OR branch_id IS NULL)
     ORDER BY (branch_id=$1) DESC NULLS LAST LIMIT 1`, [branchId || null, docType]);
  return rows[0] || null;
}

// Atomically allocate (consume) the next number. Handles FY reset.
export async function allocate(db, { branchId, docType = 'INV', branchCode = '' }, userId) {
  const base = await pick(db, branchId, docType);
  if (!base) return null; // no series configured → caller falls back to manual numbering
  const locked = (await db.query('SELECT * FROM gst_number_series WHERE id=$1 FOR UPDATE', [base.id])).rows[0];
  const fy = financialYear();
  let seq = locked.next_number;
  let curFy = locked.current_fy;
  if (locked.fy_reset && curFy && curFy !== fy) { seq = 1; curFy = fy; }
  else if (!curFy) curFy = fy;
  const number = format({ ...locked, current_fy: curFy }, seq, branchCode);
  await db.query('UPDATE gst_number_series SET next_number=$2, current_fy=$3 WHERE id=$1', [locked.id, seq + 1, curFy]);
  await recordAudit(db, { objectType: 'series', objectId: locked.id, eventType: 'allocated', field: 'number', newValue: number, message: `Allocated ${number}`, userId });
  return number;
}

// Non-consuming preview of the next number.
export async function preview(db, { branchId, docType = 'INV', branchCode = '' }) {
  const base = await pick(db, branchId, docType);
  if (!base) return null;
  return format(base, base.next_number, branchCode);
}

// Seed a sensible default series for the default branch (idempotent).
export async function ensureDefault(db) {
  const { rows } = await db.query('SELECT id FROM gst_number_series LIMIT 1');
  if (rows.length) return;
  // branch_id NULL = applies to ALL branches; the {BRANCH} token fills from the
  // branch the document is created under, so every branch gets numbered.
  // padding 5 keeps the number ≤16 chars (the IRP limit) for branch codes ≤4 chars,
  // e.g. BR03/26-27/00015 (16). HO/26-27/00001 (14).
  await db.query(
    `INSERT INTO gst_number_series (branch_id, doc_type, name, prefix, padding, next_number, fy_reset, current_fy)
     VALUES (NULL,'INV','Tax Invoice (all branches)','{BRANCH}/{FY}/',5,1,TRUE,$1)`,
    [financialYear()]
  );
}
