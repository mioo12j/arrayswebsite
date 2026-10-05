// ============================================================================
//  #5 Saved Views & Personal Workspaces.
//  Private / Team / Company scoped saved filters, pinnable, cloneable,
//  shareable, with a per-user default. Synced across sessions (server-stored).
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';

const SCOPES = new Set(['private', 'team', 'company']);

// List the views visible to a user: their own, plus team/company shared views.
export async function list(db, userId, objectType) {
  const p = [userId]; let typeSql = '';
  if (objectType) { p.push(objectType); typeSql = `AND object_type=$2`; }
  const { rows } = await db.query(
    `SELECT v.*, u.name AS owner_name, (v.user_id=$1) AS is_owner FROM gst_saved_views v
     LEFT JOIN users u ON u.id=v.user_id
     WHERE (v.user_id=$1 OR v.scope IN ('team','company')) ${typeSql}
     ORDER BY v.is_pinned DESC, v.scope, v.name`, p);
  return rows;
}

export async function create(db, body, userId) {
  if (!body.name) throw new ApiError(400, 'A view name is required.');
  const scope = SCOPES.has(body.scope) ? body.scope : 'private';
  const { rows } = await db.query(
    `INSERT INTO gst_saved_views (user_id, name, scope, object_type, filters, is_pinned)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [userId, body.name, scope, body.objectType || 'einvoice', JSON.stringify(body.filters || {}), !!body.isPinned]);
  await recordAudit(db, { objectType: 'view', objectId: rows[0].id, eventType: 'created', message: `Saved view “${body.name}” (${scope})`, userId });
  return rows[0];
}

async function owned(db, id, userId) {
  const { rows } = await db.query('SELECT * FROM gst_saved_views WHERE id=$1', [id]);
  if (!rows[0]) throw new ApiError(404, 'View not found');
  if (rows[0].user_id !== userId) throw new ApiError(403, 'Only the owner can modify this view.');
  return rows[0];
}

export async function update(db, id, body, userId) {
  await owned(db, id, userId);
  const { rows } = await db.query(
    `UPDATE gst_saved_views SET name=COALESCE($2,name), scope=COALESCE($3,scope), filters=COALESCE($4,filters), is_pinned=COALESCE($5,is_pinned) WHERE id=$1 RETURNING *`,
    [id, body.name ?? null, body.scope && SCOPES.has(body.scope) ? body.scope : null, body.filters ? JSON.stringify(body.filters) : null, body.isPinned ?? null]);
  return rows[0];
}

export async function remove(db, id, userId) {
  await owned(db, id, userId);
  await db.query('DELETE FROM gst_saved_views WHERE id=$1', [id]);
  return { ok: true };
}

export async function clone(db, id, userId) {
  const { rows } = await db.query('SELECT * FROM gst_saved_views WHERE id=$1', [id]);
  const v = rows[0]; if (!v) throw new ApiError(404, 'View not found');
  const { rows: out } = await db.query(
    `INSERT INTO gst_saved_views (user_id, name, scope, object_type, filters) VALUES ($1,$2,'private',$3,$4) RETURNING *`,
    [userId, `${v.name} (copy)`, v.object_type, JSON.stringify(v.filters)]);
  return out[0];
}

export async function setDefault(db, id, userId) {
  const v = await owned(db, id, userId);
  await db.query('UPDATE gst_saved_views SET is_default=FALSE WHERE user_id=$1 AND object_type=$2', [userId, v.object_type]);
  const { rows } = await db.query('UPDATE gst_saved_views SET is_default=TRUE WHERE id=$1 RETURNING *', [id]);
  return rows[0];
}
