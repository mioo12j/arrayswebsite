// ============================================================================
//  GST Compliance routes — e-Invoice + e-Way Bill (separate objects),
//  dashboard, reports, exports. RBAC + maker-checker via requirePerm.
//  Every portal action goes through the services → adapter (sim/live).
// ============================================================================

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { withTransaction, pool } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { editorOnly } from '../middleware/rbac.js';
import { requirePerm, PERMS, permsForRole } from '../services/gst/permissions.js';
import * as einv from '../services/gst/einvoiceService.js';
import * as ewb from '../services/gst/ewbService.js';
import * as reports from '../services/gst/reportService.js';
import * as recon from '../services/gst/reconService.js';
import * as notify from '../services/gst/notifyService.js';
import * as monitor from '../services/gst/monitorService.js';
import * as branchSvc from '../services/gst/branchService.js';
import * as seriesSvc from '../services/gst/seriesService.js';
import * as gstinVal from '../services/gst/gstinValidationService.js';
import * as duplicates from '../services/gst/duplicateService.js';
import * as attachments from '../services/gst/attachmentService.js';
import * as otp from '../services/gst/otpService.js';
import * as backups from '../services/gst/backupService.js';
import * as schedules from '../services/gst/scheduleService.js';
import * as imports from '../services/gst/importService.js';
import * as diagnostics from '../services/gst/diagnosticsService.js';
import * as readiness from '../services/gst/readinessService.js';
import * as config from '../services/gst/configService.js';
import * as versions from '../services/gst/versionService.js';
import * as comments from '../services/gst/commentService.js';
import * as searchSvc from '../services/gst/searchService.js';
import * as views from '../services/gst/savedViewService.js';
import * as brandingSvc from '../services/gst/brandingService.js';
import * as feed from '../services/gst/feedService.js';
import * as challans from '../services/gst/challanService.js';
import * as invSvc from '../services/invoiceService.js';
import * as paymentSvc from '../services/paymentService.js';
import * as receiptSvc from '../services/receiptService.js';
import { challanPdf } from '../services/gst/challan-pdf.js';
import { streamExcel, streamPdf } from '../services/export.service.js';
import { upload, uploadBackup } from '../middleware/upload.js';
import { einvoicePdf, ewbPdf } from '../services/gst/pdf.js';
import { toCsv, toXlsx, exportContentType } from '../services/gst/exporter.js';
import { recordAccess } from '../services/gst/log.js';
import { company } from '../config/company.js';
import { loadMaster } from '../services/gst/masterData.js';
import { getMode } from '../services/gst/adapter.js';

const router = Router();
router.use(authenticate);

const tx = (fn) => withTransaction(fn);
const uid = (req) => req.user.id;
const idem = (req) => req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
const fileName = (s) => String(s || 'document').replace(/[^A-Za-z0-9._-]+/g, '_');
// Active branch context: explicit body/query wins, else the x-gst-branch header.
const branchCtx = (req) => {
  const b = req.body?.branchId || req.query.branch_id || req.headers['x-gst-branch'];
  return b && b !== 'all' ? b : null;
};
const withBranch = (req) => { const b = branchCtx(req); if (b) req.body = { ...req.body, branchId: b }; return req.body; };
const rangeText = (q) => (q.from && q.to ? `${q.from} to ${q.to}` : q.from ? `from ${q.from}` : q.to ? `up to ${q.to}` : 'All dates');

// ── Branches (multi-GSTIN) ─────────────────────────────────────────────────
router.get('/branches', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => res.json(await branchSvc.list(pool))));
router.post('/branches', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => branchSvc.create(db, req.body, uid(req))))));
router.patch('/branches/:id', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => branchSvc.update(db, req.params.id, req.body, uid(req))))));
router.post('/branches/:id/default', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => branchSvc.setDefault(db, req.params.id, uid(req))))));

// ── Invoice number series ──────────────────────────────────────────────────
router.get('/number-series', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  await branchSvc.ensureDefault(pool);
  await seriesSvc.ensureDefault(pool);
  res.json(await seriesSvc.list(pool, { branchId: branchCtx(req) }));
}));
router.post('/number-series', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => seriesSvc.create(db, req.body, uid(req))))));
router.patch('/number-series/:id', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => seriesSvc.update(db, req.params.id, req.body, uid(req))))));
router.delete('/number-series/:id', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => seriesSvc.remove(db, req.params.id, uid(req))))));
router.get('/number-series/preview', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json({ next: await seriesSvc.preview(pool, { branchId: branchCtx(req), docType: req.query.docType || 'INV', branchCode: req.query.branchCode || '' }) })));

// ── Who am I / permissions ─────────────────────────────────────────────────
router.get('/me/permissions', asyncHandler(async (req, res) => {
  res.json({
    role: req.user.role,
    permissions: permsForRole(req.user.role),
    mode: getMode(),
    maintenanceMode: await config.getMaintenanceMode(pool),
    hasTodayBackup: await (await import('../services/gst/backupService.js')).hasTodayBackup(pool),
  });
}));

// ── #9 Maintenance mode ────────────────────────────────────────────────────
router.get('/maintenance', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => res.json(await config.get(pool, 'maintenance_mode', { mode: 'normal' }))));
router.post('/maintenance', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  await tx((db) => otp.assertForAction(db, { token: req.body?.otpToken, action: 'maintenance_change', userId: uid(req) }));
  res.json(await tx((db) => config.setMaintenanceMode(db, req.body?.mode, req.body?.message, uid(req))));
}));

// ── §5 Integration & Environment Management Center ─────────────────────────
router.get('/integrations', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await config.getIntegrations(pool))));
router.post('/integrations', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  await tx((db) => otp.assertForAction(db, { token: req.body?.otpToken, action: 'config_change', userId: uid(req) }));
  res.json(await tx((db) => config.setIntegration(db, req.body?.type, req.body?.values || {}, uid(req))));
}));
router.post('/integrations/test-email', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await config.testEmail(pool))));
router.post('/integrations/test-gst', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await config.testGst(pool))));

// ── #11 Configuration export ───────────────────────────────────────────────
router.get('/config/export', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  await recordAccess(req, { action: 'export', detail: { report: 'configuration' } });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="system-configuration-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(await config.exportConfig(pool), null, 2));
}));

// ── Master data (dropdowns) ────────────────────────────────────────────────
router.get('/master', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => {
  const m = await loadMaster(pool, true);
  const out = {};
  for (const [cat, map] of Object.entries(m)) out[cat] = [...map.entries()].map(([code, name]) => ({ code, name }));
  res.json(out);
}));

// ── Dashboard + reports ────────────────────────────────────────────────────
router.get('/dashboard', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  res.json(await reports.dashboard(pool, branchCtx(req)));
}));

router.get('/reports/:type', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  const def = reports.REPORTS[req.params.type];
  if (!def) throw new ApiError(404, 'Unknown report');
  const rows = await def.fn(pool);
  const format = (req.query.format || 'json').toLowerCase();
  if (format === 'json') return res.json({ title: def.title, rows });
  if (!permsForRole(req.user.role).includes(PERMS.EXPORT)) throw new ApiError(403, 'You do not have export permission.');
  await recordAccess(req, { action: 'export', detail: { report: req.params.type, format } });
  const base = fileName(`${def.title}_${new Date().toISOString().slice(0, 10)}`);
  res.setHeader('Content-Type', exportContentType(format));
  res.setHeader('Content-Disposition', `attachment; filename="${base}.${format}"`);
  if (format === 'csv') return res.send(toCsv(rows));
  if (format === 'xlsx') return res.send(await toXlsx(rows, def.title));
  if (format === 'json') return res.send(JSON.stringify(rows, null, 2));
  throw new ApiError(400, 'Unsupported format');
}));

// ── Audit + access logs ────────────────────────────────────────────────────
router.get('/audit', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  const rows = await reports.auditActivity(pool, { limit: Number(req.query.limit) || 1000 });
  const format = (req.query.format || 'json').toLowerCase();
  if (format === 'json') return res.json({ rows });
  if (!permsForRole(req.user.role).includes(PERMS.EXPORT)) throw new ApiError(403, 'Export permission required.');
  await recordAccess(req, { action: 'export', detail: { report: 'audit', format } });
  res.setHeader('Content-Type', exportContentType(format));
  res.setHeader('Content-Disposition', `attachment; filename="gst_audit.${format}"`);
  return res.send(format === 'csv' ? toCsv(rows) : await toXlsx(rows, 'Audit Activity'));
}));

// ── Reconciliation Center ──────────────────────────────────────────────────
router.get('/recon', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await recon.run(pool, { includeResolved: req.query.includeResolved === 'true' }))));
router.post('/recon/resolve', requirePerm(PERMS.VALIDATE), asyncHandler(async (req, res) => res.json(await tx((db) => recon.resolve(db, req.body || {}, uid(req))))));
router.get('/recon/export', requirePerm(PERMS.EXPORT), asyncHandler(async (req, res) => {
  const { groups } = await recon.run(pool, { includeResolved: true });
  const rows = groups.flatMap((g) => g.items.map((it) => ({ Check: g.title, Severity: g.severity, Reference: it.ref, Detail: it.detail, Resolution: it.resolution.status, Note: it.resolution.note || '' })));
  await recordAccess(req, { action: 'export', detail: { report: 'reconciliation', format: req.query.format } });
  const fmt = (req.query.format || 'csv').toLowerCase();
  res.setHeader('Content-Type', exportContentType(fmt));
  res.setHeader('Content-Disposition', `attachment; filename="gst_reconciliation.${fmt}"`);
  return res.send(fmt === 'xlsx' ? await toXlsx(rows, 'Reconciliation') : toCsv(rows));
}));

// ── Notifications / Alerts ─────────────────────────────────────────────────
router.get('/notifications', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  await tx((db) => notify.refresh(db));
  res.json(await notify.list(pool, req.query));
}));
router.get('/notifications/summary', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => res.json(await notify.summary(pool))));
router.post('/notifications/refresh', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => res.json(await tx((db) => notify.refresh(db)))));
router.post('/notifications/:id/status', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => notify.setStatus(db, req.params.id, req.body?.status, uid(req))))));

// ── API Health & Monitoring (admin) ────────────────────────────────────────
router.get('/health', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await monitor.apiHealth(pool))));

// ── Global Activity Timeline ───────────────────────────────────────────────
router.get('/activity', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await monitor.activity(pool, req.query))));
router.get('/activity/export', requirePerm(PERMS.EXPORT), asyncHandler(async (req, res) => {
  const rows = await monitor.activityRows(pool, req.query);
  await recordAccess(req, { action: 'export', detail: { report: 'activity', format: req.query.format } });
  const fmt = (req.query.format || 'csv').toLowerCase();
  res.setHeader('Content-Type', exportContentType(fmt));
  res.setHeader('Content-Disposition', `attachment; filename="gst_activity.${fmt}"`);
  return res.send(fmt === 'xlsx' ? await toXlsx(rows, 'Activity') : toCsv(rows));
}));

router.get('/access-logs', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT a.created_at, u.name AS user_name, a.ip, a.action, a.object_type, a.detail
       FROM gst_access_logs a LEFT JOIN users u ON u.id=a.user_id
      ORDER BY a.created_at DESC LIMIT 1000`);
  res.json(rows);
}));

// ============================================================================
//  e-INVOICE
// ============================================================================
router.get('/einvoices', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await einv.list(pool, req.query))));
// Offline bulk JSON for the GST portal upload (<2MB; eligible = no IRN yet). Declared before /:id.
router.get('/einvoices/portal-json', requirePerm(PERMS.EXPORT), asyncHandler(async (req, res) => {
  const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : null;
  const arr = await einv.bulkPortalPayload(pool, ids);
  await recordAccess(req, { action: 'export', objectType: 'einvoice', detail: { kind: 'portal-bulk-json', count: arr.length } });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="einvoice_bulk_portal.json"');
  res.send(JSON.stringify(arr, null, 2));
}));
router.get('/einvoices/:id', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await einv.get(pool, req.params.id))));
router.post('/einvoices', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => einv.createDraft(db, withBranch(req), uid(req))))));
router.patch('/einvoices/:id', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => einv.updateDraft(db, req.params.id, req.body, uid(req))))));
router.post('/einvoices/:id/validate', requirePerm(PERMS.VALIDATE), asyncHandler(async (req, res) => res.json(await tx((db) => einv.validate(db, req.params.id, uid(req), req.body || {})))));
router.post('/einvoices/:id/submit', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => einv.submit(db, req.params.id, uid(req), { idempotencyKey: idem(req) })))));
router.post('/einvoices/:id/cancel', requirePerm(PERMS.CANCEL), asyncHandler(async (req, res) => {
  await tx((db) => otp.assertForAction(db, { token: req.body?.otpToken, action: 'cancel_einvoice', userId: uid(req) }));
  res.json(await tx((db) => einv.cancel(db, req.params.id, req.body || {}, uid(req))));
}));
router.post('/einvoices/:id/duplicate', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => einv.duplicate(db, req.params.id, uid(req))))));
// Convert an invoice into a Credit Note (CRN) draft referencing the original.
router.post('/einvoices/:id/credit-note', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => einv.createCreditNote(db, req.params.id, req.body, uid(req))))));
// Reverse a credit-note draft (no IRN yet) back to a normal tax invoice.
router.post('/einvoices/:id/revert-to-invoice', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => einv.revertToInvoice(db, req.params.id, uid(req))))));
router.post('/einvoices/:id/archive', requirePerm(PERMS.ARCHIVE), asyncHandler(async (req, res) => res.json(await tx((db) => einv.setArchived(db, req.params.id, req.body?.archived !== false, uid(req))))));
router.delete('/einvoices/:id', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => einv.softDelete(db, req.params.id, uid(req))))));

// Offline e-invoicing: single portal JSON (download) + record the IRN by hand.
router.get('/einvoices/:id/portal-json', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const payload = await einv.portalPayload(pool, req.params.id);
  await recordAccess(req, { action: 'download', objectType: 'einvoice', objectId: req.params.id, detail: { kind: 'portal-json' } });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="einvoice_${fileName(payload?.DocDtls?.No || req.params.id)}_portal.json"`);
  res.send(JSON.stringify([payload], null, 2)); // array → directly portal-uploadable
}));
router.post('/einvoices/:id/record-irn', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => einv.recordManualIrn(db, req.params.id, req.body || {}, uid(req))))));
router.post('/einvoices/:id/restore', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => einv.restore(db, req.params.id, uid(req))))));
router.post('/einvoices/:id/restore-version', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => einv.restoreVersion(db, req.params.id, req.body?.versionId, uid(req))))));

router.get('/einvoices/:id/pdf', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const rec = await einv.get(pool, req.params.id);
  const branding = await brandingSvc.getForBranch(pool, rec.branchId);
  const buf = await einvoicePdf(rec, branding, req.query.lang);
  await tx((db) => einv.markPrinted(db, req.params.id, uid(req)));
  await recordAccess(req, { action: 'download', objectType: 'einvoice', objectId: req.params.id, detail: { kind: 'pdf' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="e-Invoice ${fileName(rec.docNo)}.pdf"`);
  res.send(buf);
}));

// Update the cosmetic letterhead/office address only (editable even post-IRN).
router.patch('/einvoices/:id/header-address', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) =>
  res.json(await tx((db) => einv.updateHeaderAddress(db, req.params.id, req.body?.headerAddress, uid(req))))));

router.get('/einvoices/:id/json', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT doc_no, canonical_payload, signed_invoice, signed_qr, irn FROM gst_einvoices WHERE id=$1', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'e-Invoice not found');
  await recordAccess(req, { action: 'download', objectType: 'einvoice', objectId: req.params.id, detail: { kind: 'json' } });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="eInvoice_${fileName(rows[0].doc_no)}_signed.json"`);
  res.send(JSON.stringify({ irn: rows[0].irn, payload: rows[0].canonical_payload, signedInvoice: rows[0].signed_invoice, signedQRCode: rows[0].signed_qr }, null, 2));
}));

// ── Bulk e-invoice operations ──────────────────────────────────────────────
router.post('/einvoices/bulk', asyncHandler(async (req, res) => {
  const { action, ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, 'No records selected.');
  const need = { validate: PERMS.VALIDATE, submit: PERMS.SUBMIT, archive: PERMS.ARCHIVE, delete: PERMS.EDIT, restore: PERMS.EDIT }[action];
  if (!need) throw new ApiError(400, 'Unknown bulk action.');
  if (!permsForRole(req.user.role).includes(need)) throw new ApiError(403, `You lack the “${need}” permission for bulk ${action}.`);
  await recordAccess(req, { action: 'bulk', objectType: 'einvoice', detail: { action, count: ids.length } });
  const results = [];
  for (const id of ids) {
    try {
      const out = await tx((db) => {
        if (action === 'validate') return einv.validate(db, id, uid(req), {});
        if (action === 'submit') return einv.submit(db, id, uid(req), {});
        if (action === 'archive') return einv.setArchived(db, id, true, uid(req));
        if (action === 'delete') return einv.softDelete(db, id, uid(req));
        if (action === 'restore') return einv.restore(db, id, uid(req));
        return null;
      });
      results.push({ id, ok: true, result: out?.ok === false ? 'needs_review' : 'done' });
    } catch (e) { results.push({ id, ok: false, error: e.message }); }
  }
  res.json({ action, total: ids.length, success: results.filter((r) => r.ok).length, results });
}));

// ============================================================================
//  e-WAY BILL
// ============================================================================
router.get('/ewbs', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await ewb.list(pool, req.query))));
router.get('/ewbs/:id', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await ewb.get(pool, req.params.id))));
router.post('/ewbs', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => ewb.createDraft(db, withBranch(req), uid(req))))));
router.post('/ewbs/from-einvoice/:einvoiceId', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => ewb.fromEInvoice(db, req.params.einvoiceId, withBranch(req), uid(req))))));
router.patch('/ewbs/:id', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.updateDraft(db, req.params.id, req.body, uid(req))))));
router.post('/ewbs/:id/validate', requirePerm(PERMS.VALIDATE), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.validate(db, req.params.id, uid(req), req.body || {})))));
router.post('/ewbs/:id/generate', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.generate(db, req.params.id, uid(req), { idempotencyKey: idem(req) })))));
router.post('/ewbs/:id/update-partb', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.updatePartB(db, req.params.id, req.body || {}, uid(req))))));
router.post('/ewbs/:id/extend', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.extend(db, req.params.id, req.body || {}, uid(req))))));
router.post('/ewbs/:id/cancel', requirePerm(PERMS.CANCEL), asyncHandler(async (req, res) => {
  await tx((db) => otp.assertForAction(db, { token: req.body?.otpToken, action: 'cancel_ewb', userId: uid(req) }));
  res.json(await tx((db) => ewb.cancel(db, req.params.id, req.body || {}, uid(req))));
}));
router.post('/ewbs/:id/reject', requirePerm(PERMS.CANCEL), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.reject(db, req.params.id, uid(req))))));
router.post('/ewbs/:id/close', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.close(db, req.params.id, uid(req))))));
router.post('/ewbs/:id/archive', requirePerm(PERMS.ARCHIVE), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.setArchived(db, req.params.id, req.body?.archived !== false, uid(req))))));
router.delete('/ewbs/:id', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.softDelete(db, req.params.id, uid(req))))));
router.post('/ewbs/:id/restore', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.restore(db, req.params.id, uid(req))))));
router.post('/ewbs/:id/restore-version', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => ewb.restoreVersion(db, req.params.id, req.body?.versionId, uid(req))))));

router.get('/ewbs/:id/pdf', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const rec = await ewb.get(pool, req.params.id);
  const branding = await brandingSvc.getForBranch(pool, rec.branchId);
  const buf = await ewbPdf(rec, branding, req.query.lang);
  await tx((db) => ewb.markPrinted(db, req.params.id, uid(req)));
  await recordAccess(req, { action: 'download', objectType: 'ewb', objectId: req.params.id, detail: { kind: 'pdf' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="EWB_${fileName(rec.ewbNo || rec.docNo)}.pdf"`);
  res.send(buf);
}));

router.get('/ewbs/:id/json', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT doc_no, ewb_no, canonical_payload FROM gst_eway_bills WHERE id=$1', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'e-Way Bill not found');
  await recordAccess(req, { action: 'download', objectType: 'ewb', objectId: req.params.id, detail: { kind: 'json' } });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="EWB_${fileName(rows[0].ewb_no || rows[0].doc_no)}.json"`);
  res.send(JSON.stringify({ ewbNo: rows[0].ewb_no, payload: rows[0].canonical_payload }, null, 2));
}));

router.post('/ewbs/bulk', asyncHandler(async (req, res) => {
  const { action, ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, 'No records selected.');
  const need = { validate: PERMS.VALIDATE, generate: PERMS.SUBMIT, archive: PERMS.ARCHIVE, delete: PERMS.EDIT, restore: PERMS.EDIT }[action];
  if (!need) throw new ApiError(400, 'Unknown bulk action.');
  if (!permsForRole(req.user.role).includes(need)) throw new ApiError(403, `You lack the “${need}” permission for bulk ${action}.`);
  await recordAccess(req, { action: 'bulk', objectType: 'ewb', detail: { action, count: ids.length } });
  const results = [];
  for (const id of ids) {
    try {
      const out = await tx((db) => {
        if (action === 'validate') return ewb.validate(db, id, uid(req), {});
        if (action === 'generate') return ewb.generate(db, id, uid(req), {});
        if (action === 'archive') return ewb.setArchived(db, id, true, uid(req));
        if (action === 'delete') return ewb.softDelete(db, id, uid(req));
        if (action === 'restore') return ewb.restore(db, id, uid(req));
        return null;
      });
      results.push({ id, ok: true, result: out?.ok === false ? 'needs_review' : 'done' });
    } catch (e) { results.push({ id, ok: false, error: e.message }); }
  }
  res.json({ action, total: ids.length, success: results.filter((r) => r.ok).length, results });
}));

// ── #10 Customer GSTIN validation ──────────────────────────────────────────
router.post('/validate-gstin', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => gstinVal.validate(db, req.body || {}, uid(req))))));
router.get('/gstin-history/:gstin', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await gstinVal.history(pool, req.params.gstin))));

// ── #8 Duplicate check (entry-time) ────────────────────────────────────────
router.post('/einvoices/check-duplicate', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await duplicates.check(pool, { ...req.body, branchId: branchCtx(req) }))));

// ── #3 Attachments ─────────────────────────────────────────────────────────
router.get('/attachments', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await attachments.list(pool, req.query.objectType, req.query.objectId))));
router.post('/attachments', requirePerm(PERMS.CREATE), upload.single('file'), asyncHandler(async (req, res) => {
  const out = await tx((db) => attachments.add(db, { objectType: req.body.objectType, objectId: req.body.objectId, category: req.body.category, immutable: req.body.immutable === 'true', file: req.file }, uid(req)));
  res.status(201).json(out);
}));
router.get('/attachments/:id/download', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const a = await tx((db) => attachments.getForDownload(db, req.params.id));
  await recordAccess(req, { action: 'download', objectType: 'attachment', objectId: req.params.id, detail: { name: a.original_name } });
  res.download(a.filePath, a.original_name);
}));
router.delete('/attachments/:id', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => attachments.remove(db, req.params.id, uid(req))))));

// ── #15 OTP / 2FA ──────────────────────────────────────────────────────────
router.get('/otp/enabled', requirePerm(PERMS.VIEW), (_req, res) => res.json({ enabled: otp.isEnabled() }));
router.post('/otp/request', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => otp.request(db, req.body || {}, req)))));
router.post('/otp/verify', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => otp.verify(db, req.body || {}, req)))));

// ── #13 Scheduled reports ──────────────────────────────────────────────────
router.get('/schedules', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  await tx((db) => schedules.runDue(db, uid(req)));   // lazy run of anything due
  res.json(await schedules.list(pool));
}));
router.post('/schedules', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => schedules.create(db, req.body, uid(req))))));
router.patch('/schedules/:id', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => schedules.update(db, req.params.id, req.body, uid(req))))));
router.delete('/schedules/:id', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => schedules.remove(db, req.params.id, uid(req))))));
router.post('/schedules/:id/run', requirePerm(PERMS.EXPORT), asyncHandler(async (req, res) => res.json(await tx((db) => schedules.runNow(db, req.params.id, uid(req))))));
router.get('/schedules/:id/runs', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await schedules.runs(pool, req.params.id))));

// ── #14 Import wizard ──────────────────────────────────────────────────────
router.get('/import/entities', requirePerm(PERMS.VIEW), (_req, res) => res.json(imports.entityMeta()));
router.post('/import/preview', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.json(imports.previewRows(req.body.entity, req.body.rows || []))));
router.post('/import/run', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.json(await tx((db) => imports.run(db, req.body || {}, uid(req))))));
router.get('/import/history', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => res.json(await imports.history(pool))));

// ── #7 Backup & disaster recovery (admin) ──────────────────────────────────
router.get('/backups', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await backups.list(pool))));
router.get('/backups/dashboard', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await backups.dashboard(pool))));
router.get('/backups/today', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => res.json({ hasToday: await backups.hasTodayBackup(pool) })));
router.post('/backups', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => backups.create(db, { kind: req.body?.kind || 'manual' }, uid(req))))));
router.post('/backups/:id/verify', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => backups.verify(db, req.params.id, uid(req))))));
router.post('/backups/:id/preview-restore', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await backups.previewRestore(pool, req.params.id, { tables: req.body?.tables }))));
router.post('/backups/:id/dr-test', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => backups.drTest(db, req.params.id, uid(req))))));
router.get('/backups/:id/download', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  const f = await backups.fileFor(pool, req.params.id);
  await recordAccess(req, { action: 'download', objectType: 'backup', objectId: req.params.id });
  res.download(f.path, f.name);
}));
router.post('/backups/upload', requirePerm(PERMS.ADMIN), uploadBackup.single('file'), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => backups.importUploaded(db, req.file, uid(req))))));
router.delete('/backups/:id', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => backups.remove(db, req.params.id, uid(req))))));
router.post('/backups/:id/restore', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  await tx((db) => otp.assertForAction(db, { token: req.body?.otpToken, action: 'backup_restore', userId: uid(req) }));
  res.json(await tx((db) => backups.restore(db, req.params.id, { mode: req.body?.mode || 'full', tables: req.body?.tables }, uid(req))));
}));

// ── #2 Version control ─────────────────────────────────────────────────────
router.get('/versions/compare', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await versions.compare(pool, req.query.a, req.query.b))));
router.get('/versions/:objectType/:id', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await versions.list(pool, req.params.objectType, req.params.id))));
router.get('/versions/:objectType/:id/pdf', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const buf = await versions.historyPdf(pool, req.params.objectType, req.params.id, req.query.label);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="version-history.pdf"`);
  res.send(buf);
}));

// ── #3 Discussions ─────────────────────────────────────────────────────────
router.get('/comments', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  const rows = await comments.list(pool, req.query.objectType, req.query.objectId);
  await tx((db) => comments.markRead(db, req.query.objectType, req.query.objectId, uid(req)));
  res.json(rows);
}));
router.get('/comments/unread', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json({ count: await comments.unreadCount(pool, req.query.objectType, req.query.objectId, uid(req)) })));
router.post('/comments', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => comments.add(db, req.body, uid(req))))));
router.post('/comments/:id/resolve', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => comments.setResolved(db, req.params.id, req.body?.resolved !== false, uid(req))))));
router.post('/comments/:id/pin', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => comments.setPinned(db, req.params.id, req.body?.pinned !== false, uid(req))))));

// ── #4 Universal search ────────────────────────────────────────────────────
router.get('/search', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await searchSvc.search(pool, req.query.q, { branchId: branchCtx(req) }))));

// ── #5 Saved views ─────────────────────────────────────────────────────────
router.get('/views', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await views.list(pool, uid(req), req.query.objectType))));
router.post('/views', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => views.create(db, req.body, uid(req))))));
router.patch('/views/:id', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => views.update(db, req.params.id, req.body, uid(req))))));
router.delete('/views/:id', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => views.remove(db, req.params.id, uid(req))))));
router.post('/views/:id/clone', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => views.clone(db, req.params.id, uid(req))))));
router.post('/views/:id/default', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await tx((db) => views.setDefault(db, req.params.id, uid(req))))));

// ── Business activity feed ─────────────────────────────────────────────────
router.get('/feed', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  if ((req.query.format || '') === 'csv') { await recordAccess(req, { action: 'export', detail: { report: 'feed' } }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="activity-feed.csv"'); return res.send(toCsv(await feed.feedRows(pool, req.query))); }
  res.json(await feed.feed(pool, req.query));
}));

// ── #8 Branding manager ────────────────────────────────────────────────────
router.get('/branding', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(req.query.branch_id ? await brandingSvc.getForBranch(pool, req.query.branch_id) : await brandingSvc.get(pool))));
router.post('/branding', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => (req.body.branchId ? brandingSvc.setForBranch(db, req.body.branchId, req.body, uid(req)) : brandingSvc.set(db, req.body, uid(req)))))));
router.post('/branding/asset', requirePerm(PERMS.ADMIN), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'A file is required.');
  const slot = ({ logo: 'logoFile', signature: 'signatureFile', stamp: 'stampFile' })[req.body.slot] || 'logoFile';
  const patch = { [slot]: req.file.filename };
  const out = await tx((db) => (req.body.branchId ? brandingSvc.setForBranch(db, req.body.branchId, patch, uid(req)) : brandingSvc.set(db, patch, uid(req))));
  res.status(201).json(out);
}));
const SAMPLE_QUOTE = {
  quote_number: 'SAMPLE/Q/26-27/0001', version: 1, client_name: 'SAMPLE CUSTOMER PVT LTD',
  project_name: 'Rooftop Solar — Sample', site_name: 'Sample Site', issue_date: new Date(), valid_until: new Date(Date.now() + 15 * 864e5),
  project_type: 'commercial', capacity_kw: 100, per_watt: 45,
  line_items: [
    { item: 'Mono PERC Modules 540Wp', qty: 185, unit: 'Nos', rate: 11500, amount: 2127500 },
    { item: 'String Inverter 50kW', qty: 2, unit: 'Nos', rate: 320000, amount: 640000 },
    { item: 'Mounting Structure + BOS', qty: 1, unit: 'Lot', rate: 700000, amount: 700000 },
  ],
  subtotal: 3467500, contingency_amount: 50000, margin_amount: 500000, taxable_amount: 4017500, gst_amount: 321400, total_amount: 4338900,
  cost_amount: 3467500, subsidy_amount: 0, net_cost: 4338900, annual_savings: 1200000, payback_years: 4.2,
  notes: 'Grid-tied rooftop with net metering. Sample preview document.',
};

const SAMPLE_CHALLAN = {
  challanNo: 'SAMPLE/DC/26-27/00001', challanDate: new Date().toISOString().slice(0, 10),
  status: 'dispatched', challanType: 'job_work', challanTypeName: 'Job Work', isInterstate: true,
  consignor: { legalName: company.name, gstin: company.gstin, addr1: company.address, location: 'Greater Noida', pincode: '201310', stateCode: '09' },
  consignee: { legalName: 'SAMPLE JOB WORKER PVT LTD', gstin: '10AARCA4610L1ZT', addr1: 'Industrial Area', location: 'Madhubani', pincode: '847229', stateCode: '10' },
  transport: { mode: 'road', vehicleNo: 'UP16AB1234', transporterName: 'Sample Logistics', lrNo: 'LR-1024' },
  ewbNo: '391000123456', ewbValidTo: new Date(Date.now() + 2 * 864e5).toISOString(),
  items: [
    { lineNo: 1, productName: 'Solar Module 540Wp', hsn: '854143', batchNo: 'B-22', quantity: 20, unit: 'NOS', rate: 12000, gstRate: 18, taxableValue: 240000, igstAmount: 43200 },
    { lineNo: 2, productName: 'Mounting Structure', hsn: '730890', quantity: 40, unit: 'NOS', rate: 800, gstRate: 18, taxableValue: 32000, igstAmount: 5760 },
  ],
  taxableValue: 272000, cgstValue: 0, sgstValue: 0, igstValue: 48960, cessValue: 0, totalValue: 320960,
};

router.get('/branding/preview', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => {
  const type = req.query.type || 'einvoice';
  if (type === 'quote') {
    const { streamQuotePdf } = await import('../services/quote-pdf.service.js');
    const brand = await brandingSvc.getForBranch(pool, req.query.branch_id);
    return streamQuotePdf(res, SAMPLE_QUOTE, brand, req.query.lang);
  }
  if (type === 'challan') {
    const brand = await brandingSvc.getForBranch(pool, req.query.branch_id);
    const buf = await challanPdf(SAMPLE_CHALLAN, brand, req.query.lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="branding-preview-challan.pdf"');
    return res.send(buf);
  }
  const buf = await brandingSvc.preview(pool, type, req.query.branch_id, req.query.lang);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="branding-preview.pdf"`);
  res.send(buf);
}));

// ── Backup retention ───────────────────────────────────────────────────────
router.get('/backups/retention', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await backups.getRetention(pool))));
router.post('/backups/retention', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => res.json(await tx((db) => backups.setRetention(db, req.body || {}, uid(req))))));
router.get('/backups/growth', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await backups.growth(pool))));

// ── #7 Diagnostics ─────────────────────────────────────────────────────────
router.get('/diagnostics', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  const data = await diagnostics.run(pool);
  if ((req.query.format || '') === 'csv') { await recordAccess(req, { action: 'export', detail: { report: 'diagnostics' } }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="diagnostics.csv"'); return res.send(toCsv(await diagnostics.rows(pool))); }
  res.json(data);
}));

// ── #13 Production readiness + #12 test suite ──────────────────────────────
router.get('/readiness', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  const data = await readiness.review(pool);
  if ((req.query.format || '') === 'csv') { await recordAccess(req, { action: 'export', detail: { report: 'readiness' } }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="readiness.csv"'); return res.send(toCsv(await readiness.reviewRows(pool))); }
  res.json(data);
}));
router.get('/test-suite', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => res.json(await readiness.testSuite(pool))));

// ============================================================================
//  DELIVERY CHALLAN  (Rule 55 — movement of goods without a tax invoice)
//  Specific paths declared before /:id so they aren't captured as an id.
// ============================================================================
router.get('/challans/stats', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await challans.stats(pool, branchCtx(req)))));
router.get('/challans/masters', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT category, code, name, meta FROM gst_master_data WHERE category IN ('dc_type','dc_reason') AND active=TRUE ORDER BY category, name");
  res.json({
    types: rows.filter((r) => r.category === 'dc_type').map((r) => ({ code: r.code, name: r.name, meta: r.meta })),
    reasons: rows.filter((r) => r.category === 'dc_reason').map((r) => ({ code: r.code, name: r.name })),
  });
}));
router.get('/challans/export', requirePerm(PERMS.EXPORT), asyncHandler(async (req, res) => {
  const rows = await challans.register(pool, { ...req.query, branchId: branchCtx(req) });
  await recordAccess(req, { action: 'export', objectType: 'delivery_challan', detail: { format: req.query.format, count: rows.length } });
  const payload = {
    title: 'Delivery Challan Register', subtitle: rangeText(req.query), filename: 'delivery-challan-register',
    columns: [
      { header: 'Challan #', key: 'challan_no', xlsWidth: 20 },
      { header: 'Date', key: 'date', xlsWidth: 12 },
      { header: 'Type', key: 'type', xlsWidth: 20 },
      { header: 'Consignee', key: 'consignee', xlsWidth: 26 },
      { header: 'GSTIN', key: 'consignee_gstin', xlsWidth: 18 },
      { header: 'To State', key: 'to_state', xlsWidth: 16 },
      { header: 'Vehicle', key: 'vehicle', xlsWidth: 14 },
      { header: 'E-Way Bill', key: 'ewb_no', xlsWidth: 16 },
      { header: 'Qty', key: 'qty', xlsWidth: 10 },
      { header: 'Taxable', key: 'taxable', xlsWidth: 14, money: true },
      { header: 'Total', key: 'total', xlsWidth: 14, money: true },
      { header: 'Status', key: 'status', xlsWidth: 14 },
    ],
    rows,
    totals: { qty: rows.reduce((s, r) => s + Number(r.qty || 0), 0), taxable: rows.reduce((s, r) => s + Number(r.taxable || 0), 0), total: rows.reduce((s, r) => s + Number(r.total || 0), 0) },
  };
  if (req.query.format === 'pdf') return streamPdf(res, payload, req.query.lang);
  return streamExcel(res, payload, req.query.lang);
}));
router.get('/challans', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await challans.list(pool, { ...req.query, branchId: branchCtx(req) }))));
router.post('/challans', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => challans.create(db, withBranch(req), uid(req))))));
router.get('/challans/:id', requirePerm(PERMS.VIEW), asyncHandler(async (req, res) => res.json(await challans.get(pool, req.params.id))));
router.patch('/challans/:id', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => challans.update(db, req.params.id, req.body, uid(req))))));
router.delete('/challans/:id', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => challans.softDelete(db, req.params.id, uid(req))))));

router.post('/challans/:id/submit', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.json(await tx((db) => challans.submitForApproval(db, req.params.id, uid(req))))));
router.post('/challans/:id/approve', requirePerm(PERMS.APPROVE), asyncHandler(async (req, res) => res.json(await tx((db) => challans.approve(db, req.params.id, uid(req))))));
router.post('/challans/:id/reject', requirePerm(PERMS.APPROVE), asyncHandler(async (req, res) => res.json(await tx((db) => challans.reject(db, req.params.id, req.body?.reason, uid(req))))));
router.post('/challans/:id/dispatch', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => challans.dispatch(db, req.params.id, req.body || {}, uid(req))))));
router.post('/challans/:id/transit', requirePerm(PERMS.SUBMIT), asyncHandler(async (req, res) => res.json(await tx((db) => challans.markInTransit(db, req.params.id, uid(req))))));
router.post('/challans/:id/deliver', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => challans.deliver(db, req.params.id, req.body || {}, uid(req))))));
router.post('/challans/:id/return', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => challans.returnGoods(db, req.params.id, req.body || {}, uid(req))))));
router.post('/challans/:id/cancel', requirePerm(PERMS.CANCEL), asyncHandler(async (req, res) => res.json(await tx((db) => challans.cancel(db, req.params.id, req.body?.reason, uid(req))))));
router.post('/challans/:id/close', requirePerm(PERMS.EDIT), asyncHandler(async (req, res) => res.json(await tx((db) => challans.close(db, req.params.id, uid(req))))));
router.post('/challans/:id/convert', requirePerm(PERMS.CREATE), asyncHandler(async (req, res) => res.status(201).json(await tx((db) => challans.convertToInvoice(db, req.params.id, uid(req))))));

router.get('/challans/:id/pdf', requirePerm(PERMS.DOWNLOAD), asyncHandler(async (req, res) => {
  const dc = await challans.get(pool, req.params.id);
  const branding = await brandingSvc.getForBranch(pool, dc.branchId);
  if (dc.branchId) {
    try {
      const br = await branchSvc.get(pool, dc.branchId);
      const addrParts = [br.addr1, br.addr2, br.place, br.pincode].filter(Boolean);
      if (!branding.headerAddr && addrParts.length) branding.headerAddr = addrParts.join(', ');
      if (!branding.gstin) branding.gstin = br.gstin;
      if (!branding.contactInfo && br.email) branding.contactInfo = br.email;
    } catch { /* ignore */ }
  }
  const buf = await challanPdf(dc, branding, req.query.lang);
  await recordAccess(req, { action: 'download', objectType: 'delivery_challan', objectId: req.params.id, detail: { kind: 'pdf' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Challan_${fileName(dc.challanNo)}.pdf"`);
  res.send(buf);
}));

// ============================================================================
//  §12 Recovery Center — view + recover soft-deleted records (admin).
//  Backups (list/verify/restore/download) reuse the existing /backups routes.
// ============================================================================
router.get('/recovery/deleted', requirePerm(PERMS.ADMIN), asyncHandler(async (_req, res) => {
  const einvoices = (await pool.query(
    `SELECT id, doc_no, doc_type, buyer_name, total_inv_val, deleted_at FROM gst_einvoices WHERE is_deleted=TRUE ORDER BY deleted_at DESC NULLS LAST LIMIT 200`)).rows;
  const ewbs = (await pool.query(
    `SELECT id, ewb_no, doc_no, to_trade_name, tot_inv_value, deleted_at FROM gst_eway_bills WHERE is_deleted=TRUE ORDER BY deleted_at DESC NULLS LAST LIMIT 200`)).rows;
  const challans = (await pool.query(
    `SELECT id, challan_no, challan_type, consignee->>'legalName' AS consignee, total_value, deleted_at FROM delivery_challans WHERE is_deleted=TRUE ORDER BY deleted_at DESC NULLS LAST LIMIT 200`)).rows;
  const invoices = (await pool.query(
    `SELECT i.id, i.invoice_number, COALESCE(i.customer_name, c.name) AS customer_name, i.total_amount, i.deleted_at
       FROM invoices i LEFT JOIN clients c ON c.id=i.client_id
      WHERE i.is_deleted=TRUE ORDER BY i.deleted_at DESC NULLS LAST LIMIT 200`)).rows;
  const payments = (await pool.query(
    `SELECT p.id, p.reference_id, COALESCE(v.name, e.name, p.beneficiary_name) AS payee, p.amount, p.deleted_at
       FROM payments p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN employees e ON e.id=p.employee_id
      WHERE p.is_deleted=TRUE ORDER BY p.deleted_at DESC NULLS LAST LIMIT 200`)).rows;
  const projects = (await pool.query(
    `SELECT id, name, COALESCE(client_name,'') AS client, contract_value, deleted_at
       FROM projects WHERE is_deleted=TRUE ORDER BY deleted_at DESC NULLS LAST LIMIT 200`)).rows;
  const receipts = (await pool.query(
    `SELECT r.id, r.reference_id, COALESCE(c.name, r.account_details, '') AS client, r.credited_amount, r.deleted_at
       FROM receipts r LEFT JOIN clients c ON c.id=r.client_id
      WHERE r.is_deleted=TRUE ORDER BY r.deleted_at DESC NULLS LAST LIMIT 200`)).rows;
  res.json({ einvoices, ewbs, challans, invoices, payments, projects, receipts,
    total: einvoices.length + ewbs.length + challans.length + invoices.length + payments.length + projects.length + receipts.length });
}));

router.post('/recovery/restore', requirePerm(PERMS.ADMIN), asyncHandler(async (req, res) => {
  const { type, id } = req.body || {};
  if (!id) throw new ApiError(400, 'A record id is required.');
  const out = await tx((db) => {
    if (type === 'einvoice') return einv.restore(db, id, uid(req));
    if (type === 'ewb') return ewb.restore(db, id, uid(req));
    if (type === 'challan') return challans.restore(db, id, uid(req));
    if (type === 'invoice') return invSvc.restore(db, id, uid(req));
    if (type === 'payment') return paymentSvc.restore(db, id, uid(req));
    if (type === 'project') return db.query('UPDATE projects SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL WHERE id=$1 RETURNING id', [id]).then((r) => r.rows[0] || null);
    if (type === 'receipt') return receiptSvc.restore(db, id, uid(req));
    throw new ApiError(400, 'Unknown record type.');
  });
  await recordAccess(req, { action: 'restore', objectType: type, objectId: id });
  res.json({ ok: true, restored: out });
}));

// ── GST portal login (offline-filing convenience) ───────────────────────────
// Stored server-side in app_config so it's shared across devices. Only the
// editor may set it. Anyone signed in can read the URL + user id; the password
// is revealed only after the requester re-enters their OWN login password.
const PORTAL_KINDS = ['einvoice', 'ewb'];
router.get('/portal-config', requirePerm(PERMS.VIEW), asyncHandler(async (_req, res) => {
  const out = {};
  for (const k of PORTAL_KINDS) {
    const c = (await config.get(pool, `portal_${k}`, {})) || {};
    out[k] = { url: c.url || '', userId: c.userId || '', hasPassword: !!c.password };
  }
  res.json(out);
}));
router.put('/portal-config', editorOnly, asyncHandler(async (req, res) => {
  const { kind, url, userId, password } = req.body || {};
  if (!PORTAL_KINDS.includes(kind)) throw new ApiError(400, 'Unknown portal');
  const cur = (await config.get(pool, `portal_${kind}`, {})) || {};
  const next = {
    url: (url ?? cur.url) || '',
    userId: (userId ?? cur.userId) || '',
    password: password === undefined ? (cur.password || '') : password,   // blank clears it
  };
  await tx((db) => config.set(db, `portal_${kind}`, next, uid(req)));
  res.json({ ok: true, url: next.url, userId: next.userId, hasPassword: !!next.password });
}));
router.post('/portal-config/reveal', asyncHandler(async (req, res) => {
  const { kind, password } = req.body || {};
  if (!PORTAL_KINDS.includes(kind)) throw new ApiError(400, 'Unknown portal');
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [uid(req)]);
  const ok = rows[0] && (await bcrypt.compare(password || '', rows[0].password_hash));
  if (!ok) throw new ApiError(401, 'Password is incorrect');
  const c = (await config.get(pool, `portal_${kind}`, {})) || {};
  res.json({ password: c.password || '' });
}));

export default router;
