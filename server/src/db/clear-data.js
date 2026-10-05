// Wipes ALL operational data (core ERP + GST e-Invoice/e-Way Bill + Delivery
// Challan modules) so the app starts empty for real use, while KEEPING:
//   • login users            • expense_categories (reference list)
//   • app_config (branding/settings)   • gst_master_data (states, UQC, challan types/reasons)
//   • gst_branches + gst_number_series (your branch & numbering SETUP — counters reset to 1)
//   • gst_backups (so a pre-clear backup stays restorable)
// Run with: npm run clear
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Core ERP operational tables.
const CORE = [
  'audit_logs', 'ledger_entries', 'payments', 'receipts', 'invoices',
  'bank_statement_lines', 'bank_statements', 'vendor_accounts', 'vendors',
  'employees', 'clients', 'sites', 'projects', 'quotes',
  'vault_document_versions', 'vault_documents', 'materials', 'shipments',
  'geo_verifications', 'documents',
];

// GST compliance documents + logs (keep master data / branches / series / backups).
const GST = [
  'gst_einvoices', 'gst_eway_bills', 'gst_api_logs', 'gst_audit_events',
  'gst_access_logs', 'gst_recon_resolutions', 'gst_notifications',
  'gst_attachments', 'gst_gstin_validations', 'gst_otp_challenges',
  'gst_versions', 'gst_comments', 'gst_comment_reads', 'gst_saved_views',
  'gst_imports', 'gst_report_runs',
];

// Delivery challan module.
const CHALLANS = [
  'delivery_challan_returns', 'delivery_challan_status_history',
  'delivery_challan_items', 'delivery_challans',
];

const ALL = [...CORE, ...GST, ...CHALLANS];

// Only truncate tables that actually exist (future-proof across schema versions).
async function existing(tables) {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
    [tables]);
  const present = new Set(rows.map((r) => r.table_name));
  return tables.filter((t) => present.has(t));
}

async function clear() {
  const tables = await existing(ALL);
  // eslint-disable-next-line no-console
  console.log(`[clear] Truncating ${tables.length} data tables (keeping users, config, branches, numbering, master data, backups) ...`);
  await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

  // Reset every number series so the first real document is #1 (keeps the format).
  try { await pool.query('UPDATE gst_number_series SET next_number = 1'); } catch { /* table may not exist */ }

  // Remove uploaded files from local storage (keep the folder + .gitkeep).
  const uploadDir = path.resolve(__dirname, '../../uploads');
  if (fs.existsSync(uploadDir)) {
    for (const f of fs.readdirSync(uploadDir)) {
      if (f === '.gitkeep') continue;
      try { fs.rmSync(path.join(uploadDir, f), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  // eslint-disable-next-line no-console
  console.log('[clear] Done. All operational data removed; logins, branding, branches, numbering & backups preserved.');
  await pool.end();
}

clear().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[clear] Failed:', err.message);
  process.exit(1);
});
