// ============================================================================
//  #2 Document Version Control — immutable, audit-integrated.
//  Every create/edit snapshots the document and records a diff. Versions can be
//  compared and (while still a draft) restored. After an IRN/EWB number exists
//  the document is locked: versions remain viewable but cannot be restored.
// ============================================================================

import PDFDocument from 'pdfkit';
import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';

// Columns that are document content (not lifecycle/response/meta) — used for diff.
const CONTENT_COLS = {
  einvoice: ['supply_type', 'doc_type', 'doc_no', 'doc_date', 'reverse_charge', 'igst_on_intra', 'ecom_gstin', 'seller_dtls', 'buyer_dtls', 'disp_dtls', 'ship_dtls', 'item_list', 'val_dtls', 'buyer_gstin', 'buyer_name', 'total_inv_val', 'total_tax_val', 'branch_id'],
  ewb: ['supply_type', 'sub_supply_type', 'doc_type', 'doc_no', 'doc_date', 'transaction_type', 'from_gstin', 'from_pincode', 'from_state_code', 'to_gstin', 'to_pincode', 'to_state_code', 'tot_inv_value', 'tot_taxable_val', 'trans_distance', 'transporter_id', 'transporter_name', 'trans_mode', 'vehicle_no', 'vehicle_type', 'item_list', 'branch_id'],
};

const norm = (v) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));

// Snapshot the document row and record a version with a computed diff.
export async function record(db, { objectType, objectId, row, reason }, userId) {
  const cols = CONTENT_COLS[objectType] || Object.keys(row);
  const snapshot = {}; for (const c of cols) snapshot[c] = row[c];
  const last = (await db.query('SELECT * FROM gst_versions WHERE object_type=$1 AND object_id=$2 ORDER BY version_no DESC LIMIT 1', [objectType, objectId])).rows[0];
  const versionNo = last ? last.version_no + 1 : 1;

  let changed = [], prev = {}, neu = {}, summary = 'Created';
  if (last) {
    for (const c of cols) {
      if (norm(last.snapshot[c]) !== norm(snapshot[c])) { changed.push(c); prev[c] = last.snapshot[c]; neu[c] = snapshot[c]; }
    }
    summary = changed.length ? `${changed.length} field(s) changed: ${changed.slice(0, 6).join(', ')}` : 'No content change';
    if (!changed.length) return null; // nothing to version
  }
  const { rows } = await db.query(
    `INSERT INTO gst_versions (object_type, object_id, version_no, snapshot, change_summary, change_reason, changed_fields, prev_values, new_values, status_at, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [objectType, objectId, versionNo, JSON.stringify(snapshot), summary, reason || null, JSON.stringify(changed), JSON.stringify(prev), JSON.stringify(neu), row.status, userId]
  );
  await recordAudit(db, { objectType, objectId, eventType: 'version_created', field: 'version', newValue: `v${versionNo}`, message: `Version ${versionNo} — ${summary}${reason ? ` (${reason})` : ''}`, userId });
  return rows[0];
}

export async function list(db, objectType, objectId) {
  const { rows } = await db.query(
    `SELECT v.id, v.version_no, v.change_summary, v.change_reason, v.changed_fields, v.status_at, v.created_at, u.name AS user_name
     FROM gst_versions v LEFT JOIN users u ON u.id=v.user_id
     WHERE object_type=$1 AND object_id=$2 ORDER BY version_no DESC`, [objectType, objectId]);
  return rows;
}

export async function get(db, id) {
  const { rows } = await db.query('SELECT * FROM gst_versions WHERE id=$1', [id]);
  if (!rows[0]) throw new ApiError(404, 'Version not found');
  return rows[0];
}

export async function compare(db, aId, bId) {
  const a = await get(db, aId); const b = await get(db, bId);
  const keys = [...new Set([...Object.keys(a.snapshot), ...Object.keys(b.snapshot)])];
  const diffs = keys.filter((k) => norm(a.snapshot[k]) !== norm(b.snapshot[k]))
    .map((k) => ({ field: k, a: a.snapshot[k], b: b.snapshot[k] }));
  return { a: { versionNo: a.version_no, createdAt: a.created_at }, b: { versionNo: b.version_no, createdAt: b.created_at }, diffs };
}

export async function historyPdf(db, objectType, objectId, label) {
  const rows = await list(db, objectType, objectId);
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = []; doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  doc.fontSize(15).fillColor('#1d4ed8').text('Version History', { continued: false });
  doc.fontSize(10).fillColor('#0f172a').text(`${objectType} • ${label || objectId}`);
  doc.moveDown();
  rows.forEach((v) => {
    doc.fontSize(10).fillColor('#1d4ed8').text(`v${v.version_no} — ${new Date(v.created_at).toLocaleString('en-GB')}`);
    doc.fontSize(9).fillColor('#0f172a').text(`By ${v.user_name || '—'} • status ${v.status_at || '—'}`);
    doc.fillColor('#64748b').text(v.change_summary || '');
    if (v.change_reason) doc.text(`Reason: ${v.change_reason}`);
    doc.moveDown(0.6);
  });
  doc.end();
  return done;
}
