// ============================================================================
//  #3 Document attachments — the documentary trail for compliance & audit.
//  Files live under the uploads dir; metadata in gst_attachments. Compliance-
//  critical files can be marked immutable (cannot be deleted).
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ApiError } from '../../utils/asyncHandler.js';
import { UPLOAD_ROOT } from '../../middleware/upload.js';
import { recordAudit } from './log.js';

const OBJECTS = new Set(['einvoice', 'ewb', 'client', 'recon', 'branch', 'vendor', 'challan', 'payment', 'document']);
// Logical storage folder per attachment target (§9 local file storage).
const FOLDER_FOR = { einvoice: 'invoices', ewb: 'invoices', challan: 'challans', payment: 'payments', recon: 'statements', vendor: 'vendor', client: 'documents', branch: 'documents', document: 'documents' };

// sha256 of the stored file — integrity verification + duplicate detection.
function checksumOf(storedName) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(UPLOAD_ROOT, storedName))).digest('hex'); }
  catch { return null; }
}

export async function add(db, { objectType, objectId, category, file, immutable }, userId) {
  if (!OBJECTS.has(objectType)) throw new ApiError(400, 'Invalid attachment target.');
  if (!objectId) throw new ApiError(400, 'A target document id is required.');
  if (!file) throw new ApiError(400, 'A file is required.');
  const checksum = checksumOf(file.filename);
  const folder = FOLDER_FOR[objectType] || 'documents';
  // Version = next number for the same target + original filename (document versioning).
  const version = (await db.query(
    'SELECT COALESCE(MAX(version),0)+1 AS v FROM gst_attachments WHERE object_type=$1 AND object_id=$2 AND original_name=$3',
    [objectType, objectId, file.originalname])).rows[0].v;
  const { rows } = await db.query(
    `INSERT INTO gst_attachments (object_type, object_id, category, original_name, stored_name, mime, size_bytes, is_immutable, uploaded_by, checksum, version, folder)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [objectType, objectId, category || 'other', file.originalname, file.filename, file.mimetype, file.size, !!immutable, userId, checksum, version, folder]
  );
  await recordAudit(db, { objectType, objectId, eventType: 'attachment_added', message: `Attached ${file.originalname} v${version} (${category || 'other'}, sha ${checksum ? checksum.slice(0, 12) : 'n/a'})`, userId });
  return rows[0];
}

export async function list(db, objectType, objectId) {
  const { rows } = await db.query(
    `SELECT a.*, u.name AS uploaded_by_name FROM gst_attachments a LEFT JOIN users u ON u.id=a.uploaded_by
     WHERE object_type=$1 AND object_id=$2 ORDER BY created_at DESC`, [objectType, objectId]);
  return rows;
}

export async function getForDownload(db, id) {
  const { rows } = await db.query('SELECT * FROM gst_attachments WHERE id=$1', [id]);
  const a = rows[0];
  if (!a) throw new ApiError(404, 'Attachment not found');
  const filePath = path.join(UPLOAD_ROOT, a.stored_name);
  if (!fs.existsSync(filePath)) throw new ApiError(410, 'The stored file is no longer available on this computer.');
  await db.query('UPDATE gst_attachments SET download_count=download_count+1 WHERE id=$1', [id]);
  return { ...a, filePath };
}

export async function remove(db, id, userId) {
  const { rows } = await db.query('SELECT * FROM gst_attachments WHERE id=$1', [id]);
  const a = rows[0];
  if (!a) throw new ApiError(404, 'Attachment not found');
  if (a.is_immutable) throw new ApiError(409, 'This is a compliance-critical attachment and cannot be deleted.');
  await db.query('DELETE FROM gst_attachments WHERE id=$1', [id]);
  // best-effort file cleanup
  try { fs.unlinkSync(path.join(UPLOAD_ROOT, a.stored_name)); } catch { /* ignore */ }
  await recordAudit(db, { objectType: a.object_type, objectId: a.object_id, eventType: 'attachment_removed', message: `Removed attachment ${a.original_name}`, userId });
  return { ok: true };
}

// Count attachments for a set of objects (for badges) — single object here.
export async function count(db, objectType, objectId) {
  const { rows } = await db.query('SELECT count(*) c FROM gst_attachments WHERE object_type=$1 AND object_id=$2', [objectType, objectId]);
  return Number(rows[0].c) || 0;
}
