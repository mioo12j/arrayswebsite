// ============================================================================
//  Multi-branch / multi-GSTIN service.
//  A branch carries its own GSTIN, legal/trade name, address and (for live mode)
//  its own API credentials. Documents are stamped with branch_id so search,
//  dashboards, reports and reconciliation can all segregate by branch.
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { company } from '../../config/company.js';
import { recordAudit } from './log.js';

export function rowToBranch(r) {
  if (!r) return null;
  const { api_credentials, ...rest } = r;
  return { ...rest, hasCredentials: !!api_credentials };
}

// Ensure at least one (default) branch exists — derived from the company config.
export async function ensureDefault(db) {
  const { rows } = await db.query('SELECT id FROM gst_branches LIMIT 1');
  if (rows.length) return;
  await db.query(
    `INSERT INTO gst_branches (code, name, gstin, legal_name, trade_name, addr1, place, pincode, state_code, email, is_default, is_active)
     VALUES ('HO','Head Office',$1,$2,$3,$4,$5,$6,$7,$8,TRUE,TRUE)`,
    [company.gstin, company.name, company.shortName, company.address, 'Madhubani', '847229', String(company.gstin || '10').slice(0, 2), company.email]
  );
}

export async function list(db, { activeOnly = false } = {}) {
  await ensureDefault(db);
  const { rows } = await db.query(`SELECT * FROM gst_branches ${activeOnly ? 'WHERE is_active=TRUE' : ''} ORDER BY is_default DESC, code`);
  return rows.map(rowToBranch);
}

export async function get(db, id) {
  const { rows } = await db.query('SELECT * FROM gst_branches WHERE id=$1', [id]);
  if (!rows[0]) throw new ApiError(404, 'Branch not found');
  return rowToBranch(rows[0]);
}

export async function getDefaultId(db) {
  await ensureDefault(db);
  const { rows } = await db.query('SELECT id FROM gst_branches WHERE is_default=TRUE OR is_active=TRUE ORDER BY is_default DESC LIMIT 1');
  return rows[0]?.id || null;
}

const FIELDS = ['code', 'name', 'gstin', 'legal_name', 'trade_name', 'addr1', 'addr2', 'place', 'pincode', 'state_code', 'phone', 'email'];

export async function create(db, body, userId) {
  if (!body.code || !body.name) throw new ApiError(400, 'Branch code and name are required.');
  const vals = FIELDS.map((f) => body[camel(f)] ?? body[f] ?? null);
  const { rows } = await db.query(
    `INSERT INTO gst_branches (${FIELDS.join(',')}, api_credentials, is_active)
     VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(',')}, $${FIELDS.length + 1}, TRUE) RETURNING *`,
    [...vals, body.apiCredentials ? JSON.stringify(body.apiCredentials) : null]
  ).catch((e) => { if (e.code === '23505') throw new ApiError(409, `Branch code “${body.code}” already exists.`); throw e; });
  await recordAudit(db, { objectType: 'branch', objectId: rows[0].id, eventType: 'created', message: `Branch ${body.code} created`, userId });
  return rowToBranch(rows[0]);
}

export async function update(db, id, body, userId) {
  const sets = []; const p = [id]; let i = 2;
  for (const f of FIELDS) { const v = body[camel(f)] ?? body[f]; if (v !== undefined) { sets.push(`${f}=$${i++}`); p.push(v); } }
  if (body.isActive !== undefined) { sets.push(`is_active=$${i++}`); p.push(!!body.isActive); }
  if (body.apiCredentials !== undefined) { sets.push(`api_credentials=$${i++}`); p.push(body.apiCredentials ? JSON.stringify(body.apiCredentials) : null); }
  if (!sets.length) return get(db, id);
  const { rows } = await db.query(`UPDATE gst_branches SET ${sets.join(',')} WHERE id=$1 RETURNING *`, p);
  if (!rows[0]) throw new ApiError(404, 'Branch not found');
  await recordAudit(db, { objectType: 'branch', objectId: id, eventType: 'edited', message: 'Branch updated', userId });
  return rowToBranch(rows[0]);
}

export async function setDefault(db, id, userId) {
  await db.query('UPDATE gst_branches SET is_default=FALSE WHERE is_default=TRUE');
  const { rows } = await db.query('UPDATE gst_branches SET is_default=TRUE, is_active=TRUE WHERE id=$1 RETURNING *', [id]);
  if (!rows[0]) throw new ApiError(404, 'Branch not found');
  await recordAudit(db, { objectType: 'branch', objectId: id, eventType: 'edited', message: 'Set as default branch', userId });
  return rowToBranch(rows[0]);
}

// Resolve a branch's identity for use as seller/from defaults on a document.
export async function sellerFromBranch(db, branchId) {
  if (!branchId) return null;
  const { rows } = await db.query('SELECT * FROM gst_branches WHERE id=$1', [branchId]);
  const b = rows[0];
  if (!b) return null;
  return { gstin: b.gstin, legalName: b.legal_name, tradeName: b.trade_name, addr1: b.addr1, addr2: b.addr2, location: b.place, place: b.place, pincode: b.pincode, stateCode: b.state_code, phone: b.phone, email: b.email, code: b.code };
}

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
