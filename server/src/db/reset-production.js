// ============================================================================
//  §10 Production Reset — fresh, production-ready environment.
//  PRESERVES:  users, app_config, gst_master_data, gst_branches (offices),
//              gst_number_series, gst_backups, vendors, vendor_accounts,
//              expense_categories.
//  DELETES:    invoices, e-invoices, e-way bills, delivery challans, payments,
//              receipts, ledger, bank statements, quotes, clients, employees,
//              projects, sites, documents, logs, drafts, notifications.
//  Safety: takes a FULL backup first, then wipes. Run: npm run reset-production
// ============================================================================
import { pool, withTransaction } from '../config/db.js';
import * as backups from './../services/gst/backupService.js';

// Everything operational EXCEPT the preserved masters above.
const WIPE = [
  // core ERP transactions / parties (vendors preserved, NOT listed here)
  'audit_logs', 'ledger_entries', 'payments', 'receipts', 'invoices',
  'bank_statement_lines', 'bank_statements', 'quotes',
  'vault_document_versions', 'vault_documents', 'materials', 'shipments',
  'geo_verifications', 'documents', 'sites', 'projects', 'employees', 'clients',
  // GST documents + logs (master data / branches / series / backups preserved)
  'gst_einvoices', 'gst_eway_bills', 'gst_api_logs', 'gst_audit_events',
  'gst_access_logs', 'gst_recon_resolutions', 'gst_notifications',
  'gst_attachments', 'gst_gstin_validations', 'gst_otp_challenges',
  'gst_versions', 'gst_comments', 'gst_comment_reads', 'gst_saved_views',
  'gst_imports', 'gst_report_runs',
  // delivery challan module
  'delivery_challan_returns', 'delivery_challan_status_history',
  'delivery_challan_items', 'delivery_challans',
];

async function existing(tables) {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`, [tables]);
  return tables.filter((t) => rows.some((r) => r.table_name === t));
}

async function run() {
  // 1) Safety backup of the full system before wiping anything.
  // eslint-disable-next-line no-console
  console.log('[reset] Taking a safety backup first...');
  const b = await withTransaction((db) => backups.create(db, { kind: 'manual' }, null));
  console.log(`[reset] Backup saved: ${b.totalRecords} records, ${b.file_count} files (restorable).`);

  // 2) Wipe transactional data, preserve masters + vendors.
  const tables = await existing(WIPE);
  console.log(`[reset] Wiping ${tables.length} transactional tables...`);
  await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

  // 3) Reset numbering so the first real document is #1.
  try { await pool.query('UPDATE gst_number_series SET next_number = 1'); } catch { /* ignore */ }

  const c = async (t) => { try { return Number((await pool.query(`SELECT count(*) c FROM ${t}`)).rows[0].c); } catch { return 'n/a'; } };
  console.log('[reset] PRESERVED →', JSON.stringify({
    users: await c('users'), offices_branches: await c('gst_branches'),
    vendors: await c('vendors'), vendor_accounts: await c('vendor_accounts'),
    gst_master_data: await c('gst_master_data'),
  }));
  console.log('[reset] Done — fresh production-ready environment.');
  await pool.end();
}

run().catch((e) => { console.error('[reset] Failed:', e.message); process.exit(1); });
