// ============================================================================
//  Recovery retention — permanently removes records that have been sitting in
//  the System Recovery Center (soft-deleted) for longer than the retention
//  window (default 30 days). Runs once a day in the background. After purge a
//  record is gone for good (only a full backup can bring it back).
// ============================================================================
import { pool } from '../../config/db.js';

const DAYS = Math.max(1, Number(process.env.RECOVERY_RETENTION_DAYS || 30));
// Parent tables only — child rows (items) cascade via their FK ON DELETE.
const TABLES = ['gst_einvoices', 'gst_eway_bills', 'delivery_challans', 'invoices', 'payments', 'receipts', 'projects'];
let timer = null;

export async function runRecoveryPurge() {
  let total = 0;
  for (const t of TABLES) {
    try {
      const r = await pool.query(
        `DELETE FROM ${t} WHERE is_deleted=TRUE AND deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => $1)`,
        [DAYS]);
      total += r.rowCount || 0;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[recovery-purge] ${t} failed:`, e.message);
    }
  }
  // eslint-disable-next-line no-console
  if (total) console.log(`[recovery-purge] permanently removed ${total} record(s) older than ${DAYS} days`);
  return total;
}

export function startRecoveryPurge() {
  if (timer || String(process.env.RECOVERY_PURGE || 'on').toLowerCase() === 'off') return;
  timer = setInterval(runRecoveryPurge, 24 * 3600 * 1000);
  if (timer.unref) timer.unref();
  setTimeout(runRecoveryPurge, 120_000);   // a first sweep ~2 min after boot
  // eslint-disable-next-line no-console
  console.log(`[recovery-purge] scheduled daily (retention ${DAYS} days)`);
}
