// ============================================================================
//  #9 Maintenance mode  +  #11 Configuration export.
//  Backed by the app_config key/value table. A small cache keeps the
//  maintenance-mode lookup cheap on the hot path (the auth middleware).
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';

let _cache = { mode: 'normal', at: 0 };
const TTL = 5000;

export async function get(db, key, fallback = null) {
  const { rows } = await db.query('SELECT value FROM app_config WHERE key=$1', [key]);
  return rows[0] ? rows[0].value : fallback;
}

export async function set(db, key, value, userId) {
  await db.query(
    `INSERT INTO app_config (key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=now()`,
    [key, JSON.stringify(value), userId]);
  return value;
}

// ── Maintenance mode ───────────────────────────────────────────────────────
export const VALID_MODES = ['normal', 'readonly', 'maintenance'];

export async function getMaintenanceMode(db) {
  const v = await get(db, 'maintenance_mode', null);
  return (v && v.mode) || 'normal';
}

// Cached lookup for the auth hot-path. `poolDb` is the pool (read-only use).
export async function cachedMode(poolDb) {
  if (Date.now() - _cache.at < TTL) return _cache.mode;
  try { _cache = { mode: await getMaintenanceMode(poolDb), at: Date.now() }; } catch { /* keep last */ }
  return _cache.mode;
}
export function bustModeCache() { _cache.at = 0; }

export async function setMaintenanceMode(db, mode, message, userId) {
  if (!VALID_MODES.includes(mode)) throw new ApiError(400, 'Invalid mode.');
  const prev = await getMaintenanceMode(db);
  await set(db, 'maintenance_mode', { mode, message: message || null, since: new Date().toISOString() }, userId);
  bustModeCache();
  await recordAudit(db, { objectType: 'system', objectId: userId, eventType: 'maintenance_mode_changed', field: 'mode', oldValue: prev, newValue: mode, message: `System mode changed: ${prev} → ${mode}${message ? ` (${message})` : ''}`, userId });
  return { mode, message };
}

// ── §5 Integration & Environment Management ────────────────────────────────
// Map config fields → process.env vars so going Live needs no code edits.
const ENV_MAP = {
  gst: { mode: 'GST_MODE', clientId: 'GST_CLIENT_ID', clientSecret: 'GST_CLIENT_SECRET', apiKey: 'GST_API_KEY', gspUsername: 'GST_GSP_USER', gspPassword: 'GST_GSP_PASS', irpUrl: 'GST_IRP_URL', ewbUrl: 'GST_EWB_URL' },
  email: { smtpHost: 'GST_SMTP_HOST', smtpPort: 'GST_SMTP_PORT', username: 'GST_SMTP_USER', password: 'GST_SMTP_PASS', sender: 'GST_SMTP_FROM', replyTo: 'GST_SMTP_REPLYTO' },
};
const SECRET_FIELDS = new Set(['clientSecret', 'apiKey', 'gspPassword', 'password']);

function applyToEnv(type, values) {
  const map = ENV_MAP[type] || {};
  for (const [field, env] of Object.entries(map)) {
    if (values[field] !== undefined && values[field] !== null && values[field] !== '') process.env[env] = String(values[field]);
  }
}

// On boot: load persisted integration config from app_config into process.env.
export async function applyRuntimeConfig(db) {
  for (const type of ['gst', 'email']) {
    const v = await get(db, `integration_${type}`, null);
    if (v) applyToEnv(type, v);
  }
}

export async function getIntegrations(db) {
  const out = {};
  for (const type of ['gst', 'email', 'sms', 'whatsapp', 'cloud']) {
    const v = (await get(db, `integration_${type}`, {})) || {};
    // Never return secrets to the client — only "configured" flags + masked hint.
    const safe = {};
    for (const [k, val] of Object.entries(v)) safe[k] = SECRET_FIELDS.has(k) ? (val ? '••••••••' : '') : val;
    out[type] = { ...safe, _hasSecrets: Object.keys(v).some((k) => SECRET_FIELDS.has(k) && v[k]) };
  }
  out.gst.mode = process.env.GST_MODE || 'simulation';
  return out;
}

export async function setIntegration(db, type, values, userId) {
  if (!['gst', 'email', 'sms', 'whatsapp', 'cloud'].includes(type)) throw new ApiError(400, 'Unknown integration.');
  const prev = (await get(db, `integration_${type}`, {})) || {};
  const next = { ...prev };
  for (const [k, val] of Object.entries(values || {})) {
    if (val === undefined) continue;
    // keep existing secret if the masked placeholder was submitted unchanged
    if (SECRET_FIELDS.has(k) && (val === '' || val === '••••••••')) continue;
    next[k] = val;
  }
  await set(db, `integration_${type}`, next, userId);
  applyToEnv(type, next);
  const changed = Object.keys(values || {}).filter((k) => !SECRET_FIELDS.has(k)).map((k) => `${k}=${values[k]}`).join(', ');
  await recordAudit(db, { objectType: 'system', objectId: userId, eventType: 'integration_changed', message: `${type} integration updated${changed ? ` (${changed})` : ''}`, userId });
  return getIntegrations(db);
}

export async function testEmail(db) {
  const c = (await get(db, 'integration_email', {})) || {};
  const missing = ['smtpHost', 'smtpPort', 'sender'].filter((f) => !c[f]);
  if (missing.length) return { ok: false, status: 'failed', message: `Missing: ${missing.join(', ')}` };
  // Real SMTP send requires a mail library (nodemailer) — wire it in production.
  return { ok: true, status: process.env.GST_SMTP_HOST ? 'configured' : 'simulated', message: process.env.GST_SMTP_HOST ? `SMTP ${c.smtpHost}:${c.smtpPort} configured. Add a mail library to actually send.` : 'Simulation — fields valid; codes are shown on screen.' };
}

export async function testGst(db) {
  const c = (await get(db, 'integration_gst', {})) || {};
  const mode = process.env.GST_MODE || 'simulation';
  if (mode === 'live') {
    const have = !!(c.clientId && c.clientSecret);
    return { ok: have, status: have ? 'credentials present' : 'missing credentials', mode, message: have ? 'Live credentials configured. A live auth handshake will be attempted on first submission.' : 'Live mode selected but client id/secret are not set.' };
  }
  return { ok: true, status: 'simulation', mode, message: 'Simulation mode — valid-format IRN/EWB returned locally; no real submission.' };
}

// ── #11 Configuration export ───────────────────────────────────────────────
export async function exportConfig(db) {
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    company: { name: (await import('../../config/company.js')).company.name },
    roles: await q(`SELECT name, email AS login_id, role, is_active FROM users WHERE NOT coalesce(is_protected,false) ORDER BY role`),
    branches: await q(`SELECT code, name, gstin, legal_name, trade_name, state_code, is_default, is_active FROM gst_branches ORDER BY code`),
    numberSeries: await q(`SELECT s.doc_type, s.prefix, s.padding, s.next_number, s.fy_reset, s.current_fy, b.code AS branch FROM gst_number_series s LEFT JOIN gst_branches b ON b.id=s.branch_id`),
    scheduledReports: await q(`SELECT report_type, frequency, format, is_active FROM gst_scheduled_reports`),
    gstSettings: {
      mode: process.env.GST_MODE || 'simulation',
      makerChecker: (process.env.GST_MAKER_CHECKER || 'on'),
      duplicateMode: (process.env.GST_DUP_MODE || 'warn'),
      requireSecurityVerification: (process.env.GST_REQUIRE_OTP || 'on'),
      ewbExpiryHours: Number(process.env.GST_EWB_EXPIRY_HOURS || 24),
      draftStaleDays: Number(process.env.GST_DRAFT_STALE_DAYS || 3),
    },
    branding: await get(db, 'branding', {}),
    notificationRules: { ewbExpiryHours: Number(process.env.GST_EWB_EXPIRY_HOURS || 24), draftStaleDays: Number(process.env.GST_DRAFT_STALE_DAYS || 3) },
    maintenance: await getMaintenanceMode(db),
  };
}
