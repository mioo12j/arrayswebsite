import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { signToken } from '../utils/token.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new ApiError(400, 'Email and password are required');

    const { rows } = await query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user || !user.is_active) throw new ApiError(401, 'Invalid credentials');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new ApiError(401, 'Invalid credentials');

    await query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
    // Attach the resolved user so audit() records who logged in (real req keeps ip/headers).
    req.user = { id: user.id, name: user.name, role: user.role, email: user.email };
    await audit(req, { action: 'login', entity: 'users', entityId: user.id });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, name, email, role, last_login_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!rows[0]) throw new ApiError(404, 'User not found');
    res.json({ user: rows[0] });
  })
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6)
      throw new ApiError(400, 'New password must be at least 6 characters');
    const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const ok = await bcrypt.compare(currentPassword || '', rows[0].password_hash);
    if (!ok) throw new ApiError(400, 'Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    await audit(req, { action: 'update', entity: 'users', entityId: req.user.id, changes: { password: 'changed' } });
    res.json({ ok: true });
  })
);

// POST /api/auth/verify-password — confirm the signed-in user's own login
// password (used to gate revealing stored secrets, e.g. the portal password).
router.post(
  '/verify-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { password } = req.body || {};
    const { rows } = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const ok = rows[0] && (await bcrypt.compare(password || '', rows[0].password_hash));
    if (!ok) throw new ApiError(401, 'Password is incorrect');
    res.json({ ok: true });
  })
);

export default router;
