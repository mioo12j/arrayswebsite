import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { adminOnly } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate, adminOnly);

// GET /api/audit?entity=&action=&limit=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { entity, action } = req.query;
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const clauses = [];
    const p = [];
    if (entity) { p.push(entity); clauses.push(`entity=$${p.length}`); }
    if (action) { p.push(action); clauses.push(`action=$${p.length}`); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    p.push(limit);
    const { rows } = await query(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT $${p.length}`,
      p
    );
    res.json(rows);
  })
);

export default router;
