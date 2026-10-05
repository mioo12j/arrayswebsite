// ============================================================================
//  System data tools (editor / super-admin only).
//  - clearAllData: wipe every operational table (keep users + categories).
//  - seedDemo:    load a realistic demo dataset to showcase the platform.
// ============================================================================
import { postLedgerEntry, refreshInvoiceStatus } from './ledger.service.js';
import { calculateQuote } from './quote-calc.service.js';

// All operational data across core ERP + GST + Delivery Challan modules.
// KEPT (not listed): users, expense_categories, app_config, gst_master_data,
// gst_branches, gst_number_series, gst_backups — i.e. logins, branding, branch
// & numbering setup, reference data and the backup ledger survive a clear.
const DATA_TABLES = [
  // core ERP
  'audit_logs', 'ledger_entries', 'payments', 'receipts', 'invoices',
  'bank_statement_lines', 'bank_statements', 'vendor_accounts', 'vendors',
  'employees', 'clients', 'sites', 'projects', 'quotes',
  'vault_document_versions', 'vault_documents', 'materials', 'shipments',
  'geo_verifications', 'documents',
  // GST compliance documents + logs
  'gst_einvoices', 'gst_eway_bills', 'gst_api_logs', 'gst_audit_events',
  'gst_access_logs', 'gst_recon_resolutions', 'gst_notifications',
  'gst_attachments', 'gst_gstin_validations', 'gst_otp_challenges',
  'gst_versions', 'gst_comments', 'gst_comment_reads', 'gst_saved_views',
  'gst_imports', 'gst_report_runs',
  // delivery challan module
  'delivery_challan_returns', 'delivery_challan_status_history',
  'delivery_challan_items', 'delivery_challans',
];

export async function clearAllData(db) {
  // Truncate only tables that exist in this schema version.
  const { rows } = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
    [DATA_TABLES]);
  const present = DATA_TABLES.filter((t) => rows.some((r) => r.table_name === t));
  await db.query(`TRUNCATE ${present.join(', ')} RESTART IDENTITY CASCADE`);
  // Reset numbering so the first real document is #1 (numbering format is kept).
  try { await db.query('UPDATE gst_number_series SET next_number = 1'); } catch { /* ignore */ }
}

export async function seedDemo(db, userId) {
  // Always start from a clean slate so the demo set is predictable.
  await clearAllData(db);

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const { rows: cats } = await db.query('SELECT id, name FROM expense_categories');
  const cat = (n) => cats.find((c) => c.name === n)?.id || null;

  // ── Clients ────────────────────────────────────────────────────────────────
  const clients = {};
  for (const [key, name, gst] of [
    ['tata', 'Tata Power Solar', '27AAACT1234A1Z5'],
    ['adani', 'Adani Green Energy', '24AAACA5678B1Z3'],
    ['reliance', 'Reliance Infrastructure', '27AAACR9012C1Z1'],
  ]) {
    clients[key] = await one(
      `INSERT INTO clients (name, gstin) VALUES ($1,$2) RETURNING *`, [name, gst]
    );
  }

  // ── Vendors (+ beneficiary accounts) ─────────────────────────────────────────
  const vendors = {};
  for (const [key, name, category, acct] of [
    ['steel', 'Steelworks India Pvt Ltd', 'Steel', '32911016237'],
    ['panel', 'SunPanel Distributors', 'Solar Panels', '50200086148945'],
    ['transport', 'Bharat Logistics', 'Transport', '11250100456789'],
    ['electrical', 'Volt Electricals', 'Electrical', '94512010011121'],
  ]) {
    const v = await one(
      `INSERT INTO vendors (name, category, bank_account) VALUES ($1,$2,$3) RETURNING *`,
      [name, category, acct]
    );
    await db.query(`INSERT INTO vendor_accounts (vendor_id, account_number, label) VALUES ($1,$2,'primary')`, [v.id, acct]);
    vendors[key] = v;
  }

  // ── Employees ────────────────────────────────────────────────────────────────
  const employees = {};
  for (const [key, name, desig, dept] of [
    ['ramesh', 'Ramesh Kumar', 'Site Supervisor', 'Site'],
    ['anita', 'Anita Sharma', 'Accountant', 'Office'],
  ]) {
    employees[key] = await one(
      `INSERT INTO employees (name, designation, department) VALUES ($1,$2,$3) RETURNING *`,
      [name, desig, dept]
    );
  }

  // ── Projects + sites ─────────────────────────────────────────────────────────
  const proj1 = await one(
    `INSERT INTO projects (name, code, client_id, client_name, capacity_kw, budget, contract_value, location, status, start_date)
     VALUES ($1,'PRJ-001',$2,$3,2000,8000000,11000000,'Sriperumbudur','active','2026-02-01') RETURNING *`,
    ['Samsung Rooftop 2MW', clients.tata.id, clients.tata.name]
  );
  const proj2 = await one(
    `INSERT INTO projects (name, code, client_id, client_name, capacity_kw, budget, contract_value, location, status, start_date)
     VALUES ($1,'PRJ-002',$2,$3,5000,20000000,26000000,'Charanka','active','2026-03-01') RETURNING *`,
    ['GEDA Ground Mount 5MW', clients.adani.id, clients.adani.name]
  );
  const site1 = await one(`INSERT INTO sites (project_id, name, budget) VALUES ($1,'Phase 4 Block A',3000000) RETURNING *`, [proj1.id]);

  // ── Invoices (raised → client ledger debit) ──────────────────────────────────
  async function invoice(num, client, project, taxable, gst, issue, due, status) {
    const inv = await one(
      `INSERT INTO invoices (invoice_number, type, status, client_id, project_id, issue_date, due_date, taxable_amount, gst_amount, total_amount, created_by)
       VALUES ($1,'tax',$2::invoice_status,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [num, status, client.id, project.id, issue, due, taxable, gst, taxable + gst, userId]
    );
    await postLedgerEntry(db, {
      partyType: 'client', partyId: client.id, direction: 'debit', amount: inv.total_amount,
      entryDate: issue, description: `Invoice ${num}`, projectId: project.id, sourceType: 'invoice', sourceId: inv.id, userId,
    });
    return inv;
  }
  const inv1 = await invoice('INV-2026-001', clients.tata, proj1, 5000000, 900000, '2026-03-05', '2026-12-31', 'partially_paid');
  await invoice('INV-2026-002', clients.adani, proj2, 8000000, 1440000, '2026-04-10', '2026-06-30', 'sent');
  await invoice('INV-2026-003', clients.reliance, proj1, 1200000, 216000, '2026-05-02', '2026-04-25', 'overdue');

  // ── Payments (vendor + employee → debit ledgers) ─────────────────────────────
  async function payment({ ref, amount, date, vendor, employee, project, site, category, comment, remark, mode = 'neft' }) {
    const pay = await one(
      `INSERT INTO payments (reference_id, amount, payment_date, beneficiary_name, account_details, bank_remarks, comment,
        payment_mode, network_type, project_id, site_id, vendor_id, employee_id, category_id, invoice_status, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::payment_mode,$9,$10,$11,$12,$13,$14,'attached','manual',$15) RETURNING *`,
      [ref, amount, date, (vendor?.name || employee?.name), vendor?.bank_account || null, remark, comment,
       mode, mode.toUpperCase(), project?.id || null, site?.id || null, vendor?.id || null, employee?.id || null, category, userId]
    );
    const partyType = employee ? 'employee' : 'vendor';
    const partyId = employee?.id || vendor?.id;
    if (partyId) {
      await postLedgerEntry(db, {
        partyType, partyId, direction: 'debit', amount, entryDate: date, description: comment,
        projectId: project?.id || null, siteId: site?.id || null, sourceType: 'payment', sourceId: pay.id, userId,
      });
    }
    return pay;
  }
  await payment({ ref: 'HDFCN26021501', amount: 1250000, date: '2026-02-15', vendor: vendors.steel, project: proj1, site: site1, category: cat('Steel'), comment: 'Advance for 2 ton steel — Phase 4', remark: 'NEFT to Steelworks India', mode: 'rtgs' });
  await payment({ ref: 'ICICR26030801', amount: 800000, date: '2026-03-08', vendor: vendors.panel, project: proj1, category: cat('Solar Panels'), comment: 'Panel procurement milestone 1', remark: 'RTGS panel vendor', mode: 'rtgs' });
  await payment({ ref: 'SBIN26032201', amount: 150000, date: '2026-03-22', vendor: vendors.transport, project: proj2, category: cat('Transport'), comment: 'Transport for panel dispatch', remark: 'Transport charges' });
  await payment({ ref: 'AXISN26041201', amount: 420000, date: '2026-04-12', vendor: vendors.electrical, project: proj2, category: cat('Electrical'), comment: 'Cabling & ACDB supply', remark: 'Electrical supply' });
  await payment({ ref: 'HDFCN26042001', amount: 95000, date: '2026-04-20', vendor: vendors.steel, project: proj1, category: cat('Steel'), comment: 'Mounting structure balance', remark: 'Steel balance' });
  await payment({ ref: 'UPIEMP260501', amount: 35000, date: '2026-05-01', employee: employees.ramesh, project: proj1, category: cat('Labour'), comment: 'Site supervisor salary — April', remark: 'Salary April' });
  await payment({ ref: 'UPIEMP260502', amount: 45000, date: '2026-05-02', employee: employees.anita, category: cat('Miscellaneous'), comment: 'Accountant salary — April', remark: 'Salary April' });

  // ── Receipts (client → credit ledger + settle invoice) ───────────────────────
  async function receipt({ ref, amount, date, client, project, invoiceId, tds = 0, retention = 0, comment }) {
    const r = await one(
      `INSERT INTO receipts (reference_id, credited_amount, credited_date, client_id, invoice_id, project_id, tds_amount, retention_amount, comment, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10) RETURNING *`,
      [ref, amount, date, client.id, invoiceId || null, project?.id || null, tds, retention, comment, userId]
    );
    const settled = Number(amount) + Number(tds) + Number(retention);
    await postLedgerEntry(db, {
      partyType: 'client', partyId: client.id, direction: 'credit', amount: settled, entryDate: date,
      description: comment, projectId: project?.id || null, sourceType: 'receipt', sourceId: r.id, userId,
    });
    if (invoiceId) await refreshInvoiceStatus(db, invoiceId);
    return r;
  }
  await receipt({ ref: 'TATA26042501', amount: 4000000, date: '2026-04-25', client: clients.tata, project: proj1, invoiceId: inv1.id, tds: 100000, retention: 200000, comment: 'Milestone 1 from Tata Power' });
  await receipt({ ref: 'ADANI26051001', amount: 2500000, date: '2026-05-10', client: clients.adani, project: proj2, comment: 'Advance against GEDA project' });

  // ── A quotation ──────────────────────────────────────────────────────────────
  const calc = calculateQuote({ capacity_kw: 100, project_type: 'commercial' });
  await db.query(
    `INSERT INTO quotes (quote_number, version, status, client_id, client_name, project_name, project_type, capacity_kw,
       location, issue_date, valid_until, inputs, line_items, subtotal, contingency_amount, margin_amount, taxable_amount,
       gst_amount, total_amount, cost_amount, per_watt, subsidy_amount, net_cost, annual_savings, payback_years, lifetime_savings, created_by)
     VALUES ('QT-2026-0001',1,'sent',$1,$2,'Reliance Office Rooftop','commercial',100,'Mumbai','2026-05-15','2026-07-15',
       $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [clients.reliance.id, clients.reliance.name, JSON.stringify(calc.inputs), JSON.stringify(calc.line_items),
     calc.subtotal, calc.contingency_amount, calc.margin_amount, calc.taxable_amount, calc.gst_amount, calc.total_amount,
     calc.cost_amount, calc.per_watt, calc.subsidy_amount, calc.net_cost, calc.annual_savings, calc.payback_years, calc.lifetime_savings, userId]
  );

  return {
    clients: 3, vendors: 4, employees: 2, projects: 2, invoices: 3, payments: 7, receipts: 2, quotes: 1,
  };
}
