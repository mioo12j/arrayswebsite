import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query('SELECT * FROM expense_categories ORDER BY kind, name');
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, kind } = req.body || {};
    if (!name) throw new ApiError(400, 'Category name is required');
    const { rows } = await query(
      `INSERT INTO expense_categories (name, kind) VALUES ($1, COALESCE($2,'expense'))
       ON CONFLICT (name) DO UPDATE SET kind=EXCLUDED.kind RETURNING *`,
      [name, kind]
    );
    res.status(201).json(rows[0]);
  })
);

export default router;
