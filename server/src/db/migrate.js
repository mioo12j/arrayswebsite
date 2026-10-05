// Applies schema.sql to the configured database. Useful when `psql` is not
// installed. Run with: npm run migrate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  // Enum values must be added OUTSIDE a transaction (and schema.sql runs as one),
  // so add it first. Ignored if the type doesn't exist yet (fresh DB) — schema.sql
  // then creates the type already including 'employee'.
  try {
    await pool.query("ALTER TYPE ledger_party ADD VALUE IF NOT EXISTS 'employee'");
  } catch {
    /* type not created yet — schema.sql creates it with 'employee' included */
  }
  try {
    await pool.query("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'editor'");
  } catch {
    /* type not created yet — schema.sql creates it with 'editor' included */
  }
  try {
    await pool.query("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'auditor'");
  } catch {
    /* type not created yet — schema.sql creates it with 'auditor' included */
  }
  // Standard-invoice statuses (§2): Draft / Issued / Cancelled — added to the
  // existing richer enum (kept for backward compatibility).
  for (const v of ['issued', 'cancelled']) {
    try { await pool.query(`ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS '${v}'`); } catch { /* created fresh below */ }
  }

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // eslint-disable-next-line no-console
  console.log('[migrate] Applying schema.sql ...');
  await pool.query(sql);

  // GST compliance module schema (separate file; depends on users + invoices).
  const gstSql = fs.readFileSync(path.join(__dirname, 'gst-schema.sql'), 'utf8');
  // eslint-disable-next-line no-console
  console.log('[migrate] Applying gst-schema.sql ...');
  await pool.query(gstSql);

  // eslint-disable-next-line no-console
  console.log('[migrate] Done.');
  await pool.end();
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] Failed:', err.message);
  process.exit(1);
});
