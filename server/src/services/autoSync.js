// ============================================================================
//  Automatic Cloud Publish
//  Keeps the cloud database continuously up to date without the operator having
//  to remember to click "Publish to Cloud":
//    • after any data change, a debounced background publish is scheduled;
//    • sign-out triggers a mandatory flush (runSyncNow) so nothing is left local;
//    • the manual button still works and shares the same code path.
//  All of it is a no-op when CLOUD_DATABASE_URL isn't configured on this machine.
// ============================================================================
import { pool } from '../config/db.js';
import { syncToCloud } from './sync.service.js';

const DEBOUNCE_MS = 20_000;   // coalesce a burst of edits into one publish
let timer = null;
let running = false;
let pending = false;          // a change arrived while a publish was running
let lastResult = null;

export function cloudConfigured() {
  return !!process.env.CLOUD_DATABASE_URL;
}

async function recordResult(counts, ok, error) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  lastResult = { at: new Date().toISOString(), total, ok, error: error || null };
  try {
    await pool.query(
      `INSERT INTO app_config (key, value) VALUES ('last_cloud_sync', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(lastResult)]
    );
  } catch { /* app_config may be mid-migration — ignore */ }
  return lastResult;
}

/** Run a full publish now and record the result. Safe to await. */
export async function runSyncNow() {
  if (!cloudConfigured()) return { skipped: true, reason: 'not_configured' };
  if (running) { pending = true; return { skipped: true, reason: 'already_running' }; }
  running = true;
  try {
    const counts = await syncToCloud(pool, process.env.CLOUD_DATABASE_URL);
    return await recordResult(counts, true);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[auto-sync] publish failed:', e.message);
    return await recordResult(null, false, e.message);
  } finally {
    running = false;
    if (pending) { pending = false; scheduleAutoSync(); }   // re-run for edits made mid-publish
  }
}

/** Debounced background publish — call after any successful data change. */
export function scheduleAutoSync() {
  if (!cloudConfigured()) return;
  if (running) { pending = true; return; }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; runSyncNow(); }, DEBOUNCE_MS);
}

export function autoSyncStatus() {
  return { configured: cloudConfigured(), running, last: lastResult };
}

// Express middleware: after a successful data mutation, schedule an auto-publish.
// Skips auth/system/reporting reads and anything that isn't a 2xx write.
export function autoSyncOnWrite(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const p = req.path || '';
  // Don't loop on the sync endpoints themselves, and skip auth.
  if (p.startsWith('/auth') || p.includes('sync-to-cloud') || p.includes('flush')) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) scheduleAutoSync();
  });
  next();
}
