import fs from 'node:fs';
import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { dashboardGst } from '../services/gst/rollupService.js';
import { BACKUP_DIR } from '../services/gst/backupService.js';
import { UPLOAD_ROOT } from '../middleware/upload.js';

const router = Router();
router.use(authenticate);

const dirSize = (dir) => { let s = 0; try { for (const f of fs.readdirSync(dir)) { try { const st = fs.statSync(`${dir}/${f}`); if (st.isFile()) s += st.size; } catch { /* */ } } } catch { /* */ } return s; };
const count1 = async (sql) => { try { return Number((await query(sql)).rows[0].c); } catch { return 0; } };

// GET /api/dashboard/system-counters — §11 production counters (single source for the tiles)
router.get(
  '/system-counters',
  asyncHandler(async (_req, res) => {
    const [vendors, offices, invoices, einvoices, challans, ewbs] = await Promise.all([
      count1('SELECT count(*) c FROM vendors'),
      count1('SELECT count(*) c FROM gst_branches'),
      count1('SELECT count(*) c FROM invoices WHERE is_deleted = FALSE'),
      count1('SELECT count(*) c FROM gst_einvoices WHERE is_deleted = FALSE'),
      count1('SELECT count(*) c FROM delivery_challans WHERE is_deleted = FALSE'),
      count1('SELECT count(*) c FROM gst_eway_bills WHERE is_deleted = FALSE'),
    ]);
    let lastBackup = null, backupHealth = null;
    try { const r = (await query("SELECT started_at, health FROM gst_backups ORDER BY started_at DESC LIMIT 1")).rows[0]; if (r) { lastBackup = r.started_at; backupHealth = r.health; } } catch { /* */ }
    let lastCloudSync = null;
    try { const r = (await query("SELECT value FROM app_config WHERE key='last_cloud_sync'")).rows[0]; if (r) lastCloudSync = r.value?.at || r.value; } catch { /* */ }
    res.json({
      vendors, offices, invoices, einvoices, challans, ewbs,
      lastBackup, backupHealth, lastCloudSync,
      pendingSync: null, // populated once the background sync queue (Phase 7) is live
      storageBytes: dirSize(BACKUP_DIR) + dirSize(UPLOAD_ROOT),
    });
  })
);

// GET /api/dashboard/gst  — GST compliance summary surfaced on the main dashboard
router.get(
  '/gst',
  asyncHandler(async (_req, res) => {
    let gst = { todayIrns: 0, activeEwbs: 0, expiringEwbs: 0, complianceAlerts: 0, failedSubmissions: 0, recent: [] };
    try { gst = await dashboardGst(); } catch { /* GST module optional */ }
    res.json(gst);
  })
);

// GET /api/dashboard/summary  — headline KPIs
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const [outgoing, incoming, receivables, pendingInvoices, pendingProofInvoices, recon, projects, vendorLiab] =
      await Promise.all([
        query("SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE is_deleted=FALSE AND txn_kind='expense'"),
        query("SELECT COALESCE(SUM(credited_amount),0) AS v FROM receipts WHERE is_deleted=FALSE AND txn_kind='income'"),
        query(`SELECT COALESCE(SUM(outstanding),0) AS v FROM v_client_balances`),
        query(`SELECT COUNT(*) AS v FROM invoices WHERE status IN ('raised','sent','partially_paid','overdue') AND is_deleted=FALSE`),
        query("SELECT COUNT(*) AS v FROM payments WHERE invoice_status='pending' AND is_deleted=FALSE AND txn_kind='expense'"),
        query(`SELECT COUNT(*) AS v FROM bank_statement_lines WHERE status='unmatched' AND (comment IS NULL OR classified=false)`),
        query(`SELECT COUNT(*) AS v FROM projects WHERE status='active' AND is_deleted=FALSE`),
        query(`SELECT COALESCE(SUM(GREATEST(balance,0)),0) AS v FROM v_vendor_balances`),
      ]);

    res.json({
      total_outgoing: outgoing.rows[0].v,
      total_incoming: incoming.rows[0].v,
      pending_receivables: receivables.rows[0].v,
      pending_invoices: pendingInvoices.rows[0].v,
      invoice_pending_payments: pendingProofInvoices.rows[0].v,
      reconciliation_pending: recon.rows[0].v,
      active_projects: projects.rows[0].v,
      vendor_liabilities: vendorLiab.rows[0].v,
      net_position: incoming.rows[0].v - outgoing.rows[0].v,
    });
  })
);

// GET /api/dashboard/cashflow?months=6  — monthly in/out trend
router.get(
  '/cashflow',
  asyncHandler(async (req, res) => {
    const months = Math.min(Number(req.query.months || 6), 24);
    const { rows } = await query(
      `
      WITH series AS (
        SELECT to_char(date_trunc('month', (CURRENT_DATE - (n || ' month')::interval)), 'YYYY-MM') AS ym
        FROM generate_series(0, $1 - 1) n
      )
      SELECT s.ym AS month,
        COALESCE((SELECT SUM(amount) FROM payments p WHERE to_char(p.payment_date,'YYYY-MM')=s.ym AND p.is_deleted=FALSE AND p.txn_kind='expense'),0) AS outgoing,
        COALESCE((SELECT SUM(credited_amount) FROM receipts r WHERE to_char(r.credited_date,'YYYY-MM')=s.ym AND r.is_deleted=FALSE AND r.txn_kind='income'),0) AS incoming
      FROM series s
      ORDER BY s.ym
      `,
      [months]
    );
    res.json(rows);
  })
);

// GET /api/dashboard/expense-by-category
router.get(
  '/expense-by-category',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      SELECT COALESCE(ec.name,'Unclassified') AS category, COALESCE(SUM(p.amount),0) AS amount
      FROM payments p
      LEFT JOIN expense_categories ec ON ec.id=p.category_id
      WHERE p.is_deleted=FALSE AND p.txn_kind='expense'
      GROUP BY ec.name
      ORDER BY amount DESC
    `);
    res.json(rows);
  })
);

// GET /api/dashboard/expense-by-project
router.get(
  '/expense-by-project',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      SELECT pr.name AS project, pr.budget,
        COALESCE((SELECT SUM(amount) FROM v_outgoing_alloc WHERE project_id=pr.id),0) AS spent,
        COALESCE((SELECT SUM(amount) FROM v_incoming_alloc WHERE project_id=pr.id),0) AS received
      FROM projects pr
      WHERE pr.is_deleted=FALSE
      GROUP BY pr.id, pr.name, pr.budget
      ORDER BY spent DESC
      LIMIT 10
    `);
    res.json(rows);
  })
);

// GET /api/dashboard/vendor-spend — top vendors by expenditure
router.get(
  '/vendor-spend',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT vendor_name AS vendor, category, total_spent, payment_count
       FROM v_vendor_spend WHERE total_spent > 0 ORDER BY total_spent DESC LIMIT 10`
    );
    res.json(rows);
  })
);

// GET /api/dashboard/receivable-aging — outstanding invoice value bucketed by age
router.get(
  '/receivable-aging',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      WITH open_inv AS (
        SELECT (total_amount - amount_received) AS due,
               COALESCE(due_date, issue_date, created_at::date) AS ref_date
        FROM invoices
        WHERE is_deleted=FALSE AND status IN ('raised','sent','partially_paid','overdue')
          AND (total_amount - amount_received) > 0
      )
      SELECT
        COALESCE(SUM(due) FILTER (WHERE CURRENT_DATE - ref_date <= 30),0)               AS bucket_0_30,
        COALESCE(SUM(due) FILTER (WHERE CURRENT_DATE - ref_date BETWEEN 31 AND 60),0)    AS bucket_31_60,
        COALESCE(SUM(due) FILTER (WHERE CURRENT_DATE - ref_date BETWEEN 61 AND 90),0)    AS bucket_61_90,
        COALESCE(SUM(due) FILTER (WHERE CURRENT_DATE - ref_date > 90),0)                 AS bucket_90_plus
      FROM open_inv
    `);
    const r = rows[0];
    res.json([
      { bucket: '0–30 days', amount: r.bucket_0_30 },
      { bucket: '31–60 days', amount: r.bucket_31_60 },
      { bucket: '61–90 days', amount: r.bucket_61_90 },
      { bucket: '90+ days', amount: r.bucket_90_plus },
    ]);
  })
);

// GET /api/dashboard/client-revenue — receipts grouped by client
router.get(
  '/client-revenue',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      SELECT COALESCE(c.name,'Unassigned') AS client, COALESCE(SUM(r.credited_amount),0) AS received
      FROM receipts r LEFT JOIN clients c ON c.id=r.client_id
      WHERE r.is_deleted=FALSE AND r.txn_kind='income'
      GROUP BY c.name ORDER BY received DESC LIMIT 8
    `);
    res.json(rows);
  })
);

// GET /api/dashboard/recent  — recent transactions feed
router.get(
  '/recent',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      (SELECT 'payment' AS kind, p.id, p.amount, p.payment_date AS date, p.comment AS note,
              v.name AS party, p.created_at
       FROM payments p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.is_deleted=FALSE AND p.txn_kind='expense')
      UNION ALL
      (SELECT 'receipt' AS kind, r.id, r.credited_amount AS amount, r.credited_date AS date, r.comment AS note,
              c.name AS party, r.created_at
       FROM receipts r LEFT JOIN clients c ON c.id=r.client_id WHERE r.is_deleted=FALSE AND r.txn_kind='income')
      ORDER BY created_at DESC
      LIMIT 12
    `);
    res.json(rows);
  })
);

export default router;
