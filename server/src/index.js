import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { company } from './config/company.js';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import sitesRoutes from './routes/sites.routes.js';
import vendorsRoutes from './routes/vendors.routes.js';
import employeesRoutes from './routes/employees.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import ownAccountsRoutes from './routes/ownAccounts.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import receiptsRoutes from './routes/receipts.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import reconciliationRoutes from './routes/reconciliation.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import auditRoutes from './routes/audit.routes.js';
import quotesRoutes from './routes/quotes.routes.js';
import companyRoutes from './routes/company.routes.js';
import systemRoutes from './routes/system.routes.js';
import gstRoutes from './routes/gst.routes.js';

import { UPLOAD_ROOT } from './middleware/upload.js';
import { autoSyncOnWrite } from './services/autoSync.js';
import { notFound, errorHandler } from './middleware/error.js';

// Keep the ERP alive: a stray failure in a background worker (e.g. an OCR native
// crash on a corrupt upload, or a failed cloud publish) must never take the whole
// server down. Log it and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message || reason); // eslint-disable-line no-console
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.message || err); // eslint-disable-line no-console
});

const app = express();

// CLIENT_ORIGIN may be a single URL, a comma-separated list, or '*' (any).
const allowed = env.clientOrigin.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// Health check (also verifies DB connectivity)
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unavailable', error: err.message });
  }
});

// After any successful data change, schedule a debounced background publish to
// the cloud (no-op if CLOUD_DATABASE_URL isn't set on this machine).
app.use('/api', autoSyncOnWrite);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/own-accounts', ownAccountsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/receipts', receiptsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/gst', gstRoutes);

// Serve uploaded assets (branding logos/signatures/stamps) for in-app preview.
app.use('/uploads', express.static(UPLOAD_ROOT));

// ── Serve the built frontend (single-port "desktop" mode) ───────────────────
// When client/dist exists, this same server hosts the UI too, so the operator
// only needs ONE process on ONE port (http://localhost:4000). Any non-/api
// route falls back to index.html so the SPA router can handle it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  // eslint-disable-next-line no-console
  console.log(`  Serving frontend from ${clientDist}`);
}

app.use(notFound);
app.use(errorHandler);

// Apply persisted integration config (email / GST credentials / mode) into the
// environment at boot, so going Live needs no source-code edit (§5).
import('./services/gst/configService.js')
  .then((m) => m.applyRuntimeConfig(pool))
  .catch((e) => console.error('[config] applyRuntimeConfig failed:', e.message));

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`\n  ${company.name} — ERP API running on http://localhost:${env.port}`);
  console.log(`  Environment: ${env.nodeEnv}`);
  console.log(`  CORS origin: ${env.clientOrigin}\n`);
  // §8 Automatic backup engine — silent full-system backups every 2h.
  if (env.nodeEnv !== 'test') {
    import('./services/gst/autoBackup.js')
      .then((m) => m.startAutoBackup())
      .catch((e) => console.error('[auto-backup] start failed:', e.message));
    // Recovery retention — purge soft-deleted records older than 30 days.
    import('./services/gst/recoveryPurge.js')
      .then((m) => m.startRecoveryPurge())
      .catch((e) => console.error('[recovery-purge] start failed:', e.message));
    // Storage housekeeping — zip proof/statement files older than 30 days.
    import('./services/proofArchiver.js')
      .then((m) => m.startProofArchive())
      .catch((e) => console.error('[proof-archive] start failed:', e.message));
  }
});
