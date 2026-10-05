// ============================================================================
//  §8 Automatic Backup Engine — silent, background, full-system backups.
//  Runs every AUTO_BACKUP_HOURS (default 2h), keeps the latest AUTO_BACKUP_KEEP
//  (default 30) auto-backups and rotates older ones. Manual backups are never
//  rotated here. Reuses the full-system backupService (every table + files).
// ============================================================================
import fs from 'node:fs';
import { pool, withTransaction } from '../../config/db.js';
import * as backups from './backupService.js';

const HOURS = Number(process.env.AUTO_BACKUP_HOURS || 2);
const KEEP = Math.max(30, Number(process.env.AUTO_BACKUP_KEEP || 30));
let timer = null;

export async function runAutoBackup() {
  try {
    const b = await withTransaction((db) => backups.create(db, { kind: 'auto' }, null));
    // Count-based rotation: keep only the latest KEEP auto-backups.
    const { rows } = await pool.query(
      "SELECT id, file_path FROM gst_backups WHERE kind='auto' ORDER BY started_at DESC OFFSET $1", [KEEP]);
    for (const old of rows) {
      try { if (old.file_path && fs.existsSync(old.file_path)) fs.unlinkSync(old.file_path); } catch { /* ignore */ }
      await pool.query('DELETE FROM gst_backups WHERE id=$1', [old.id]);
    }
    // eslint-disable-next-line no-console
    console.log(`[auto-backup] ${b.totalRecords} records, ${b.file_count} files (kept latest ${KEEP}${rows.length ? `, rotated ${rows.length}` : ''})`);
    return b;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[auto-backup] failed:', e.message);
    return null;
  }
}

export function startAutoBackup() {
  if (timer || String(process.env.AUTO_BACKUP || 'on').toLowerCase() === 'off') return;
  const ms = HOURS * 3600 * 1000;
  timer = setInterval(runAutoBackup, ms);
  if (timer.unref) timer.unref(); // don't keep the process alive just for backups
  // First backup shortly after boot only if none exists today (avoids spamming on restarts).
  backups.hasTodayBackup(pool).then((has) => { if (!has) setTimeout(runAutoBackup, 60_000); }).catch(() => {});
  // eslint-disable-next-line no-console
  console.log(`[auto-backup] scheduled every ${HOURS}h (keep ${KEEP})`);
}
