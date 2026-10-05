// =============================================================================
//  Idempotent schema top-up — adds columns introduced after the initial
//  gst-schema.sql without touching data. Safe to run any number of times and on
//  any machine (each statement is ADD COLUMN IF NOT EXISTS). Run after `git pull`
//  when updating an existing database:  npm run migrate:cols
// =============================================================================
import { pool } from '../config/db.js';

const STATEMENTS = [
  // Buyer purchase-order reference + delivery/site address (branded PDF only).
  `ALTER TABLE gst_einvoices ADD COLUMN IF NOT EXISTS po_no TEXT`,
  `ALTER TABLE gst_einvoices ADD COLUMN IF NOT EXISTS po_date DATE`,
  `ALTER TABLE gst_einvoices ADD COLUMN IF NOT EXISTS site_address TEXT`,
  // A credit note's link back to its original tax invoice (this table).
  `ALTER TABLE gst_einvoices ADD COLUMN IF NOT EXISTS credit_note_source_einvoice_id UUID REFERENCES gst_einvoices(id)`,
];

async function run() {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log('✔', sql);
  }
  console.log('\nSchema is up to date.');
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
