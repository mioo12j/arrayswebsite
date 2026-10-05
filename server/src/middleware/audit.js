import { query } from '../config/db.js';

/**
 * Records an audit log entry. Fire-and-forget friendly but awaited where it
 * matters. Never throws to the caller — auditing must not break a request.
 */
export async function audit(req, { action, entity, entityId, changes }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, changes, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        req.user?.id || null,
        req.user?.name || null,
        action,
        entity,
        entityId != null ? String(entityId) : null,
        changes ? JSON.stringify(changes) : null,
        req.ip || req.headers?.['x-forwarded-for'] || null,
      ]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write log:', err.message);
  }
}
