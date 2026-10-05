// ============================================================================
//  GST Reconciliation Center — an active control room.
//  Discrepancies are COMPUTED live from the separate e-invoice / e-way-bill /
//  internal-invoice layers; only their resolution state is persisted
//  (gst_recon_resolutions). Every resolution writes an audit event.
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';

// Threshold above which an IRN-generated invoice is expected to have an EWB.
const EWB_THRESHOLD = 50000;

// Each check returns { key, title, severity, hint, items[] }.
// item = { objectType, objectId, ref, detail }
const CHECKS = [
  {
    key: 'draft_not_submitted', title: 'Draft invoices not submitted', severity: 'warning',
    hint: 'These e-invoices are prepared but have no IRN yet. Submit them to the IRP.',
    sql: `SELECT id, doc_no AS ref, ('Created '||to_char(created_at,'DD Mon')||' • '||coalesce(buyer_name,'no customer')) AS detail
          FROM gst_einvoices
          WHERE is_deleted=FALSE AND irn IS NULL AND is_cancelled=FALSE
            AND status IN ('draft','validated','needs_review','pending_submission')`,
    objectType: 'einvoice',
  },
  {
    key: 'failed_irn', title: 'Submitted invoices with failed IRN generation', severity: 'critical',
    hint: 'The IRP rejected these. Open the document, fix the flagged fields, and resubmit.',
    sql: `SELECT id, doc_no AS ref, coalesce(last_error,'IRP error') AS detail
          FROM gst_einvoices WHERE is_deleted=FALSE AND status='error'`,
    objectType: 'einvoice',
  },
  {
    key: 'irn_no_pdf', title: 'IRN generated but no printable PDF', severity: 'info',
    hint: 'Generate/print the legal PDF so a signed copy exists for records.',
    sql: `SELECT id, doc_no AS ref, ('IRN '||left(irn,12)||'…') AS detail
          FROM gst_einvoices WHERE is_deleted=FALSE AND irn IS NOT NULL AND is_cancelled=FALSE AND print_count=0`,
    objectType: 'einvoice',
  },
  {
    key: 'invoice_not_einvoiced', title: 'Internal tax invoices not e-invoiced', severity: 'warning',
    hint: 'These receivable invoices have no linked e-Invoice. Create & submit one if e-invoicing applies.',
    sql: `SELECT i.id, i.invoice_number AS ref, ('₹'||to_char(coalesce(i.total_amount,0),'FM999,999,999')||' • '||coalesce(c.name,'—')) AS detail
          FROM invoices i LEFT JOIN clients c ON c.id=i.client_id
          WHERE i.is_deleted=FALSE AND i.type='tax' AND i.status NOT IN ('draft','cancelled')
            AND NOT EXISTS (SELECT 1 FROM gst_einvoices e WHERE e.source_invoice_id=i.id AND e.is_deleted=FALSE)`,
    objectType: 'invoice',
  },
  {
    key: 'einvoice_no_ewb', title: 'IRN generated without a linked e-Way Bill', severity: 'warning',
    hint: `Goods invoices above ₹${EWB_THRESHOLD.toLocaleString('en-IN')} usually need an e-Way Bill. Generate one from the invoice.`,
    sql: `SELECT e.id, e.doc_no AS ref, ('₹'||to_char(coalesce(e.total_inv_val,0),'FM999,999,999')) AS detail
          FROM gst_einvoices e
          WHERE e.is_deleted=FALSE AND e.irn IS NOT NULL AND e.is_cancelled=FALSE AND coalesce(e.total_inv_val,0) >= ${EWB_THRESHOLD}
            AND NOT EXISTS (SELECT 1 FROM gst_eway_bills w WHERE w.source_einvoice_id=e.id AND w.is_deleted=FALSE AND w.is_cancelled=FALSE)`,
    objectType: 'einvoice',
  },
  {
    key: 'ewb_not_linked', title: 'e-Way Bills not linked to any invoice', severity: 'warning',
    hint: 'These EWBs reference neither an e-invoice nor an internal invoice. Link or verify them.',
    sql: `SELECT id, coalesce(ewb_no,doc_no) AS ref, ('To '||coalesce(to_trade_name,to_gstin,'—')) AS detail
          FROM gst_eway_bills
          WHERE is_deleted=FALSE AND ewb_no IS NOT NULL AND source_einvoice_id IS NULL AND source_invoice_id IS NULL`,
    objectType: 'ewb',
  },
  {
    key: 'cancelled_inv_active_ewb', title: 'Active EWB on a cancelled invoice', severity: 'critical',
    hint: 'The e-invoice was cancelled but its e-Way Bill is still live. Cancel the EWB to stay consistent.',
    sql: `SELECT w.id, coalesce(w.ewb_no,w.doc_no) AS ref, ('Linked IRN cancelled') AS detail
          FROM gst_eway_bills w JOIN gst_einvoices e ON e.id=w.source_einvoice_id
          WHERE w.is_deleted=FALSE AND w.is_cancelled=FALSE AND e.is_cancelled=TRUE`,
    objectType: 'ewb',
  },
  {
    key: 'transport_missing', title: 'Generated EWB missing transport details', severity: 'warning',
    hint: 'Part B (vehicle / transport document) is incomplete. Update Part B before the goods move.',
    sql: `SELECT id, coalesce(ewb_no,doc_no) AS ref, 'Part B pending' AS detail
          FROM gst_eway_bills WHERE is_deleted=FALSE AND ewb_no IS NOT NULL AND is_cancelled=FALSE AND part_b_ready=FALSE`,
    objectType: 'ewb',
  },
  {
    key: 'customer_gstin_inconsistent', title: 'Customer GSTIN ↔ place-of-supply mismatch', severity: 'info',
    hint: 'Buyer GSTIN state differs from the place of supply. Verify the customer master.',
    sql: `SELECT id, doc_no AS ref, ('GSTIN '||left(buyer_gstin,2)||' vs POS '||coalesce(buyer_dtls->>'pos','?')) AS detail
          FROM gst_einvoices
          WHERE is_deleted=FALSE AND buyer_gstin IS NOT NULL AND length(buyer_gstin)>=2
            AND (buyer_dtls->>'pos') IS NOT NULL AND left(buyer_gstin,2) <> lpad(buyer_dtls->>'pos',2,'0')
            AND supply_type NOT IN ('EXPWP','EXPWOP')`,
    objectType: 'einvoice',
  },
  {
    key: 'duplicate_invoices', title: 'Possible duplicate invoices', severity: 'warning',
    hint: 'Same customer, date and value across multiple invoices. Review for accidental duplication.',
    sql: `WITH dup AS (
            SELECT buyer_gstin, doc_date, total_inv_val FROM gst_einvoices
            WHERE is_deleted=FALSE AND is_cancelled=FALSE AND buyer_gstin IS NOT NULL
            GROUP BY 1,2,3 HAVING count(*)>1)
          SELECT e.id, e.doc_no AS ref, ('₹'||to_char(coalesce(e.total_inv_val,0),'FM999,999,999')||' • '||coalesce(e.buyer_name,'—')||' • '||to_char(e.doc_date,'DD Mon')) AS detail
          FROM gst_einvoices e JOIN dup ON dup.buyer_gstin=e.buyer_gstin AND dup.doc_date=e.doc_date AND dup.total_inv_val=e.total_inv_val
          WHERE e.is_deleted=FALSE AND e.is_cancelled=FALSE`,
    objectType: 'einvoice',
  },
];

export async function run(db, { includeResolved = false } = {}) {
  const { rows: resRows } = await db.query('SELECT check_key, object_type, object_id, status, note, resolved_at FROM gst_recon_resolutions');
  const resMap = new Map(resRows.map((r) => [`${r.check_key}|${r.object_type}|${r.object_id}`, r]));

  const groups = [];
  for (const c of CHECKS) {
    let items = [];
    try { items = (await db.query(c.sql)).rows; }
    catch (e) { /* eslint-disable-next-line no-console */ console.error(`[recon] ${c.key} failed:`, e.message); }
    const enriched = items.map((it) => {
      const r = resMap.get(`${c.key}|${c.objectType}|${it.id}`);
      return { objectType: c.objectType, objectId: it.id, ref: it.ref, detail: it.detail, resolution: r ? { status: r.status, note: r.note, resolvedAt: r.resolved_at } : { status: 'open' } };
    });
    const open = enriched.filter((i) => i.resolution.status === 'open');
    groups.push({
      key: c.key, title: c.title, severity: c.severity, hint: c.hint,
      total: enriched.length, openCount: open.length,
      items: includeResolved ? enriched : open,
    });
  }
  const summary = {
    totalOpen: groups.reduce((s, g) => s + g.openCount, 0),
    critical: groups.filter((g) => g.severity === 'critical').reduce((s, g) => s + g.openCount, 0),
    warning: groups.filter((g) => g.severity === 'warning').reduce((s, g) => s + g.openCount, 0),
    checks: groups.length,
  };
  return { summary, groups };
}

export async function resolve(db, { checkKey, objectType, objectId, status, note }, userId) {
  const valid = ['open', 'resolved', 'overridden', 'ignored'];
  if (!valid.includes(status)) throw new ApiError(400, 'Invalid resolution status.');
  if (!checkKey || !objectType || !objectId) throw new ApiError(400, 'checkKey, objectType and objectId are required.');
  const { rows } = await db.query(
    `INSERT INTO gst_recon_resolutions (check_key, object_type, object_id, status, note, resolved_by, resolved_at)
     VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $4='open' THEN NULL ELSE now() END)
     ON CONFLICT (check_key, object_type, object_id)
     DO UPDATE SET status=$4, note=$5, resolved_by=$6, resolved_at=CASE WHEN $4='open' THEN NULL ELSE now() END, updated_at=now()
     RETURNING *`,
    [checkKey, objectType, objectId, status, note || null, userId]
  );
  await recordAudit(db, { objectType, objectId, eventType: 'reconciliation', message: `Reconciliation “${checkKey}” marked ${status}${note ? ` — ${note}` : ''}`, userId });
  return rows[0];
}

// Counts for the dashboard widget / scheduled jobs.
export async function summary(db) {
  const { summary: s } = await run(db);
  return s;
}
