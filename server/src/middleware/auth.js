import { verifyToken } from '../utils/token.js';
import { ApiError } from '../utils/asyncHandler.js';
import { pool } from '../config/db.js';
import { cachedMode } from '../services/gst/configService.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Always allowed even under read-only / maintenance, so the system can be
// recovered (toggle the mode back) and users can authenticate.
const allowlisted = (req) => {
  const u = req.originalUrl || '';
  return u.includes('/system/maintenance') || u.includes('/gst/maintenance') || u.includes('/gst/otp/') || u.includes('/auth/');
};

// Authenticates a request via Bearer token, attaches req.user, and enforces
// system maintenance / read-only mode (#9).
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required'));
  let payload;
  try { payload = verifyToken(token); } catch { return next(new ApiError(401, 'Invalid or expired token')); }
  req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };

  try {
    const mode = await cachedMode(pool);
    if (mode === 'maintenance' && !['admin', 'editor'].includes(req.user.role) && !allowlisted(req)) {
      return next(new ApiError(503, 'The system is under maintenance. Please try again shortly.'));
    }
    if (mode === 'readonly' && MUTATING.has(req.method) && !allowlisted(req) && req.user.role !== 'editor') {
      return next(new ApiError(423, 'The system is in read-only mode — changes are temporarily disabled.'));
    }
  } catch { /* never block auth on a config lookup failure */ }

  next();
}
