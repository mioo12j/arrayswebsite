// ============================================================================
//  #7 Health Check & Diagnostics Center.
//  Read-only probes of every subsystem so the team can tell whether a problem
//  is internal, configuration, data, or the portal.
// ============================================================================

import fs from 'node:fs';
import { getMode } from './adapter.js';
import { isValidGstin } from './validation.js';
import { buildEInvoicePayload } from './einvoiceBuilder.js';
import { REPORTS } from './reportService.js';
import { entityMeta } from './importService.js';
import { UPLOAD_ROOT } from '../../middleware/upload.js';
import { BACKUP_DIR } from './backupService.js';

const H = (label, status, detail, recommendation) => ({ label, status, detail, recommendation: recommendation || null });

export async function run(db) {
  const checks = [];

  // Database
  try { const t0 = Date.now(); await db.query('SELECT 1'); checks.push(H('Database connectivity', 'healthy', `Responded in ${Date.now() - t0} ms`)); }
  catch (e) { checks.push(H('Database connectivity', 'failed', e.message, 'Ensure PostgreSQL service is running and credentials in server/.env are correct.')); }

  // Storage (uploads writable)
  try { fs.accessSync(UPLOAD_ROOT, fs.constants.W_OK); const n = fs.readdirSync(UPLOAD_ROOT).length; checks.push(H('Storage (uploads)', 'healthy', `${UPLOAD_ROOT} writable, ${n} files`)); }
  catch { checks.push(H('Storage (uploads)', 'failed', 'Uploads directory is not writable.', 'Check folder permissions / disk space.')); }

  // Backup service
  try {
    const last = (await db.query('SELECT started_at, status FROM gst_backups ORDER BY started_at DESC LIMIT 1')).rows[0];
    const dirOk = fs.existsSync(BACKUP_DIR);
    if (!last) checks.push(H('Backup service', 'warning', 'No backup has ever been taken.', 'Take a backup from Backup & Recovery.'));
    else {
      const ageH = (Date.now() - new Date(last.started_at).getTime()) / 3.6e6;
      checks.push(H('Backup service', ageH > 24 * 7 ? 'warning' : 'healthy', `Last backup ${ageH.toFixed(0)}h ago (${last.status}); dir ${dirOk ? 'present' : 'missing'}`, ageH > 24 * 7 ? 'Backups are overdue — run one now.' : null));
    }
  } catch (e) { checks.push(H('Backup service', 'failed', e.message)); }

  // Scheduler
  try { const r = (await db.query("SELECT count(*) FILTER (WHERE is_active) active, count(*) total FROM gst_scheduled_reports")).rows[0]; checks.push(H('Scheduler', 'healthy', `${r.active}/${r.total} active schedules`)); }
  catch (e) { checks.push(H('Scheduler', 'failed', e.message)); }

  // Adapter
  const mode = getMode();
  if (mode === 'live' && !process.env.GST_CLIENT_ID) checks.push(H('IRP / EWB adapter', 'failed', 'Live mode but no GSP credentials.', 'Set credentials or switch GST_MODE=simulation.'));
  else checks.push(H('IRP / EWB adapter', 'healthy', `Adapter in ${mode} mode`));

  // Email service (not wired in simulation)
  checks.push(H('Email service', process.env.GST_SMTP_HOST ? 'healthy' : 'warning', process.env.GST_SMTP_HOST ? 'SMTP configured' : 'No SMTP configured — codes are shown on screen (simulation).', process.env.GST_SMTP_HOST ? null : 'Configure SMTP to deliver verification codes & reports by email in production.'));

  // GST validation engine
  try { const ok = isValidGstin('27AAPFU0939F1ZV') && !isValidGstin('27AAPFU0939F1ZZ'); checks.push(H('GST validation engine', ok ? 'healthy' : 'failed', ok ? 'Checksum logic verified' : 'Checksum logic mismatch')); }
  catch (e) { checks.push(H('GST validation engine', 'failed', e.message)); }

  // PDF engine
  try { const m = await import('pdfkit'); await import('qrcode'); checks.push(H('PDF engine', m ? 'healthy' : 'warning', 'pdfkit + qrcode loaded')); }
  catch (e) { checks.push(H('PDF engine', 'failed', e.message, 'Run npm install in server/.')); }

  // JSON builder
  try { const p = buildEInvoicePayload({ supplyType: 'B2B', docType: 'INV', docNo: 'T/1', items: [], val: {} }); checks.push(H('e-Invoice builder', p.Version === '1.1' ? 'healthy' : 'warning', `Schema v${p.Version}`)); }
  catch (e) { checks.push(H('e-Invoice builder', 'failed', e.message)); }

  // Import engine
  checks.push(H('Import engine', 'healthy', `${entityMeta().length} importable entity type(s)`));

  // Reporting engine
  checks.push(H('Reporting engine', 'healthy', `${Object.keys(REPORTS).length} reports available`));

  const summary = {
    healthy: checks.filter((c) => c.status === 'healthy').length,
    warning: checks.filter((c) => c.status === 'warning').length,
    failed: checks.filter((c) => c.status === 'failed').length,
  };
  summary.overall = summary.failed ? 'failed' : summary.warning ? 'warning' : 'healthy';
  return { lastCheck: new Date().toISOString(), mode, summary, checks };
}

export async function rows(db) {
  const r = await run(db);
  return r.checks.map((c) => ({ Subsystem: c.label, Status: c.status, Detail: c.detail, Recommendation: c.recommendation || '' }));
}
