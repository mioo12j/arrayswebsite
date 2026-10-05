import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { denyExportForAdmin } from '../middleware/rbac.js';
import { streamExcel, streamPdf } from '../services/export.service.js';

const router = Router();
// Every endpoint here streams an Excel/PDF export — the admin (view-only) cannot.
router.use(authenticate, denyExportForAdmin);

const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
const fmt = (req) => (req.query.format === 'pdf' ? 'pdf' : 'xlsx');
const lng = (req) => (String(req.query.lang || '').toLowerCase().startsWith('hi') ? 'hi' : 'en');

async function send(res, format, lang, payload) {
  if (format === 'pdf') return streamPdf(res, payload, lang);
  return streamExcel(res, payload, lang);
}

// Build a date/subtitle suffix describing the active filter window.
function rangeLabel(q) {
  if (q.from && q.to) return `${q.from} to ${q.to}`;
  if (q.from) return `from ${q.from}`;
  if (q.to) return `up to ${q.to}`;
  return 'All dates';
}

// ── Outgoing Payments (filterable) ──────────────────────────────────────────
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { search, vendor_id, employee_id, project_id, site_id, category_id, invoice_status, from, to } = req.query;
    const p = [];
    const where = ['p.is_deleted=FALSE'];
    // Financial report: only real operating expenses by default (exclude internal
    // transfers / financing). Pass include_transfers=1 to see every bank debit.
    if (req.query.include_transfers !== '1') where.push("p.txn_kind='expense'");
    if (search) { p.push(`%${search}%`); where.push(`(p.reference_id ILIKE $${p.length} OR p.beneficiary_name ILIKE $${p.length} OR p.comment ILIKE $${p.length} OR v.name ILIKE $${p.length} OR e.name ILIKE $${p.length})`); }
    if (vendor_id) { p.push(vendor_id); where.push(`p.vendor_id=$${p.length}`); }
    if (employee_id) { p.push(employee_id); where.push(`p.employee_id=$${p.length}`); }
    if (project_id) { p.push(project_id); where.push(`p.project_id=$${p.length}`); }
    if (site_id) { p.push(site_id); where.push(`p.site_id=$${p.length}`); }
    if (category_id) { p.push(category_id); where.push(`p.category_id=$${p.length}`); }
    if (invoice_status) { p.push(invoice_status); where.push(`p.invoice_status=$${p.length}`); }
    if (from) { p.push(from); where.push(`p.payment_date >= $${p.length}`); }
    if (to) { p.push(to); where.push(`p.payment_date <= $${p.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT to_char(p.payment_date,'DD/MM/YYYY') AS payment_date, p.reference_id,
              COALESCE(v.name, e.name, p.beneficiary_name) AS vendor, p.beneficiary_name,
              CASE WHEN p.employee_id IS NOT NULL THEN 'Employee' ELSE 'Vendor' END AS payee_type,
              pr.name AS project, ec.name AS category, p.amount,
              p.invoice_status, p.bank_remarks AS remark, p.comment
       FROM payments p
       LEFT JOIN vendors v ON v.id=p.vendor_id
       LEFT JOIN employees e ON e.id=p.employee_id
       LEFT JOIN projects pr ON pr.id=p.project_id
       LEFT JOIN expense_categories ec ON ec.id=p.category_id
       ${w}
       ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC`,
      p
    );
    await send(res, fmt(req), lng(req), {
      title: 'Outgoing Payments Report',
      subtitle: rangeLabel(req.query),
      filename: 'payments-report',
      columns: [
        { header: 'Date', key: 'payment_date', xlsWidth: 13 },
        { header: 'Reference', key: 'reference_id', xlsWidth: 20 },
        { header: 'Payee', key: 'vendor', xlsWidth: 24 },
        { header: 'Type', key: 'payee_type', xlsWidth: 10 },
        { header: 'Bank Beneficiary', key: 'beneficiary_name', xlsWidth: 24 },
        { header: 'Project', key: 'project', xlsWidth: 18 },
        { header: 'Category', key: 'category', xlsWidth: 16 },
        { header: 'Amount', key: 'amount', xlsWidth: 15, money: true },
        { header: 'Invoice', key: 'invoice_status', xlsWidth: 11 },
        { header: 'Remark', key: 'remark', xlsWidth: 28 },
        { header: 'Comment', key: 'comment', xlsWidth: 30 },
      ],
      rows,
      totals: { amount: sum(rows, 'amount') },
    });
  })
);

// ── Incoming Receipts (filterable) ──────────────────────────────────────────
router.get(
  '/receipts',
  asyncHandler(async (req, res) => {
    const { search, client_id, project_id, from, to } = req.query;
    const p = [];
    const where = ['r.is_deleted=FALSE'];
    // Financial report: only real operating income by default (exclude internal
    // transfers / financing / refunds). Pass include_transfers=1 for every credit.
    if (req.query.include_transfers !== '1') where.push("r.txn_kind='income'");
    if (search) { p.push(`%${search}%`); where.push(`(r.reference_id ILIKE $${p.length} OR r.comment ILIKE $${p.length} OR c.name ILIKE $${p.length})`); }
    if (client_id) { p.push(client_id); where.push(`r.client_id=$${p.length}`); }
    if (project_id) { p.push(project_id); where.push(`r.project_id=$${p.length}`); }
    if (from) { p.push(from); where.push(`r.credited_date >= $${p.length}`); }
    if (to) { p.push(to); where.push(`r.credited_date <= $${p.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT to_char(r.credited_date,'DD/MM/YYYY') AS credited_date, r.reference_id,
              c.name AS client, pr.name AS project, i.invoice_number,
              r.credited_amount, r.tds_amount, r.retention_amount, r.deduction_amount, r.comment
       FROM receipts r
       LEFT JOIN clients c ON c.id=r.client_id
       LEFT JOIN projects pr ON pr.id=r.project_id
       LEFT JOIN invoices i ON i.id=r.invoice_id
       ${w}
       ORDER BY r.credited_date DESC NULLS LAST, r.created_at DESC`,
      p
    );
    await send(res, fmt(req), lng(req), {
      title: 'Incoming Receipts Report',
      subtitle: rangeLabel(req.query),
      filename: 'receipts-report',
      columns: [
        { header: 'Date', key: 'credited_date', xlsWidth: 13 },
        { header: 'Reference', key: 'reference_id', xlsWidth: 20 },
        { header: 'Client', key: 'client', xlsWidth: 24 },
        { header: 'Project', key: 'project', xlsWidth: 18 },
        { header: 'Invoice', key: 'invoice_number', xlsWidth: 16 },
        { header: 'Credited', key: 'credited_amount', xlsWidth: 15, money: true },
        { header: 'TDS', key: 'tds_amount', xlsWidth: 12, money: true },
        { header: 'Retention', key: 'retention_amount', xlsWidth: 12, money: true },
        { header: 'Comment', key: 'comment', xlsWidth: 28 },
      ],
      rows,
      totals: {
        credited_amount: sum(rows, 'credited_amount'), tds_amount: sum(rows, 'tds_amount'),
        retention_amount: sum(rows, 'retention_amount'),
      },
    });
  })
);

// ── Ledger statement (running balance) ──────────────────────────────────────
// party = 'vendor' | 'client'
async function ledgerStatement(res, format, lang, party, id, q) {
  const table = party === 'vendor' ? 'vendors' : party === 'employee' ? 'employees' : 'clients';
  const { rows: pr } = await query(`SELECT name, opening_balance FROM ${table} WHERE id=$1`, [id]);
  if (!pr[0]) throw new ApiError(404, `${party} not found`);

  const params = [party, id];
  const dateW = [];
  if (q.from) { params.push(q.from); dateW.push(`le.entry_date >= $${params.length}`); }
  if (q.to) { params.push(q.to); dateW.push(`le.entry_date <= $${params.length}`); }
  const w = dateW.length ? `AND ${dateW.join(' AND ')}` : '';

  const { rows: entries } = await query(
    `SELECT to_char(le.entry_date,'DD/MM/YYYY') AS date, le.direction, le.amount, le.description,
            le.source_type, pj.name AS project
     FROM ledger_entries le
     LEFT JOIN projects pj ON pj.id=le.project_id
     WHERE le.party_type=$1::ledger_party AND le.party_id=$2 ${w}
     ORDER BY le.entry_date, le.created_at`,
    params
  );

  // For a vendor, debit = paid out, credit = billed by vendor (owed).
  // For a client, debit = billed to client, credit = received.
  let balance = Number(pr[0].opening_balance || 0);
  const rows = entries.map((e) => {
    const amt = Number(e.amount || 0);
    const debit = e.direction === 'debit' ? amt : 0;
    const credit = e.direction === 'credit' ? amt : 0;
    if (party === 'client') balance += debit - credit; // receivable up on bill, down on receipt
    else balance += credit - debit;                    // payable (vendor/employee): up on credit, down on payment
    return {
      date: e.date,
      particulars: e.description || (e.source_type ? e.source_type[0].toUpperCase() + e.source_type.slice(1) : '—'),
      project: e.project || '',
      debit: debit || '',
      credit: credit || '',
      balance,
    };
  });

  const opening = Number(pr[0].opening_balance || 0);
  const allRows = [
    { date: '', particulars: 'Opening Balance', project: '', debit: '', credit: '', balance: opening },
    ...rows,
  ];
  const closing = rows.length ? rows[rows.length - 1].balance : opening;

  const partyLabel = party === 'vendor' ? 'Vendor' : party === 'employee' ? 'Employee' : 'Client';
  await send(res, format, lang, {
    title: `${partyLabel} Ledger — ${pr[0].name}`,
    subtitle: `${rangeLabel(q)}   •   Closing Balance: ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(closing)}`,
    filename: `${party}-ledger-${pr[0].name}`,
    columns: [
      { header: 'Date', key: 'date', xlsWidth: 13 },
      { header: 'Particulars', key: 'particulars', xlsWidth: 40 },
      { header: 'Project', key: 'project', xlsWidth: 20 },
      { header: party === 'client' ? 'Billed (Dr)' : 'Paid (Dr)', key: 'debit', xlsWidth: 16, money: true },
      { header: party === 'client' ? 'Received (Cr)' : 'Credit (Cr)', key: 'credit', xlsWidth: 16, money: true },
      { header: 'Balance', key: 'balance', xlsWidth: 16, money: true },
    ],
    rows: allRows,
    totals: { particulars: 'Closing Balance', balance: closing },
  });
}

router.get('/vendor-ledger/:id', asyncHandler((req, res) => ledgerStatement(res, fmt(req), lng(req), 'vendor', req.params.id, req.query)));
router.get('/client-ledger/:id', asyncHandler((req, res) => ledgerStatement(res, fmt(req), lng(req), 'client', req.params.id, req.query)));
router.get('/employee-ledger/:id', asyncHandler((req, res) => ledgerStatement(res, fmt(req), lng(req), 'employee', req.params.id, req.query)));

// ── Invoices ────────────────────────────────────────────────────────────────
router.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const { client_id, project_id, status, from, to } = req.query;
    const p = [];
    const where = [];
    if (client_id) { p.push(client_id); where.push(`i.client_id=$${p.length}`); }
    if (project_id) { p.push(project_id); where.push(`i.project_id=$${p.length}`); }
    if (status) { p.push(status); where.push(`i.status=$${p.length}`); }
    if (from) { p.push(from); where.push(`i.issue_date >= $${p.length}`); }
    if (to) { p.push(to); where.push(`i.issue_date <= $${p.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT i.invoice_number, i.type, i.status, c.name AS client, pr.name AS project,
              to_char(i.issue_date,'DD/MM/YYYY') AS issue_date, to_char(i.due_date,'DD/MM/YYYY') AS due_date,
              i.total_amount, i.amount_received, (i.total_amount - i.amount_received) AS balance
       FROM invoices i
       LEFT JOIN clients c ON c.id=i.client_id
       LEFT JOIN projects pr ON pr.id=i.project_id
       ${w ? `${w} AND i.is_deleted=FALSE` : 'WHERE i.is_deleted=FALSE'}
       ORDER BY i.issue_date DESC NULLS LAST`,
      p
    );
    await send(res, fmt(req), lng(req), {
      title: 'Invoices Report',
      subtitle: rangeLabel(req.query),
      filename: 'invoices-report',
      columns: [
        { header: 'Invoice #', key: 'invoice_number', xlsWidth: 18 },
        { header: 'Type', key: 'type', xlsWidth: 10 },
        { header: 'Status', key: 'status', xlsWidth: 14 },
        { header: 'Client', key: 'client', xlsWidth: 24 },
        { header: 'Project', key: 'project', xlsWidth: 18 },
        { header: 'Issued', key: 'issue_date', xlsWidth: 13 },
        { header: 'Due', key: 'due_date', xlsWidth: 13 },
        { header: 'Total', key: 'total_amount', xlsWidth: 15, money: true },
        { header: 'Received', key: 'amount_received', xlsWidth: 15, money: true },
        { header: 'Balance', key: 'balance', xlsWidth: 15, money: true },
      ],
      rows,
      totals: {
        total_amount: sum(rows, 'total_amount'), amount_received: sum(rows, 'amount_received'),
        balance: sum(rows, 'balance'),
      },
    });
  })
);

// ── Reconciliation report ───────────────────────────────────────────────────
router.get(
  '/reconciliation/:id',
  asyncHandler(async (req, res) => {
    const { rows: st } = await query('SELECT * FROM bank_statements WHERE id=$1', [req.params.id]);
    if (!st[0]) throw new ApiError(404, 'Statement not found');
    const { rows } = await query(
      `SELECT to_char(l.txn_date,'DD/MM/YYYY') AS txn_date, l.mode, l.reference_id, l.account_number, l.beneficiary,
              CASE WHEN l.debit>0 THEN 'Debit' ELSE 'Credit' END AS dr_cr,
              GREATEST(l.debit, l.credit) AS amount, l.status,
              COALESCE(v.name, c.name) AS party
       FROM bank_statement_lines l
       LEFT JOIN vendors v ON v.id=l.vendor_id
       LEFT JOIN clients c ON c.id=l.client_id
       WHERE l.statement_id=$1 ORDER BY l.serial_no NULLS LAST, l.txn_date`,
      [req.params.id]
    );
    await send(res, fmt(req), lng(req), {
      title: `Reconciliation — ${st[0].label || 'Statement'}`,
      filename: `reconciliation-${st[0].label || 'statement'}`,
      columns: [
        { header: 'Date', key: 'txn_date', xlsWidth: 13 },
        { header: 'Mode', key: 'mode', xlsWidth: 8 },
        { header: 'Reference', key: 'reference_id', xlsWidth: 18 },
        { header: 'Account', key: 'account_number', xlsWidth: 18 },
        { header: 'Beneficiary', key: 'beneficiary', xlsWidth: 24 },
        { header: 'Mapped Vendor/Client', key: 'party', xlsWidth: 22 },
        { header: 'Dr/Cr', key: 'dr_cr', xlsWidth: 8 },
        { header: 'Amount', key: 'amount', xlsWidth: 15, money: true },
        { header: 'Status', key: 'status', xlsWidth: 12 },
      ],
      rows,
      totals: { amount: sum(rows, 'amount') },
    });
  })
);

// ── Project profitability ───────────────────────────────────────────────────
router.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT pr.name AS project, pr.status, pr.budget, pr.contract_value,
        COALESCE((SELECT SUM(amount) FROM v_outgoing_alloc WHERE project_id=pr.id),0) AS spent,
        COALESCE((SELECT SUM(amount) FROM v_incoming_alloc WHERE project_id=pr.id),0) AS received,
        pr.contract_value - COALESCE((SELECT SUM(amount) FROM v_outgoing_alloc WHERE project_id=pr.id),0) AS gross_margin
      FROM projects pr WHERE pr.is_deleted=FALSE ORDER BY pr.created_at DESC
    `);
    await send(res, fmt(req), lng(req), {
      title: 'Project Profitability Report',
      filename: 'project-profitability',
      columns: [
        { header: 'Project', key: 'project', xlsWidth: 26 },
        { header: 'Status', key: 'status', xlsWidth: 12 },
        { header: 'Budget', key: 'budget', xlsWidth: 15, money: true },
        { header: 'Contract', key: 'contract_value', xlsWidth: 15, money: true },
        { header: 'Spent', key: 'spent', xlsWidth: 15, money: true },
        { header: 'Received', key: 'received', xlsWidth: 15, money: true },
        { header: 'Gross Margin', key: 'gross_margin', xlsWidth: 16, money: true },
      ],
      rows,
      totals: {
        budget: sum(rows, 'budget'), contract_value: sum(rows, 'contract_value'),
        spent: sum(rows, 'spent'), received: sum(rows, 'received'), gross_margin: sum(rows, 'gross_margin'),
      },
    });
  })
);

// ── Allocation breakdowns (incoming = collections, outgoing = expenses) ──────
// JSON summaries that respect the per-project/site/milestone/Other tagging.
router.get(
  '/allocations/incoming',
  asyncHandler(async (_req, res) => {
    const byProject = (await query(
      `SELECT pr.name AS project, COALESCE(SUM(v.amount),0) AS amount
         FROM v_incoming_alloc v JOIN projects pr ON pr.id=v.project_id
        WHERE v.project_id IS NOT NULL GROUP BY pr.name ORDER BY amount DESC`)).rows;
    const byMilestone = (await query(
      `SELECT pr.name AS project, t.title AS milestone, COALESCE(SUM(v.amount),0) AS amount
         FROM v_incoming_alloc v JOIN project_payment_terms t ON t.id=v.milestone_id JOIN projects pr ON pr.id=t.project_id
        WHERE v.milestone_id IS NOT NULL GROUP BY pr.name, t.title ORDER BY amount DESC`)).rows;
    const other = (await query(
      `SELECT COALESCE(NULLIF(TRIM(description),''),'Other') AS label, COALESCE(SUM(amount),0) AS amount
         FROM v_incoming_alloc WHERE project_id IS NULL AND milestone_id IS NULL GROUP BY 1 ORDER BY amount DESC`)).rows;
    res.json({ byProject, byMilestone, other });
  })
);
router.get(
  '/allocations/outgoing',
  asyncHandler(async (_req, res) => {
    const byProject = (await query(
      `SELECT pr.name AS project, COALESCE(SUM(v.amount),0) AS amount
         FROM v_outgoing_alloc v JOIN projects pr ON pr.id=v.project_id
        WHERE v.project_id IS NOT NULL GROUP BY pr.name ORDER BY amount DESC`)).rows;
    const bySite = (await query(
      `SELECT s.name AS site, COALESCE(SUM(v.amount),0) AS amount
         FROM v_outgoing_alloc v JOIN sites s ON s.id=v.site_id
        WHERE v.site_id IS NOT NULL GROUP BY s.name ORDER BY amount DESC`)).rows;
    const other = (await query(
      `SELECT COALESCE(NULLIF(TRIM(description),''),'Other') AS label, COALESCE(SUM(amount),0) AS amount
         FROM v_outgoing_alloc WHERE project_id IS NULL AND site_id IS NULL GROUP BY 1 ORDER BY amount DESC`)).rows;
    res.json({ byProject, bySite, other });
  })
);

export default router;
