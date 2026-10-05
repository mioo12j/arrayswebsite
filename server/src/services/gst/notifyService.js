// ============================================================================
//  Notification / Alert Center
//  Proactively surfaces compliance issues BEFORE they become failures.
//  Alerts are computed from live data and upserted by dedupe_key so a refresh
//  is idempotent; alerts whose condition cleared are auto-resolved.
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';

const EXPIRY_HOURS = Number(process.env.GST_EWB_EXPIRY_HOURS || 24);
const STALE_DAYS = Number(process.env.GST_DRAFT_STALE_DAYS || 3);

// Each generator returns rows shaped for a notification.
async function computeAlerts(db) {
  const alerts = [];
  const push = (a) => alerts.push(a);

  // EWB expiring soon
  for (const r of (await db.query(
    `SELECT id, coalesce(ewb_no,doc_no) ref, valid_upto, to_trade_name FROM gst_eway_bills
     WHERE is_deleted=FALSE AND ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed
       AND valid_upto BETWEEN now() AND now() + interval '${EXPIRY_HOURS} hours'`)).rows) {
    push({ dedupeKey: `ewb_expiring:${r.id}`, severity: 'warning', type: 'ewb_expiring', title: `E-Way Bill ${r.ref} expiring soon`, description: `Valid only until ${fmt(r.valid_upto)} (to ${r.to_trade_name || '—'}).`, objectType: 'ewb', objectId: r.id, suggestedAction: 'Extend the e-way bill or complete delivery before it expires.' });
  }
  // EWB expired
  for (const r of (await db.query(
    `SELECT id, coalesce(ewb_no,doc_no) ref, valid_upto FROM gst_eway_bills
     WHERE is_deleted=FALSE AND ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed AND valid_upto < now()`)).rows) {
    push({ dedupeKey: `ewb_expired:${r.id}`, severity: 'critical', type: 'ewb_expired', title: `E-Way Bill ${r.ref} has expired`, description: `Validity ended ${fmt(r.valid_upto)}. Goods movement on this EWB is non-compliant.`, objectType: 'ewb', objectId: r.id, suggestedAction: 'Do not move goods on this EWB. Generate a fresh one if needed.' });
  }
  // IRN submission failures
  for (const r of (await db.query(`SELECT id, doc_no ref, last_error FROM gst_einvoices WHERE is_deleted=FALSE AND status='error'`)).rows) {
    push({ dedupeKey: `irn_failed:${r.id}`, severity: 'critical', type: 'irn_failed', title: `IRN generation failed for ${r.ref}`, description: r.last_error || 'The IRP rejected this invoice.', objectType: 'einvoice', objectId: r.id, suggestedAction: 'Open the invoice, fix the flagged fields and resubmit.' });
  }
  // Drafts stuck too long
  for (const r of (await db.query(
    `SELECT id, doc_no ref, created_at FROM gst_einvoices
     WHERE is_deleted=FALSE AND irn IS NULL AND NOT is_cancelled AND status IN ('draft','needs_review')
       AND created_at < now() - interval '${STALE_DAYS} days'`)).rows) {
    push({ dedupeKey: `draft_stale:${r.id}`, severity: 'warning', type: 'draft_stale', title: `Invoice ${r.ref || '(no number)'} stuck in draft`, description: `Created ${fmt(r.created_at)} and still not submitted.`, objectType: 'einvoice', objectId: r.id, suggestedAction: 'Validate and submit, or delete the draft.' });
  }
  // Maker-checker: validated and awaiting checker submission
  for (const r of (await db.query(`SELECT id, doc_no ref FROM gst_einvoices WHERE is_deleted=FALSE AND status='validated' AND irn IS NULL`)).rows) {
    push({ dedupeKey: `approval_pending:${r.id}`, severity: 'info', type: 'approval_pending', title: `Invoice ${r.ref} awaiting checker submission`, description: 'Validated by the maker; a checker must submit it to the IRP.', objectType: 'einvoice', objectId: r.id, suggestedAction: 'A checker (admin) should review and submit → IRN.' });
  }
  // Transport details missing on generated EWB
  for (const r of (await db.query(`SELECT id, coalesce(ewb_no,doc_no) ref FROM gst_eway_bills WHERE is_deleted=FALSE AND ewb_no IS NOT NULL AND NOT is_cancelled AND part_b_ready=FALSE`)).rows) {
    push({ dedupeKey: `transport_missing:${r.id}`, severity: 'warning', type: 'transport_missing', title: `Transport details missing on EWB ${r.ref}`, description: 'Part B (vehicle / transport document) is incomplete.', objectType: 'ewb', objectId: r.id, suggestedAction: 'Update Part B with the vehicle or transport document.' });
  }
  // Duplicate document numbers
  for (const r of (await db.query(
    `SELECT min(id::text)::uuid id, doc_no FROM gst_einvoices WHERE is_deleted=FALSE AND NOT is_cancelled AND doc_no IS NOT NULL
     GROUP BY doc_no HAVING count(*)>1`)).rows) {
    push({ dedupeKey: `dup_docno:${r.doc_no}`, severity: 'warning', type: 'dup_docno', title: `Duplicate document number ${r.doc_no}`, description: 'More than one active invoice shares this document number.', objectType: 'einvoice', objectId: r.id, suggestedAction: 'Renumber one of the invoices to keep the series unique.' });
  }
  // Adapter / credential status (system-level)
  if ((process.env.GST_MODE || 'simulation') === 'live' && !process.env.GST_CLIENT_ID) {
    push({ dedupeKey: 'creds_missing:system', severity: 'critical', type: 'creds_missing', title: 'Live mode without GSP credentials', description: 'GST_MODE=live but no client credentials are configured.', objectType: null, objectId: null, suggestedAction: 'Set GSP credentials or switch back to simulation mode.' });
  }
  return alerts;
}

const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// Idempotent refresh: upsert current alerts, auto-resolve cleared ones.
export async function refresh(db) {
  const alerts = await computeAlerts(db);
  const keys = alerts.map((a) => a.dedupeKey);
  for (const a of alerts) {
    await db.query(
      `INSERT INTO gst_notifications (dedupe_key, severity, type, title, description, object_type, object_id, suggested_action, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unread')
       ON CONFLICT (dedupe_key) DO UPDATE SET
         severity=$2, title=$4, description=$5, suggested_action=$8, updated_at=now(),
         status=CASE WHEN gst_notifications.status='resolved' THEN 'unread' ELSE gst_notifications.status END`,
      [a.dedupeKey, a.severity, a.type, a.title, a.description, a.objectType, a.objectId, a.suggestedAction]
    );
  }
  // Auto-resolve notifications whose condition cleared.
  if (keys.length) {
    await db.query(`UPDATE gst_notifications SET status='resolved', updated_at=now() WHERE status<>'resolved' AND dedupe_key <> ALL($1::text[])`, [keys]);
  } else {
    await db.query(`UPDATE gst_notifications SET status='resolved', updated_at=now() WHERE status<>'resolved'`);
  }
  return { active: alerts.length };
}

export async function list(db, { status, severity, type } = {}) {
  const cl = []; const p = [];
  if (status === 'open') cl.push(`status <> 'resolved'`);
  else if (status) { p.push(status); cl.push(`status=$${p.length}`); }
  if (severity) { p.push(severity); cl.push(`severity=$${p.length}`); }
  if (type) { p.push(type); cl.push(`type=$${p.length}`); }
  const where = cl.length ? `WHERE ${cl.join(' AND ')}` : '';
  const { rows } = await db.query(`SELECT * FROM gst_notifications ${where} ORDER BY (severity='critical') DESC, (severity='warning') DESC, created_at DESC LIMIT 500`, p);
  return rows;
}

export async function summary(db) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE status='unread') unread,
            count(*) FILTER (WHERE status<>'resolved') open,
            count(*) FILTER (WHERE severity='critical' AND status<>'resolved') critical,
            count(*) FILTER (WHERE severity='warning' AND status<>'resolved') warning
     FROM gst_notifications`);
  return rows[0];
}

export async function setStatus(db, id, status, userId) {
  if (!['read', 'acknowledged', 'resolved', 'unread'].includes(status)) throw new ApiError(400, 'Invalid status.');
  const { rows } = await db.query(
    `UPDATE gst_notifications SET status=$2, acknowledged_by=CASE WHEN $2 IN ('acknowledged','resolved') THEN $3 ELSE acknowledged_by END,
       acknowledged_at=CASE WHEN $2 IN ('acknowledged','resolved') THEN now() ELSE acknowledged_at END, updated_at=now()
     WHERE id=$1 RETURNING *`, [id, status, userId]);
  if (!rows[0]) throw new ApiError(404, 'Notification not found');
  return rows[0];
}
