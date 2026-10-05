import { Router } from 'express';
import { withTransaction, pool } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { editorOnly } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';
import { clearAllData, seedDemo } from '../services/system.service.js';
import { runSyncNow, autoSyncStatus } from '../services/autoSync.js';
import { getStatus, startSelfUpdate } from '../services/updateService.js';
import * as backups from '../services/gst/backupService.js';

const router = Router();
router.use(authenticate); // all routes require login

// Destructive tools (clear / demo) are editor-only.
router.post(
  '/clear-data',
  editorOnly,
  asyncHandler(async (req, res) => {
    await withTransaction((db) => clearAllData(db));
    await audit(req, { action: 'delete', entity: 'system', changes: { cleared: true } });
    res.json({ ok: true, message: 'All operational data cleared.' });
  })
);

// Load a realistic demo dataset (clears first, then seeds) — editor-only.
router.post(
  '/seed-demo',
  editorOnly,
  asyncHandler(async (req, res) => {
    const summary = await withTransaction((db) => seedDemo(db, req.user.id));
    await audit(req, { action: 'create', entity: 'system', changes: { demo: summary } });
    res.json({ ok: true, ...summary });
  })
);

// Whether cloud publishing is configured + the last auto/manual publish result.
router.get('/cloud-status', (_req, res) => {
  res.json({ configured: !!process.env.CLOUD_DATABASE_URL, ...autoSyncStatus() });
});

// Publish local data (rows only — not files) to the cloud database. Shares the
// same code path as the automatic background publish, so the "last synced"
// stamp on the dashboard is always accurate.
router.post(
  '/sync-to-cloud',
  asyncHandler(async (req, res) => {
    if (!process.env.CLOUD_DATABASE_URL) {
      throw new ApiError(400, 'CLOUD_DATABASE_URL is not configured on this computer. Set it in server/.env, then restart the app.');
    }
    const result = await runSyncNow();
    if (result?.ok === false) throw new ApiError(502, `Publish failed: ${result.error || 'unknown error'}`);
    await audit(req, { action: 'create', entity: 'system', changes: { published: result?.total ?? 0 } });
    res.json({ ok: true, total: result?.total ?? 0, at: result?.at });
  })
);

// Download EVERY table's data as one JSON file — data only, no proof/attachment
// files. Same data that Publish to Cloud mirrors; a portable lightweight snapshot.
router.get(
  '/export-data',
  asyncHandler(async (req, res) => {
    if (['admin', 'auditor'].includes(req.user.role)) throw new ApiError(403, 'Exporting data is reserved for the operator/editor.');
    const dump = await backups.exportData(pool);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="AIPL-data-${stamp}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  })
);

// Mandatory flush before sign-out — publishes everything synchronously so the
// operator can never leave un-synced local data behind. No-op if not configured.
router.post(
  '/flush-on-exit',
  asyncHandler(async (_req, res) => {
    const result = await runSyncNow();
    res.json({ ok: true, ...result });
  })
);

// ── Software updates (git-based, code only) ─────────────────────────────────
// Anyone signed in can check the version; applying is for the System Manager or
// Editor (not the view-only admin/auditor).
router.get('/update/status', asyncHandler(async (_req, res) => res.json(await getStatus())));

router.post(
  '/update/apply',
  asyncHandler(async (req, res) => {
    if (['admin', 'auditor'].includes(req.user.role)) {
      throw new ApiError(403, 'Updating the software is reserved for the System Manager or Editor.');
    }
    const status = await getStatus();
    if (!status.ok) throw new ApiError(400, status.message || 'Updates are not available on this machine.');
    if (!status.behind) return res.json({ ok: true, started: false, message: 'Already on the latest version.' });

    // Always take a safety backup before touching the code. Abort if it fails.
    try {
      await withTransaction((db) => backups.create(db, { kind: 'pre-update' }, req.user.id));
    } catch (e) {
      throw new ApiError(500, `Backup before update failed — update aborted for safety. ${e.message}`);
    }
    await audit(req, { action: 'update', entity: 'system', changes: { selfUpdate: { from: status.currentShort, to: status.latestShort } } });
    startSelfUpdate();
    res.json({ ok: true, started: true, from: status.currentShort, to: status.latestShort });
  })
);

export default router;
