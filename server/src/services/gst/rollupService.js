// ============================================================================
//  ERP ↔ GST integration — READ-ONLY rollups.
//  The GST module stays operationally isolated (no ERP code writes GST data);
//  this service only *reads* compliance aggregates so they can surface inside
//  the customer / vendor / branch views and the main dashboard.
//  Linkage is by GSTIN (clients/vendors.gstin ↔ e-invoice buyer_gstin /
//  e-way-bill to_gstin) and by branch_id.
// ============================================================================

import { query } from '../../config/db.js';

const num = (v) => Number(v || 0);

// Derive a simple, human compliance status from counts.
function complianceStatus({ einvoices, irns, attention }) {
  if (attention > 0) return 'attention';
  if (irns > 0) return 'compliant';
  if (einvoices > 0) return 'pending';
  return 'none';
}

// ── Customer (buyer) compliance summary, keyed by GSTIN ─────────────────────
export async function customerGst(gstin) {
  if (!gstin) return null;
  const [ei, ewb] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS einvoices,
              COUNT(*) FILTER (WHERE irn IS NOT NULL)::int AS irns,
              COUNT(*) FILTER (WHERE status IN ('needs_review','error'))::int AS attention,
              COALESCE(SUM(total_tax_val) FILTER (WHERE NOT is_cancelled),0) AS gst_value,
              COALESCE(SUM(total_inv_val) FILTER (WHERE NOT is_cancelled),0) AS invoice_value,
              MAX(COALESCE(doc_date, created_at::date)) AS last_txn
         FROM gst_einvoices WHERE buyer_gstin = $1`,
      [gstin]
    ),
    query(
      `SELECT COUNT(*)::int AS ewbs,
              COUNT(*) FILTER (WHERE ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed AND (valid_upto IS NULL OR valid_upto > now()))::int AS active_ewbs
         FROM gst_eway_bills WHERE to_gstin = $1`,
      [gstin]
    ),
  ]);
  const e = ei.rows[0], w = ewb.rows[0];
  return {
    gstin,
    einvoices: e.einvoices,
    irns: e.irns,
    ewbs: w.ewbs,
    activeEwbs: w.active_ewbs,
    gstValue: num(e.gst_value),
    invoiceValue: num(e.invoice_value),
    lastTxn: e.last_txn,
    status: complianceStatus({ einvoices: e.einvoices, irns: e.irns, attention: e.attention }),
  };
}

// ── Vendor compliance summary — GSTIN validation + any related docs ─────────
export async function vendorGst(gstin) {
  if (!gstin) return null;
  const [val, docs] = await Promise.all([
    query(
      `SELECT result, status, checksum_ok, format_ok, state_name, legal_name, validated_at
         FROM gst_gstin_validations WHERE gstin = $1 ORDER BY validated_at DESC LIMIT 1`,
      [gstin]
    ),
    query(
      `SELECT (SELECT COUNT(*) FROM gst_einvoices WHERE buyer_gstin=$1)::int AS einvoices,
              (SELECT COUNT(*) FROM gst_eway_bills WHERE from_gstin=$1 OR to_gstin=$1)::int AS ewbs`,
      [gstin]
    ),
  ]);
  const v = val.rows[0];
  return {
    gstin,
    validation: v
      ? { result: v.result, portalStatus: v.status, checksumOk: v.checksum_ok, formatOk: v.format_ok, stateName: v.state_name, legalName: v.legal_name, checkedAt: v.validated_at }
      : null,
    relatedDocs: docs.rows[0].einvoices + docs.rows[0].ewbs,
    // filing history is future-ready (returns/GSTR) once a live GSP is connected
    filingHistory: [],
  };
}

// ── Branch compliance activity ──────────────────────────────────────────────
export async function branchGst(branchId) {
  if (!branchId) return null;
  const [ei, ewb] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS einvoices,
              COUNT(*) FILTER (WHERE irn IS NOT NULL)::int AS irns,
              COUNT(*) FILTER (WHERE status IN ('draft','needs_review'))::int AS pending,
              COALESCE(SUM(total_inv_val) FILTER (WHERE COALESCE(doc_date, created_at::date) >= date_trunc('month', now())),0) AS month_volume
         FROM gst_einvoices WHERE branch_id = $1`,
      [branchId]
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed AND (valid_upto IS NULL OR valid_upto > now()))::int AS active_ewbs
         FROM gst_eway_bills WHERE branch_id = $1`,
      [branchId]
    ),
  ]);
  const e = ei.rows[0];
  return {
    branchId,
    einvoices: e.einvoices,
    irns: e.irns,
    pendingActions: e.pending,
    monthlyVolume: num(e.month_volume),
    activeEwbs: ewb.rows[0].active_ewbs,
  };
}

// ── Main dashboard GST summary ──────────────────────────────────────────────
export async function dashboardGst() {
  const [today, ewbActive, expiring, alerts, failed, recent] = await Promise.all([
    query(`SELECT COUNT(*)::int AS v FROM gst_einvoices WHERE irn IS NOT NULL AND COALESCE(ack_date::date, created_at::date) = current_date`),
    query(`SELECT COUNT(*)::int AS v FROM gst_eway_bills WHERE ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed AND (valid_upto IS NULL OR valid_upto > now())`),
    query(`SELECT COUNT(*)::int AS v FROM gst_eway_bills WHERE ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed AND valid_upto BETWEEN now() AND now() + interval '24 hours'`),
    query(`SELECT COUNT(*)::int AS v FROM gst_einvoices WHERE status = 'needs_review'`),
    query(`SELECT (SELECT COUNT(*) FROM gst_einvoices WHERE status='error') + (SELECT COUNT(*) FROM gst_eway_bills WHERE status='error')::int AS v`),
    query(
      `SELECT * FROM (
         SELECT 'e-Invoice' AS kind, doc_no, status::text, COALESCE(irn, '') AS ref, buyer_name AS party, created_at
           FROM gst_einvoices
         UNION ALL
         SELECT 'e-Way Bill' AS kind, doc_no, status::text, COALESCE(ewb_no, '') AS ref, to_trade_name AS party, created_at
           FROM gst_eway_bills
       ) x ORDER BY created_at DESC LIMIT 6`
    ),
  ]);
  return {
    todayIrns: today.rows[0].v,
    activeEwbs: ewbActive.rows[0].v,
    expiringEwbs: expiring.rows[0].v,
    complianceAlerts: alerts.rows[0].v,
    failedSubmissions: num(failed.rows[0].v),
    recent: recent.rows.map((r) => ({ kind: r.kind, docNo: r.doc_no, status: r.status, ref: r.ref, party: r.party, at: r.created_at })),
  };
}
