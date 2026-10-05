// ============================================================================
//  GST dashboard + compliance reports (aggregations).
//  Returns plain row arrays that the UI renders and the export layer serialises
//  to PDF / Excel / CSV / JSON.
// ============================================================================

import { STATE_CODES } from './masterData.js';

const stName = (c) => STATE_CODES[String(c || '').padStart(2, '0')] || (c ? `State ${c}` : 'Unknown');
const num = (r, k) => Number(r?.[k] || 0);

export async function dashboard(db, branchId = null) {
  const bp = [branchId || null]; // $1 branch filter (null = all)
  const BF = `AND ($1::uuid IS NULL OR branch_id=$1)`;
  const einv = (await db.query(`
    SELECT
      count(*)                                                   AS total,
      count(*) FILTER (WHERE status='draft')                     AS draft,
      count(*) FILTER (WHERE status IN ('validated','pending_submission')) AS pending_submission,
      count(*) FILTER (WHERE status IN ('irn_generated','printed')) AS irn_generated,
      count(*) FILTER (WHERE status='cancelled')                 AS cancelled,
      count(*) FILTER (WHERE status='needs_review' OR status='error') AS failed_validation,
      count(*) FILTER (WHERE doc_type='CRN' AND NOT is_cancelled) AS credit_notes,
      coalesce(sum(total_inv_val) FILTER (WHERE doc_type='CRN' AND NOT is_cancelled),0) AS credit_note_val,
      -- Value totals are NET of credit notes: a CRN subtracts (adjusts down) the
      -- taxable / GST it credits back, so the dashboard reflects the real liability.
      coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_inv_val) FILTER (WHERE NOT is_cancelled),0) AS total_inv_val,
      coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_tax_val) FILTER (WHERE NOT is_cancelled),0) AS total_tax_val,
      -- split the (net) value totals into IRN-filed (irn_generated / printed) vs not-yet-filed
      coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_inv_val) FILTER (WHERE NOT is_cancelled AND status IN ('irn_generated','printed')),0) AS filed_inv_val,
      coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_tax_val) FILTER (WHERE NOT is_cancelled AND status IN ('irn_generated','printed')),0) AS filed_tax_val,
      coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_inv_val) FILTER (WHERE NOT is_cancelled AND status NOT IN ('irn_generated','printed')),0) AS unfiled_inv_val,
      coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_tax_val) FILTER (WHERE NOT is_cancelled AND status NOT IN ('irn_generated','printed')),0) AS unfiled_tax_val
    FROM gst_einvoices WHERE is_deleted=FALSE ${BF}`, bp)).rows[0];
  einv.total_taxable_val = num(einv, 'total_inv_val') - num(einv, 'total_tax_val');
  einv.filed_taxable_val = num(einv, 'filed_inv_val') - num(einv, 'filed_tax_val');
  einv.unfiled_taxable_val = num(einv, 'unfiled_inv_val') - num(einv, 'unfiled_tax_val');

  const ewb = (await db.query(`
    SELECT
      count(*)                                                   AS total,
      count(*) FILTER (WHERE ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed AND (valid_upto IS NULL OR valid_upto > now())) AS active,
      count(*) FILTER (WHERE ewb_no IS NOT NULL AND NOT is_cancelled AND valid_upto BETWEEN now() AND now() + interval '24 hours') AS expiring_soon,
      count(*) FILTER (WHERE ewb_no IS NOT NULL AND NOT is_cancelled AND NOT is_closed AND valid_upto < now()) AS expired,
      count(*) FILTER (WHERE is_cancelled)                       AS cancelled,
      count(*) FILTER (WHERE is_closed)                          AS closed,
      count(*) FILTER (WHERE status='part_a')                    AS part_b_pending
    FROM gst_eway_bills WHERE is_deleted=FALSE ${BF}`, bp)).rows[0];

  const monthly = (await db.query(`
    SELECT to_char(date_trunc('month', doc_date),'Mon YY') AS month,
           date_trunc('month', doc_date) AS m,
           count(*) AS invoices,
           coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_inv_val) FILTER (WHERE NOT is_cancelled),0) AS inv_value,
           coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_tax_val) FILTER (WHERE NOT is_cancelled),0) AS gst_value
    FROM gst_einvoices
    WHERE is_deleted=FALSE AND doc_date >= (now() - interval '11 months') ${BF}
    GROUP BY 1,2 ORDER BY 2`, bp)).rows;

  const ewbDist = (await db.query(`
    SELECT status, count(*) AS count FROM gst_eway_bills WHERE is_deleted=FALSE ${BF} GROUP BY status ORDER BY count DESC`, bp)).rows;

  const stateRows = (await db.query(`
    SELECT coalesce(buyer_dtls->>'pos', buyer_dtls->>'stateCode') AS st,
           count(*) AS invoices, coalesce(sum((CASE WHEN doc_type='CRN' THEN -1 ELSE 1 END)*total_inv_val) FILTER (WHERE NOT is_cancelled),0) AS value
    FROM gst_einvoices WHERE is_deleted=FALSE ${BF} GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 12`, bp)).rows;
  const stateWise = stateRows.map((r) => ({ state: stName(r.st), invoices: Number(r.invoices), value: Number(r.value) }));

  return {
    mode: (process.env.GST_MODE || 'simulation'),
    einvoice: einv,
    ewb,
    charts: {
      monthly: monthly.map((r) => ({ month: r.month, invoices: Number(r.invoices), invValue: Number(r.inv_value), taxableValue: Number(r.inv_value) - Number(r.gst_value), gstValue: Number(r.gst_value) })),
      ewbStatus: ewbDist.map((r) => ({ status: r.status, count: Number(r.count) })),
      stateWise,
    },
  };
}

// ── Reports ────────────────────────────────────────────────────────────────
export async function gstSummary(db) {
  const rows = (await db.query(`
    SELECT to_char(date_trunc('month', doc_date),'Mon YYYY') AS period,
           date_trunc('month', doc_date) AS m,
           count(*) AS invoices,
           coalesce(sum((val_dtls->>'assessableValue')::numeric),0) AS taxable,
           coalesce(sum((val_dtls->>'cgstValue')::numeric),0) AS cgst,
           coalesce(sum((val_dtls->>'sgstValue')::numeric),0) AS sgst,
           coalesce(sum((val_dtls->>'igstValue')::numeric),0) AS igst,
           coalesce(sum((val_dtls->>'cessValue')::numeric),0) AS cess,
           coalesce(sum(total_inv_val),0) AS total
    FROM gst_einvoices
    WHERE is_deleted=FALSE AND status IN ('irn_generated','printed') AND doc_date IS NOT NULL
    GROUP BY 1,2 ORDER BY 2`)).rows;
  return rows.map((r) => ({ Period: r.period, Invoices: Number(r.invoices), Taxable: Number(r.taxable), CGST: Number(r.cgst), SGST: Number(r.sgst), IGST: Number(r.igst), Cess: Number(r.cess), Total: Number(r.total) }));
}

export async function hsnSummary(db) {
  const rows = (await db.query(`
    SELECT it->>'hsn' AS hsn,
           max(it->>'description') AS description,
           count(*) AS lines,
           coalesce(sum(nullif(it->>'quantity','')::numeric),0) AS qty,
           coalesce(sum(nullif(it->>'taxableValue','')::numeric),0) AS taxable,
           coalesce(sum(coalesce(nullif(it->>'igstAmount','')::numeric,0)+coalesce(nullif(it->>'cgstAmount','')::numeric,0)+coalesce(nullif(it->>'sgstAmount','')::numeric,0)),0) AS tax
    FROM gst_einvoices e, jsonb_array_elements(e.item_list) it
    WHERE e.is_deleted=FALSE AND e.status IN ('irn_generated','printed')
    GROUP BY 1 ORDER BY taxable DESC NULLS LAST`)).rows;
  return rows.map((r) => ({ HSN: r.hsn, Description: r.description, Lines: Number(r.lines), Quantity: Number(r.qty), Taxable: Number(r.taxable), Tax: Number(r.tax) }));
}

export async function customerTax(db) {
  const rows = (await db.query(`
    SELECT coalesce(buyer_name,'(unknown)') AS customer, buyer_gstin,
           count(*) AS invoices,
           coalesce(sum(total_inv_val - total_tax_val),0) AS taxable,
           coalesce(sum(total_tax_val),0) AS tax,
           coalesce(sum(total_inv_val),0) AS total
    FROM gst_einvoices WHERE is_deleted=FALSE AND status IN ('irn_generated','printed')
    GROUP BY 1,2 ORDER BY total DESC NULLS LAST`)).rows;
  return rows.map((r) => ({ Customer: r.customer, GSTIN: r.buyer_gstin, Invoices: Number(r.invoices), Taxable: Number(r.taxable), Tax: Number(r.tax), Total: Number(r.total) }));
}

export async function stateTax(db) {
  const rows = (await db.query(`
    SELECT coalesce(buyer_dtls->>'pos', buyer_dtls->>'stateCode') AS st,
           count(*) AS invoices,
           coalesce(sum(total_inv_val - total_tax_val),0) AS taxable,
           coalesce(sum(total_tax_val),0) AS tax,
           coalesce(sum(total_inv_val),0) AS total
    FROM gst_einvoices WHERE is_deleted=FALSE AND status IN ('irn_generated','printed')
    GROUP BY 1 ORDER BY total DESC NULLS LAST`)).rows;
  return rows.map((r) => ({ State: stName(r.st), Invoices: Number(r.invoices), Taxable: Number(r.taxable), Tax: Number(r.tax), Total: Number(r.total) }));
}

export async function irnStatus(db) {
  const r = (await db.query(`
    SELECT count(*) FILTER (WHERE status IN ('irn_generated','printed')) AS success,
           count(*) FILTER (WHERE status='error') AS failed,
           count(*) FILTER (WHERE status='cancelled') AS cancelled,
           count(*) FILTER (WHERE status IN ('draft','validated','needs_review','pending_submission')) AS pending,
           count(*) AS total
    FROM gst_einvoices WHERE is_deleted=FALSE`)).rows[0];
  return [
    { Metric: 'IRN Generated (success)', Count: Number(r.success) },
    { Metric: 'Failed / Error', Count: Number(r.failed) },
    { Metric: 'Cancelled', Count: Number(r.cancelled) },
    { Metric: 'Pending / Draft', Count: Number(r.pending) },
    { Metric: 'Total', Count: Number(r.total) },
  ];
}

export async function ewbValidity(db) {
  const rows = (await db.query(`
    SELECT ewb_no, doc_no, to_trade_name, vehicle_no, valid_upto,
      CASE WHEN is_cancelled THEN 'Cancelled'
           WHEN is_closed THEN 'Closed'
           WHEN valid_upto IS NULL THEN 'Part A only'
           WHEN valid_upto < now() THEN 'Expired'
           WHEN valid_upto < now() + interval '24 hours' THEN 'Expiring soon'
           ELSE 'Active' END AS validity
    FROM gst_eway_bills WHERE is_deleted=FALSE AND ewb_no IS NOT NULL
    ORDER BY valid_upto NULLS LAST`)).rows;
  return rows.map((r) => ({ 'EWB No': r.ewb_no, 'Doc No': r.doc_no, 'To': r.to_trade_name, 'Vehicle': r.vehicle_no, 'Valid Upto': r.valid_upto, 'Status': r.validity }));
}

export async function cancelledDocs(db) {
  const inv = (await db.query(`SELECT 'e-Invoice' AS type, doc_no AS doc, irn AS ref, cancel_reason_code AS reason, cancel_date FROM gst_einvoices WHERE is_cancelled=TRUE AND is_deleted=FALSE`)).rows;
  const ewb = (await db.query(`SELECT 'e-Way Bill' AS type, doc_no AS doc, ewb_no AS ref, cancel_reason_code AS reason, cancel_date FROM gst_eway_bills WHERE is_cancelled=TRUE AND is_deleted=FALSE`)).rows;
  return [...inv, ...ewb]
    .sort((a, b) => new Date(b.cancel_date) - new Date(a.cancel_date))
    .map((r) => ({ Type: r.type, Document: r.doc, Reference: r.ref, 'Reason Code': r.reason, 'Cancelled On': r.cancel_date }));
}

export async function auditActivity(db, { limit = 1000 } = {}) {
  const rows = (await db.query(`
    SELECT a.created_at, a.object_type, a.event_type, a.message, u.name AS user_name
    FROM gst_audit_events a LEFT JOIN users u ON u.id=a.user_id
    ORDER BY a.created_at DESC LIMIT $1`, [limit])).rows;
  return rows.map((r) => ({ When: r.created_at, Object: r.object_type, Event: r.event_type, By: r.user_name, Detail: r.message }));
}

export const REPORTS = {
  'gst-summary': { title: 'GST Summary', fn: gstSummary },
  'hsn-summary': { title: 'HSN Summary', fn: hsnSummary },
  'customer-tax': { title: 'Customer-wise Tax Report', fn: customerTax },
  'state-tax': { title: 'State-wise Tax Report', fn: stateTax },
  'irn-status': { title: 'IRN Success / Failure Report', fn: irnStatus },
  'ewb-validity': { title: 'EWB Validity Report', fn: ewbValidity },
  'cancelled': { title: 'Cancelled Documents Report', fn: cancelledDocs },
  'audit': { title: 'Audit Activity Report', fn: auditActivity },
};
