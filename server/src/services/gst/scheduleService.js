// ============================================================================
//  #13 Scheduled reports. Config + a due-runner. Because this app runs locally
//  (no always-on cron daemon), runDue() is invoked lazily when the schedules
//  page loads and can also be called from a cron / `npm run` task. Each run is
//  recorded; reports can also be generated/downloaded on demand.
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { REPORTS } from './reportService.js';
import { recordAudit } from './log.js';

function nextRun(frequency, from = new Date()) {
  const d = new Date(from);
  if (frequency === 'daily') d.setDate(d.getDate() + 1);
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1); // monthly
  d.setHours(6, 0, 0, 0);
  return d;
}

export async function list(db) {
  const { rows } = await db.query(
    `SELECT s.*, b.code AS branch_code, u.name AS by_name,
            (SELECT count(*) FROM gst_report_runs r WHERE r.schedule_id=s.id) AS run_count,
            (SELECT max(generated_at) FROM gst_report_runs r WHERE r.schedule_id=s.id) AS last_generated
     FROM gst_scheduled_reports s
     LEFT JOIN gst_branches b ON b.id=s.branch_id
     LEFT JOIN users u ON u.id=s.created_by
     ORDER BY s.created_at DESC`);
  return rows;
}

export async function create(db, body, userId) {
  if (!REPORTS[body.reportType]) throw new ApiError(400, 'Unknown report type.');
  const freq = ['daily', 'weekly', 'monthly'].includes(body.frequency) ? body.frequency : 'monthly';
  const { rows } = await db.query(
    `INSERT INTO gst_scheduled_reports (report_type, frequency, format, branch_id, recipients, is_active, next_run_at, created_by)
     VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7) RETURNING *`,
    [body.reportType, freq, body.format || 'xlsx', body.branchId || null, body.recipients ? JSON.stringify(body.recipients) : null, nextRun(freq), userId]
  );
  await recordAudit(db, { objectType: 'schedule', objectId: rows[0].id, eventType: 'created', message: `Scheduled ${body.reportType} (${freq})`, userId });
  return rows[0];
}

export async function update(db, id, body, userId) {
  const { rows } = await db.query(
    `UPDATE gst_scheduled_reports SET
       frequency=COALESCE($2,frequency), format=COALESCE($3,format), branch_id=COALESCE($4,branch_id),
       is_active=COALESCE($5,is_active), updated_at=now() WHERE id=$1 RETURNING *`,
    [id, body.frequency ?? null, body.format ?? null, body.branchId ?? null, body.isActive ?? null]);
  if (!rows[0]) throw new ApiError(404, 'Schedule not found');
  await recordAudit(db, { objectType: 'schedule', objectId: id, eventType: 'edited', message: 'Schedule updated', userId });
  return rows[0];
}

export async function remove(db, id, userId) {
  await db.query('DELETE FROM gst_scheduled_reports WHERE id=$1', [id]);
  await recordAudit(db, { objectType: 'schedule', objectId: id, eventType: 'deleted', message: 'Schedule removed', userId });
  return { ok: true };
}

async function generate(db, schedule, userId) {
  const def = REPORTS[schedule.report_type];
  if (!def) return null;
  const rows = await def.fn(db);
  const { rows: run } = await db.query(
    `INSERT INTO gst_report_runs (schedule_id, report_type, row_count, status) VALUES ($1,$2,$3,'success') RETURNING *`,
    [schedule.id, schedule.report_type, rows.length]);
  await db.query('UPDATE gst_scheduled_reports SET last_run_at=now(), next_run_at=$2 WHERE id=$1', [schedule.id, nextRun(schedule.frequency)]);
  await recordAudit(db, { objectType: 'schedule', objectId: schedule.id, eventType: 'report_generated', message: `Generated ${schedule.report_type} (${rows.length} rows)`, userId });
  return run[0];
}

export async function runNow(db, id, userId) {
  const { rows } = await db.query('SELECT * FROM gst_scheduled_reports WHERE id=$1', [id]);
  if (!rows[0]) throw new ApiError(404, 'Schedule not found');
  return generate(db, rows[0], userId);
}

// Run all schedules whose next_run_at has passed (or is unset). Returns count.
export async function runDue(db, userId = null) {
  const { rows } = await db.query(`SELECT * FROM gst_scheduled_reports WHERE is_active=TRUE AND (next_run_at IS NULL OR next_run_at <= now())`);
  let ran = 0;
  for (const s of rows) { await generate(db, s, userId); ran++; }
  return { ran };
}

export async function runs(db, scheduleId) {
  const { rows } = await db.query('SELECT * FROM gst_report_runs WHERE schedule_id=$1 ORDER BY generated_at DESC LIMIT 50', [scheduleId]);
  return rows;
}
