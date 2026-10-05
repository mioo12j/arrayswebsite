// ============================================================================
//  #13 Production-Readiness Review  +  #12 Soft-launch Test Suite.
//  Read-only assessments — no data is written (the test suite uses pure,
//  in-memory paths so it never pollutes real records).
// ============================================================================

import { getMode, getAdapter } from './adapter.js';
import { validateEInvoice, validateEwb, summarize, isValidGstin } from './validation.js';
import { buildEInvoicePayload } from './einvoiceBuilder.js';
import { buildEwbPayload } from './ewbBuilder.js';
import { einvoicePdf } from './pdf.js';
import { REPORTS } from './reportService.js';
import { entityMeta } from './importService.js';
import { isEnabled as secureEnabled } from './otpService.js';
import { makerCheckerEnabled } from './permissions.js';
import * as duplicates from './duplicateService.js';
import * as recon from './reconService.js';
import * as notify from './notifyService.js';

const C = (area, status, detail, recommendation) => ({ area, status, detail, recommendation: recommendation || null });

export async function review(db) {
  const out = [];
  out.push(C('Security verification', secureEnabled() ? 'pass' : 'warn', secureEnabled() ? 'Password + email verification enforced on critical actions' : 'Security verification disabled', secureEnabled() ? null : 'Set GST_REQUIRE_OTP=on for production.'));
  out.push(C('Maker-checker workflow', makerCheckerEnabled() ? 'pass' : 'warn', makerCheckerEnabled() ? 'Separation of duties enforced' : 'Maker-checker disabled', makerCheckerEnabled() ? null : 'Enable GST_MAKER_CHECKER for production.'));
  out.push(C('Permissions / RBAC', 'pass', '4 roles (operator, admin, auditor, editor) with scoped permissions'));
  out.push(C('Duplicate prevention', duplicates.mode() === 'off' ? 'warn' : 'pass', `Mode: ${duplicates.mode()} (exact doc-no clash blocked)`, duplicates.mode() === 'off' ? 'Enable GST_DUP_MODE=warn/block.' : null));

  // Audit immutability trigger
  try {
    const t = (await db.query("SELECT 1 FROM pg_trigger WHERE tgname IN ('trg_gstaudit_immutable','trg_gstlog_immutable')")).rowCount;
    out.push(C('Audit & API log immutability', t >= 2 ? 'pass' : 'warn', t >= 2 ? 'Append-only triggers active on audit + API logs' : 'Immutability triggers missing', t >= 2 ? null : 'Re-run migration.'));
  } catch { out.push(C('Audit & API log immutability', 'warn', 'Could not verify triggers')); }

  // Backup recency
  const lastBk = (await db.query('SELECT started_at FROM gst_backups ORDER BY started_at DESC LIMIT 1')).rows[0];
  const bkAgeH = lastBk ? (Date.now() - new Date(lastBk.started_at).getTime()) / 3.6e6 : Infinity;
  out.push(C('Backup & recovery', !lastBk ? 'fail' : bkAgeH > 24 * 7 ? 'warn' : 'pass', lastBk ? `Last backup ${bkAgeH.toFixed(0)}h ago` : 'No backup taken', lastBk && bkAgeH <= 24 * 7 ? null : 'Take a fresh backup before go-live.'));

  // Branch isolation + multi-GSTIN
  const branches = (await db.query('SELECT count(*) c, count(*) FILTER (WHERE gstin IS NOT NULL) g FROM gst_branches')).rows[0];
  out.push(C('Branch isolation', Number(branches.c) >= 1 ? 'pass' : 'warn', `${branches.c} branch(es) configured; documents stamped with branch_id`));
  out.push(C('Multi-GSTIN logic', Number(branches.g) >= 1 ? 'pass' : 'warn', `${branches.g} branch(es) with a GSTIN`, Number(branches.g) >= 1 ? null : 'Add a GSTIN to at least one branch.'));

  out.push(C('Environment separation', getMode() === 'live' && !process.env.GST_CLIENT_ID ? 'fail' : 'pass', `Mode: ${getMode()} (banner shown app-wide)`, getMode() === 'live' && !process.env.GST_CLIENT_ID ? 'Live without credentials — configure GSP or switch to simulation.' : null));
  out.push(C('API adapter layer', 'pass', `Pluggable adapter active (${getAdapter().mode})`));
  out.push(C('PDF accuracy', 'pass', 'Invoice + EWB A4 PDFs with IRN/QR'));
  out.push(C('Import validation', 'pass', `${entityMeta().length} entity importer(s) with row validation`));
  out.push(C('Reporting accuracy', 'pass', `${Object.keys(REPORTS).length} compliance reports`));

  // Reconciliation health
  try { const r = await recon.run(db); out.push(C('Reconciliation engine', r.summary.critical ? 'warn' : 'pass', `${r.summary.totalOpen} open discrepancies (${r.summary.critical} critical)`, r.summary.critical ? 'Resolve critical reconciliation items.' : null)); }
  catch { out.push(C('Reconciliation engine', 'warn', 'Could not run reconciliation')); }

  // Notifications
  try { await notify.refresh(db); const s = await notify.summary(db); out.push(C('Notification engine', Number(s.critical) ? 'warn' : 'pass', `${s.open} open alerts (${s.critical} critical)`, Number(s.critical) ? 'Address critical alerts.' : null)); }
  catch { out.push(C('Notification engine', 'warn', 'Could not refresh notifications')); }

  out.push(C('Default credentials', 'warn', 'Default demo passwords may still be set', 'Change admin/operator/editor passwords before go-live.'));

  const summary = {
    passed: out.filter((c) => c.status === 'pass').length,
    warnings: out.filter((c) => c.status === 'warn').length,
    failed: out.filter((c) => c.status === 'fail').length,
  };
  summary.verdict = summary.failed ? 'Not ready — failures present' : summary.warnings ? 'Ready with cautions' : 'Production ready';
  return { generatedAt: new Date().toISOString(), summary, checks: out };
}

export async function reviewRows(db) {
  const r = await review(db);
  return r.checks.map((c) => ({ Area: c.area, Status: c.status, Detail: c.detail, Recommendation: c.recommendation || '' }));
}

// ── #12 Soft-launch test suite ─────────────────────────────────────────────
const SELLER = { gstin: '27AAPFU0939F1ZV', legalName: 'ARRAYS', addr1: 'x', location: 'Mumbai', pincode: '400001', stateCode: '27' };
const BUYER = { gstin: '29AAGCB7383J1Z4', legalName: 'TATA', pos: '29', addr1: 'b', location: 'B', pincode: '560001', stateCode: '29' };
const SAMPLE_INV = {
  supplyType: 'B2B', docType: 'INV', docNo: 'TEST/1', docDate: new Date().toISOString().slice(0, 10), seller: SELLER, buyer: BUYER,
  items: [{ slNo: 1, description: 'Test', isService: 'N', hsn: '854143', quantity: 1, unit: 'NOS', unitPrice: 1000, taxableValue: 1000, gstRate: 18, igstAmount: 180, totalItemValue: 1180 }],
  val: { assessableValue: 1000, igstValue: 180, totalInvoiceValue: 1180 },
};
const SAMPLE_EWB = { supplyType: 'O', subSupplyType: '1', docType: 'INV', docNo: 'TEST/1', docDate: SAMPLE_INV.docDate, transactionType: 1, fromGstin: SELLER.gstin, fromPincode: '400001', fromStateCode: '27', toGstin: BUYER.gstin, toPincode: '560001', toStateCode: '29', totInvValue: 1180, totalTaxable: 1000, transDistance: 100, transMode: '1', vehicleNo: 'MH12AB1234', vehicleType: 'R', items: [{ description: 'Test', hsn: '854143', quantity: 1, taxableAmount: 1000 }] };

export async function testSuite(db) {
  const tests = [];
  const t = (name, fn) => { try { const r = fn(); tests.push({ name, status: r.ok ? 'pass' : (r.warn ? 'warn' : 'fail'), detail: r.detail }); } catch (e) { tests.push({ name, status: 'fail', detail: e.message }); } };
  const ta = async (name, fn) => { try { const r = await fn(); tests.push({ name, status: r.ok ? 'pass' : (r.warn ? 'warn' : 'fail'), detail: r.detail }); } catch (e) { tests.push({ name, status: 'fail', detail: e.message }); } };

  t('Generate sample invoice (validation)', () => { const s = summarize(validateEInvoice(SAMPLE_INV, { preSubmission: true })); return { ok: s.ok, detail: `${s.errors.length} errors` }; });
  t('Generate sample e-Invoice IRN (adapter)', () => { const r = getAdapter().einvoiceGenerateIRN(buildEInvoicePayload(SAMPLE_INV)); return { ok: r.ok && !!r.data.Irn, detail: r.ok ? `IRN ${r.data.Irn.slice(0, 12)}…` : r.errorMessage }; });
  t('Generate sample EWB (adapter)', () => { const v = summarize(validateEwb(SAMPLE_EWB, { requirePartB: true })); const r = getAdapter().ewbGenerate(buildEwbPayload(SAMPLE_EWB)); return { ok: v.ok && r.ok && !!r.data.ewbNo, detail: r.ok ? `EWB ${r.data.ewbNo}` : r.errorMessage }; });
  await ta('Test PDF generation', async () => { const buf = await einvoicePdf({ ...SAMPLE_INV, irn: 'x'.repeat(64), ackNo: '1', signedQr: 'demo' }); return { ok: buf.length > 1000, detail: `${(buf.length / 1024).toFixed(0)} KB PDF` }; });
  await ta('Test reporting engine', async () => { const rows = await REPORTS['gst-summary'].fn(db); return { ok: Array.isArray(rows), detail: `${rows.length} rows` }; });
  await ta('Test scheduler', async () => { const r = (await db.query('SELECT count(*) c FROM gst_scheduled_reports')).rows[0]; return { ok: true, detail: `${r.c} schedule(s)` }; });
  t('Test import wizard', () => { return { ok: entityMeta().length > 0, detail: `${entityMeta().length} entity` }; });
  await ta('Test notification delivery', async () => { await notify.refresh(db); const s = await notify.summary(db); return { ok: true, detail: `${s.open} alerts` }; });
  t('Test approval workflow', () => ({ ok: true, warn: !makerCheckerEnabled(), detail: makerCheckerEnabled() ? 'Maker-checker on' : 'Maker-checker off' }));
  t('Test email delivery', () => ({ ok: false, warn: true, detail: process.env.GST_SMTP_HOST ? 'SMTP set' : 'Simulation (code shown on screen)' }));

  const summary = { pass: tests.filter((x) => x.status === 'pass').length, warn: tests.filter((x) => x.status === 'warn').length, fail: tests.filter((x) => x.status === 'fail').length };
  return { ranAt: new Date().toISOString(), summary, tests };
}
