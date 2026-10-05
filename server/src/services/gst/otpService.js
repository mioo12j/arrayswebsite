// ============================================================================
//  #1 Enhanced security verification for critical, legally-sensitive actions.
//
//  Flow:  password re-authentication  →  email verification code  →  action.
//  Includes code expiry, resend cooldown, max retries, temporary lockout, and
//  IP / device / session capture. Every attempt is written to the immutable
//  audit trail.
//
//  SIMULATION: there is no real email channel, so the code is returned in the
//  response (clearly labelled). In live mode, send it by email and stop
//  returning `devCode`.
// ============================================================================

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ApiError } from '../../utils/asyncHandler.js';
import { recordAudit } from './log.js';

const TTL_MIN = Number(process.env.GST_OTP_TTL_MIN || 5);
const COOLDOWN_SEC = Number(process.env.GST_OTP_COOLDOWN_SEC || 30);
const MAX_ATTEMPTS = Number(process.env.GST_OTP_MAX_ATTEMPTS || 5);
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function isEnabled() {
  return String(process.env.GST_REQUIRE_OTP || 'on').toLowerCase() !== 'off';
}

const ipOf = (req) => (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || null;
const deviceOf = (req) => String(req.headers?.['user-agent'] || 'unknown').slice(0, 200);

// Step 1+2 combined request: verify password, then issue the email code.
export async function request(db, { action, objectType, objectId, reason, password } = {}, req) {
  if (!action) throw new ApiError(400, 'An action is required.');
  if (!password) throw new ApiError(400, 'Your account password is required to start verification.');

  // Resend cooldown — block rapid re-requests for the same action.
  const recent = (await db.query(
    `SELECT created_at FROM gst_otp_challenges WHERE user_id=$1 AND action=$2 AND status='pending'
     ORDER BY created_at DESC LIMIT 1`, [req.user.id, action])).rows[0];
  if (recent && (Date.now() - new Date(recent.created_at).getTime()) < COOLDOWN_SEC * 1000) {
    throw new ApiError(429, `Please wait ${COOLDOWN_SEC}s before requesting another code.`);
  }

  // Step 1 — password re-authentication.
  const u = (await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
  const ok = u && await bcrypt.compare(password, u.password_hash);
  if (!ok) {
    await recordAudit(db, { objectType: objectType || 'system', objectId: objectId || req.user.id, eventType: 'security_password_failed', message: `Password re-auth FAILED for ${action} (from ${ipOf(req) || '?'})`, userId: req.user.id });
    throw new ApiError(401, 'Password is incorrect.');
  }

  // Step 2 — issue the email verification code.
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const { rows } = await db.query(
    `INSERT INTO gst_otp_challenges (user_id, action, object_type, object_id, reason, code_hash, ip, device, channel, password_ok, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'email',TRUE, now() + ($9 || ' minutes')::interval) RETURNING id, expires_at`,
    [req.user.id, action, objectType || null, objectId || null, reason || null, hash(code), ipOf(req), deviceOf(req), String(TTL_MIN)]
  );
  await recordAudit(db, { objectType: objectType || 'system', objectId: objectId || rows[0].id, eventType: 'security_code_sent', message: `Password verified; email code issued for ${action}${reason ? ` — ${reason}` : ''} (from ${ipOf(req) || '?'})`, userId: req.user.id });
  return { challengeId: rows[0].id, expiresAt: rows[0].expires_at, devCode: code, simulated: true, channel: 'email' };
}

export async function verify(db, { challengeId, code }, req) {
  const ch = (await db.query('SELECT * FROM gst_otp_challenges WHERE id=$1 AND user_id=$2 FOR UPDATE', [challengeId, req.user.id])).rows[0];
  if (!ch) throw new ApiError(404, 'Verification challenge not found.');
  if (ch.status === 'used') throw new ApiError(409, 'This verification was already used.');
  if (ch.status === 'locked') throw new ApiError(423, 'Locked due to too many incorrect attempts. Start again.');
  if (new Date(ch.expires_at) < new Date()) { await db.query("UPDATE gst_otp_challenges SET status='expired' WHERE id=$1", [challengeId]); throw new ApiError(410, 'Code has expired. Request a new one.'); }

  if (ch.code_hash !== hash(code)) {
    const attempts = (ch.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.query("UPDATE gst_otp_challenges SET attempts=$2, status='locked' WHERE id=$1", [challengeId, attempts]);
      await recordAudit(db, { objectType: ch.object_type || 'system', objectId: ch.object_id || ch.id, eventType: 'security_locked', message: `Verification LOCKED after ${attempts} failed attempts for ${ch.action} (from ${ipOf(req) || '?'})`, userId: req.user.id });
      throw new ApiError(423, 'Too many incorrect attempts — locked. Please start again.');
    }
    await db.query('UPDATE gst_otp_challenges SET attempts=$2 WHERE id=$1', [challengeId, attempts]);
    await recordAudit(db, { objectType: ch.object_type || 'system', objectId: ch.object_id || ch.id, eventType: 'security_code_failed', message: `Incorrect code (attempt ${attempts}/${MAX_ATTEMPTS}) for ${ch.action}`, userId: req.user.id });
    throw new ApiError(401, `Incorrect code. ${MAX_ATTEMPTS - attempts} attempt(s) left.`);
  }

  await db.query("UPDATE gst_otp_challenges SET status='verified', verified_at=now() WHERE id=$1", [challengeId]);
  await recordAudit(db, { objectType: ch.object_type || 'system', objectId: ch.object_id || ch.id, eventType: 'security_verified', message: `Security verification passed for ${ch.action}`, userId: req.user.id });
  return { token: challengeId, verified: true };
}

// Gate a critical action: requires a verified, unused challenge for this exact
// action/user. Throws 428 (needs verification) otherwise. Consumes on success.
export async function assertForAction(db, { token, action, userId }) {
  if (!isEnabled()) return;
  if (!token) throw new ApiError(428, `Security verification is required for this action (${action}).`, 'SECURITY_REQUIRED');
  const ch = (await db.query('SELECT * FROM gst_otp_challenges WHERE id=$1 AND user_id=$2 FOR UPDATE', [token, userId])).rows[0];
  if (!ch || ch.action !== action) throw new ApiError(428, 'Verification does not match this action. Verify again.', 'SECURITY_REQUIRED');
  if (ch.status !== 'verified') throw new ApiError(428, 'Not verified yet.', 'SECURITY_REQUIRED');
  if (new Date(ch.expires_at) < new Date()) throw new ApiError(410, 'Verification expired. Verify again.');
  await db.query("UPDATE gst_otp_challenges SET status='used' WHERE id=$1", [token]);
}
