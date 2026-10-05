import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

// GET /api/sites?project_id=...   (flat list, for dropdowns / filters)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { project_id } = req.query;
    const { rows } = await query(
      `SELECT s.*, p.name AS project_name,
        (SELECT COALESCE(SUM(amount),0) FROM v_outgoing_alloc WHERE site_id=s.id) AS site_spent
       FROM sites s JOIN projects p ON p.id=s.project_id
       WHERE p.is_deleted=FALSE AND ($1::uuid IS NULL OR s.project_id=$1)
       ORDER BY p.name, s.name`,
      [project_id || null]
    );
    res.json(rows);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE sites SET
        code=COALESCE($1,code), name=COALESCE($2,name), location=COALESCE($3,location),
        latitude=COALESCE($4,latitude), longitude=COALESCE($5,longitude),
        budget=COALESCE($6,budget), status=COALESCE($7,status),
        po_number=COALESCE($9,po_number), po_date=COALESCE($10,po_date), capacity_kw=COALESCE($11,capacity_kw)
       WHERE id=$8 RETURNING *`,
      [b.code, b.name, b.location, b.latitude, b.longitude, b.budget, b.status, req.params.id,
       b.po_number, b.po_date, b.capacity_kw]
    );
    if (!rows[0]) throw new ApiError(404, 'Site not found');
    await audit(req, { action: 'update', entity: 'sites', entityId: req.params.id, changes: b });
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM sites WHERE id=$1', [req.params.id]);
    await audit(req, { action: 'delete', entity: 'sites', entityId: req.params.id });
    res.json({ ok: true });
  })
);

export default router;
