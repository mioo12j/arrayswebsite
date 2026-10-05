// ============================================================================
//  Proof Archiver — storage housekeeping.
//  Proof / statement files older than ARCHIVE_AFTER_DAYS (default 30) are moved
//  out of the loose uploads folder into ONE monthly zip (archives/proofs-YYYY-
//  MM.zip) and the loose copy is deleted. The document endpoint still opens them
//  transparently — it reads the entry straight from the zip. This keeps the
//  uploads folder small without ever losing a proof.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { pool } from '../config/db.js';
import { UPLOAD_ROOT } from '../middleware/upload.js';

const AFTER_DAYS = Math.max(7, Number(process.env.ARCHIVE_AFTER_DAYS || 30));
const ARCHIVE_DIR = path.join(UPLOAD_ROOT, 'archives');
const KINDS = ['payment_proof', 'receipt_proof', 'bank_statement'];
let timer = null;

const monthKey = (d) => new Date(d).toISOString().slice(0, 7); // YYYY-MM

/** Move eligible loose proof files into monthly zips; delete the loose copies. */
export async function runProofArchive() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    const { rows } = await pool.query(
      `SELECT id, stored_name, kind, created_at FROM documents
        WHERE kind = ANY($1) AND archived_zip IS NULL
          AND created_at < now() - ($2 || ' days')::interval`,
      [KINDS, AFTER_DAYS]
    );
    let archived = 0;
    const byMonth = new Map();
    for (const d of rows) {
      const key = monthKey(d.created_at);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(d);
    }
    for (const [key, docs] of byMonth) {
      const zipPath = path.join(ARCHIVE_DIR, `proofs-${key}.zip`);
      const zip = fs.existsSync(zipPath) ? new AdmZip(zipPath) : new AdmZip();
      let touched = false;
      for (const d of docs) {
        const loose = path.join(UPLOAD_ROOT, d.stored_name);
        if (!fs.existsSync(loose)) {
          // File already gone — just mark it archived so we stop re-checking it.
          await pool.query('UPDATE documents SET archived_zip=$1 WHERE id=$2', [zipPath, d.id]);
          continue;
        }
        if (!zip.getEntry(d.stored_name)) zip.addLocalFile(loose, '', d.stored_name);
        touched = true;
      }
      if (touched) zip.writeZip(zipPath);
      // Only delete the loose files AFTER the zip is safely written.
      for (const d of docs) {
        const loose = path.join(UPLOAD_ROOT, d.stored_name);
        try { if (fs.existsSync(loose) && (fs.existsSync(zipPath) && new AdmZip(zipPath).getEntry(d.stored_name))) fs.unlinkSync(loose); } catch { /* ignore */ }
        await pool.query('UPDATE documents SET archived_zip=$1 WHERE id=$2', [zipPath, d.id]);
        archived++;
      }
    }
    if (archived) console.log(`[proof-archive] archived ${archived} file(s) into ${byMonth.size} monthly zip(s)`); // eslint-disable-line no-console
    return { archived, months: byMonth.size };
  } catch (e) {
    console.error('[proof-archive] failed:', e.message); // eslint-disable-line no-console
    return { archived: 0, error: e.message };
  }
}

/** Read an archived document's bytes from its monthly zip (or null). */
export function readArchivedBuffer(doc) {
  try {
    if (!doc?.archived_zip || !fs.existsSync(doc.archived_zip)) return null;
    const entry = new AdmZip(doc.archived_zip).getEntry(doc.stored_name);
    return entry ? entry.getData() : null;
  } catch { return null; }
}

export function startProofArchive() {
  if (timer || String(process.env.PROOF_ARCHIVE || 'on').toLowerCase() === 'off') return;
  timer = setInterval(runProofArchive, 24 * 3600 * 1000); // daily
  if (timer.unref) timer.unref();
  setTimeout(runProofArchive, 60 * 1000); // once, a minute after boot
  console.log(`[proof-archive] scheduled daily (archive proofs older than ${AFTER_DAYS} days)`); // eslint-disable-line no-console
}
