// =============================================================================
//  One-off maintenance: backfill branch_id on GST e-invoices from the SELECTED
//  BILLING OFFICE — i.e. the seller GSTIN recorded on the document — which is
//  the real source of truth (not the typed document-number prefix).
//
//  Why: earlier, creating an e-invoice did not bind the selected office, so
//  branch_id fell back to the default (UP) branch — the code shown in the list
//  badge. The office actually used is captured in seller_dtls.gstin, so we map
//  that GSTIN back to its branch and restore branch_id. This also catches a
//  document that was billed from one office but mis-typed with another office's
//  number prefix (e.g. a Bihar bill numbered UP/03).
//
//  Safe: only updates when the seller GSTIN maps to a KNOWN branch and the
//  current branch_id differs; never touches deleted rows. Dry-run by default —
//  pass --apply to write.
//
//  Usage:  node src/db/backfill-einvoice-branch.js          (dry run, reports)
//          node src/db/backfill-einvoice-branch.js --apply  (writes changes)
// =============================================================================
import { pool } from '../config/db.js';

const APPLY = process.argv.includes('--apply');

async function run() {
  const { rows: branches } = await pool.query('SELECT id, code, gstin FROM gst_branches');
  console.log(`Branches: ${branches.map((b) => `${b.code}(${b.gstin || 'no gstin'})`).join(', ') || '(none)'}\n`);

  // Candidate rows: not deleted, whose seller GSTIN maps to a known branch that
  // is not the one currently recorded.
  const SEL = `
      e.id, e.doc_no, e.seller_dtls->>'gstin' AS seller_gstin,
      cur.code AS cur_code, tgt.id AS tgt_branch, tgt.code AS tgt_code
    FROM gst_einvoices e
    LEFT JOIN gst_branches cur ON cur.id = e.branch_id
    JOIN gst_branches tgt ON upper(tgt.gstin) = upper(e.seller_dtls->>'gstin')
   WHERE e.is_deleted = FALSE
     AND coalesce(e.seller_dtls->>'gstin','') <> ''
     AND (e.branch_id IS NULL OR e.branch_id <> tgt.id)`;

  const { rows } = await pool.query(`SELECT ${SEL} ORDER BY e.doc_no`, []);
  console.log(`gst_einvoices: ${rows.length} row(s) to correct (branch ≠ selected office)`);
  rows.forEach((r) => console.log(`   ${String(r.doc_no).padEnd(15)} ${r.cur_code || 'none'} → ${r.tgt_code}   (office GSTIN ${r.seller_gstin})`));

  if (APPLY && rows.length) {
    const res = await pool.query(
      `UPDATE gst_einvoices e SET branch_id = tgt.id
         FROM gst_branches tgt
        WHERE upper(tgt.gstin) = upper(e.seller_dtls->>'gstin')
          AND e.is_deleted = FALSE
          AND coalesce(e.seller_dtls->>'gstin','') <> ''
          AND (e.branch_id IS NULL OR e.branch_id <> tgt.id)`,
      []
    );
    console.log(`\n✔ updated ${res.rowCount} row(s).`);
  } else {
    console.log(`\nDry run — re-run with --apply to write.`);
  }
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
