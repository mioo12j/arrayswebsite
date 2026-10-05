// ============================================================================
//  #3 Approval Discussions & Collaboration.
//  Threaded comments (internal / approval / audit / system) on compliance
//  documents, with @mentions, resolve/reopen, pin, and read indicators. Every
//  discussion action joins the compliance history (audit log).
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';

const KINDS = new Set(['internal', 'approval', 'audit', 'system']);

export async function add(db, { objectType, objectId, parentId, kind, content, mentions }, userId) {
  if (!content || !String(content).trim()) throw new ApiError(400, 'A comment cannot be empty.');
  if (kind && !KINDS.has(kind)) throw new ApiError(400, 'Invalid note type.');
  // Resolve @mentions from "@name" tokens if a mentions array wasn't supplied.
  let mentionList = Array.isArray(mentions) ? mentions : [];
  if (!mentionList.length) {
    const names = [...String(content).matchAll(/@([A-Za-z][A-Za-z0-9_. ]{1,30})/g)].map((m) => m[1].trim());
    if (names.length) {
      const { rows } = await db.query('SELECT id, name FROM users WHERE name = ANY($1)', [names]);
      mentionList = rows.map((r) => ({ id: r.id, name: r.name }));
    }
  }
  const { rows } = await db.query(
    `INSERT INTO gst_comments (object_type, object_id, parent_id, kind, author_id, content, mentions)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [objectType, objectId, parentId || null, kind || 'internal', userId, String(content).trim(), JSON.stringify(mentionList)]
  );
  await recordAudit(db, { objectType, objectId, eventType: 'comment_added', message: `${kind || 'internal'} note added${mentionList.length ? ` (mentioned ${mentionList.map((m) => m.name).join(', ')})` : ''}`, userId });
  return rows[0];
}

export async function list(db, objectType, objectId) {
  const { rows } = await db.query(
    `SELECT c.*, u.name AS author_name, u.role AS author_role FROM gst_comments c
     LEFT JOIN users u ON u.id=c.author_id
     WHERE c.object_type=$1 AND c.object_id=$2 ORDER BY c.is_pinned DESC, c.created_at ASC`, [objectType, objectId]);
  return rows;
}

export async function setResolved(db, id, resolved, userId) {
  const { rows } = await db.query('UPDATE gst_comments SET is_resolved=$2, updated_at=now() WHERE id=$1 RETURNING *', [id, resolved]);
  if (!rows[0]) throw new ApiError(404, 'Comment not found');
  await recordAudit(db, { objectType: rows[0].object_type, objectId: rows[0].object_id, eventType: resolved ? 'discussion_resolved' : 'discussion_reopened', message: resolved ? 'Discussion resolved' : 'Discussion reopened', userId });
  return rows[0];
}

export async function setPinned(db, id, pinned, userId) {
  const { rows } = await db.query('UPDATE gst_comments SET is_pinned=$2, updated_at=now() WHERE id=$1 RETURNING *', [id, pinned]);
  if (!rows[0]) throw new ApiError(404, 'Comment not found');
  await recordAudit(db, { objectType: rows[0].object_type, objectId: rows[0].object_id, eventType: 'comment_pinned', message: pinned ? 'Comment pinned' : 'Comment unpinned', userId });
  return rows[0];
}

export async function markRead(db, objectType, objectId, userId) {
  await db.query(
    `INSERT INTO gst_comment_reads (object_type, object_id, user_id, last_read_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (object_type, object_id, user_id) DO UPDATE SET last_read_at=now()`, [objectType, objectId, userId]);
  return { ok: true };
}

export async function unreadCount(db, objectType, objectId, userId) {
  const { rows } = await db.query(
    `SELECT count(*) c FROM gst_comments cm
     WHERE cm.object_type=$1 AND cm.object_id=$2 AND cm.author_id<>$3
       AND cm.created_at > coalesce((SELECT last_read_at FROM gst_comment_reads WHERE object_type=$1 AND object_id=$2 AND user_id=$3), 'epoch')`,
    [objectType, objectId, userId]);
  return Number(rows[0].c) || 0;
}
