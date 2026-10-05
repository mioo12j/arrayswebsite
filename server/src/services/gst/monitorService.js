// ============================================================================
//  API Health & Monitoring  +  Global Activity Timeline
//  Both read over the immutable logs we already keep (gst_api_logs,
//  gst_audit_events, gst_access_logs) — nothing new is written here.
// ============================================================================

import { getMode } from './adapter.js';

export async function apiHealth(db) {
  const totals = (await db.query(
    `SELECT count(*) total,
            count(*) FILTER (WHERE response_status='accepted') accepted,
            count(*) FILTER (WHERE response_status='rejected') rejected,
            count(*) FILTER (WHERE response_status='unknown') unknown,
            round(avg(duration_ms)) avg_ms,
            max(created_at) FILTER (WHERE response_status='accepted') last_success,
            max(created_at) FILTER (WHERE response_status='rejected') last_failure
     FROM gst_api_logs`)).rows[0];

  const byAction = (await db.query(
    `SELECT action,
            count(*) total,
            count(*) FILTER (WHERE response_status='accepted') ok,
            count(*) FILTER (WHERE response_status='rejected') failed,
            round(avg(duration_ms)) avg_ms
     FROM gst_api_logs GROUP BY action ORDER BY total DESC`)).rows;

  const errors = (await db.query(
    `SELECT coalesce(error_code,'(none)') error_code, count(*) count
     FROM gst_api_logs WHERE response_status='rejected' GROUP BY 1 ORDER BY count DESC LIMIT 15`)).rows;

  const recentFailures = (await db.query(
    `SELECT created_at, object_type, action, error_code, error_message FROM gst_api_logs
     WHERE response_status='rejected' ORDER BY created_at DESC LIMIT 10`)).rows;

  const trend = (await db.query(
    `SELECT to_char(date_trunc('day', created_at),'DD Mon') daylabel, date_trunc('day',created_at) dord,
            count(*) calls, round(avg(duration_ms)) avg_ms,
            count(*) FILTER (WHERE response_status='rejected') failures
     FROM gst_api_logs WHERE created_at >= now() - interval '14 days'
     GROUP BY 1,2 ORDER BY 2`)).rows;

  const mode = getMode();
  const total = Number(totals.total) || 0;
  const failed = Number(totals.rejected) || 0;
  const recentlyFailing = totals.last_failure && (!totals.last_success || new Date(totals.last_failure) > new Date(totals.last_success));
  const conn = (kind) => mode === 'live'
    ? (recentlyFailing ? 'Degraded' : (total ? 'Connected' : 'Unknown'))
    : 'Simulated';

  // Pending submissions (drafts/validated with no IRN) + EWB not generated.
  const pending = (await db.query(
    `SELECT (SELECT count(*) FROM gst_einvoices WHERE is_deleted=FALSE AND irn IS NULL AND NOT is_cancelled AND status IN ('validated','pending_submission')) einv,
            (SELECT count(*) FROM gst_eway_bills WHERE is_deleted=FALSE AND ewb_no IS NULL AND NOT is_cancelled AND status IN ('validated')) ewb`)).rows[0];

  return {
    mode,
    irpStatus: conn('irp'),
    ewbStatus: conn('ewb'),
    lastSuccess: totals.last_success,
    lastFailure: totals.last_failure,
    totalCalls: total,
    accepted: Number(totals.accepted) || 0,
    rejected: failed,
    unknown: Number(totals.unknown) || 0,
    avgMs: Number(totals.avg_ms) || 0,
    successRatio: total ? Math.round(((total - failed) / total) * 100) : 100,
    pendingSubmissions: { einvoice: Number(pending.einv) || 0, ewb: Number(pending.ewb) || 0 },
    byAction,
    errorDistribution: errors,
    recentFailures,
    trend: trend.map((t) => ({ day: t.daylabel, calls: Number(t.calls), avgMs: Number(t.avg_ms) || 0, failures: Number(t.failures) })),
  };
}

// Unified, filterable activity stream across the whole GST module.
export async function activity(db, { from, to, objectType, user, search, source, limit = 500 } = {}) {
  const p = [from || null, to || null, objectType || null, user ? `%${user}%` : null, search ? `%${search}%` : null, source || null, Math.min(Number(limit) || 500, 2000)];
  const { rows } = await db.query(
    `WITH stream AS (
       SELECT a.created_at AS ts, 'audit' AS source, u.name AS actor, a.object_type, a.object_id::text AS object_id, a.event_type AS action, a.message AS detail
         FROM gst_audit_events a LEFT JOIN users u ON u.id=a.user_id
       UNION ALL
       SELECT l.created_at, 'access', u.name, l.object_type, l.object_id::text, l.action, coalesce(l.detail->>'kind', l.detail->>'report', l.detail->>'action', l.action)
         FROM gst_access_logs l LEFT JOIN users u ON u.id=l.user_id
       UNION ALL
       SELECT g.created_at, 'api', u.name, g.object_type, g.object_id::text, g.action, (g.response_status || coalesce(' '||g.error_code,''))
         FROM gst_api_logs g LEFT JOIN users u ON u.id=g.user_id
     )
     SELECT * FROM stream
      WHERE ($1::timestamptz IS NULL OR ts >= $1)
        AND ($2::timestamptz IS NULL OR ts <= $2)
        AND ($3::text IS NULL OR object_type = $3)
        AND ($4::text IS NULL OR actor ILIKE $4)
        AND ($5::text IS NULL OR detail ILIKE $5 OR action ILIKE $5)
        AND ($6::text IS NULL OR source = $6)
      ORDER BY ts DESC
      LIMIT $7`, p);
  return rows;
}

// Flat rows for export.
export async function activityRows(db, filters) {
  const rows = await activity(db, { ...filters, limit: 5000 });
  return rows.map((r) => ({ When: r.ts, Source: r.source, By: r.actor, Object: r.object_type, Action: r.action, Detail: r.detail }));
}
