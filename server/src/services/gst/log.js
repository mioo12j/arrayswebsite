// ============================================================================
//  GST logging — immutable API log + audit timeline.
//  Both target tables are append-only (DB triggers block UPDATE/DELETE).
// ============================================================================

import crypto from 'node:crypto';
import { pool } from '../../config/db.js';

export const sha256 = (data) =>
  crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');

// Record one API request/response pair. Never throws into the caller path —
// logging failure must not mask the real result, but we DO surface it to stderr.
export async function recordApiLog(db, {
  objectType, objectId, env, action, requestPayload, responsePayload,
  responseStatus, httpStatus, errorCode, errorMessage, idempotencyKey, durationMs, userId,
}) {
  try {
    const reqHash = requestPayload ? sha256(requestPayload) : null;
    const { rows } = await db.query(
      `INSERT INTO gst_api_logs
        (object_type, object_id, env, action, request_payload, request_hash,
         response_payload, response_status, http_status, error_code, error_message,
         idempotency_key, duration_ms, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        objectType, objectId || null, env || null, action,
        requestPayload ? JSON.stringify(requestPayload) : null, reqHash,
        responsePayload ? JSON.stringify(responsePayload) : null,
        responseStatus || null, httpStatus || null, errorCode || null, errorMessage || null,
        idempotencyKey || null, durationMs || null, userId || null,
      ]
    );
    return rows[0].id;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[gst] api-log write failed:', e.message);
    return null;
  }
}

// Security / access trail — who viewed, downloaded, exported, printed; with IP.
export async function recordAccess(req, { action, objectType, objectId, detail } = {}) {
  try {
    const ip = (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || null;
    await pool.query(
      `INSERT INTO gst_access_logs (user_id, session_id, ip, user_agent, action, object_type, object_id, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.user?.id || null, req.headers?.['x-session-id'] || null, ip,
        req.headers?.['user-agent'] || null, action, objectType || null, objectId || null,
        detail ? JSON.stringify(detail) : null,
      ]
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[gst] access-log write failed:', e.message);
  }
}

// Append an audit-timeline event (old → new value, actor, action).
export async function recordAudit(db, {
  objectType, objectId, eventType, field, oldValue, newValue, message, userId,
}) {
  try {
    await db.query(
      `INSERT INTO gst_audit_events
        (object_type, object_id, event_type, field, old_value, new_value, message, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        objectType, objectId, eventType, field || null,
        oldValue == null ? null : String(oldValue),
        newValue == null ? null : String(newValue),
        message || null, userId || null,
      ]
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[gst] audit write failed:', e.message);
  }
}
