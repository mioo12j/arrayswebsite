import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { denyWriteForAdmin } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate, denyWriteForAdmin);   // admin is view-only

// ── Projects ────────────────────────────────────────────────────────────────

// GET /api/projects  (with computed spend & receipts)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT p.*,
        c.name AS client_full_name,
        (SELECT COALESCE(SUM(amount),0) FROM v_outgoing_alloc WHERE project_id=p.id) AS total_spent,
        (SELECT COALESCE(SUM(amount),0) FROM v_incoming_alloc WHERE project_id=p.id) AS total_received,
        (SELECT COUNT(*) FROM sites WHERE project_id=p.id) AS site_count
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.is_deleted = FALSE
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  })
);

// GET /api/projects/:id  (detail with profitability)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT p.*, c.name AS client_full_name FROM projects p
       LEFT JOIN clients c ON c.id=p.client_id WHERE p.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Project not found');
    const project = rows[0];

    const { rows: spend } = await query(
      'SELECT COALESCE(SUM(amount),0) AS v FROM v_outgoing_alloc WHERE project_id=$1', [project.id]
    );
    const { rows: recv } = await query(
      'SELECT COALESCE(SUM(amount),0) AS v FROM v_incoming_alloc WHERE project_id=$1', [project.id]
    );
    const { rows: sites } = await query(
      `SELECT s.*,
        (SELECT COALESCE(SUM(amount),0) FROM v_outgoing_alloc WHERE site_id=s.id) AS site_spent
       FROM sites s WHERE s.project_id=$1 ORDER BY s.created_at`, [project.id]
    );

    const totalSpent = spend[0].v;
    const totalReceived = recv[0].v;

    // Payment terms / milestone schedule + rollup.
    const { rows: termRows } = await query(
      'SELECT * FROM project_payment_terms WHERE project_id=$1 ORDER BY seq, created_at', [project.id]);
    const cv = Number(project.contract_value || 0);
    const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    const paymentTerms = termRows.map((t) => ({
      ...t,
      due_amount: t.amount != null ? Number(t.amount) : r2((Number(t.percent || 0) / 100) * cv),
    }));
    const termsTotal = r2(paymentTerms.reduce((s, t) => s + t.due_amount, 0));
    const dueReleased = r2(paymentTerms.filter((t) => t.is_done).reduce((s, t) => s + t.due_amount, 0));
    const released = r2(paymentTerms.reduce((s, t) => s + Number(t.released_amount || 0), 0));

    // The source quotation (if this project was converted from one) — carries the
    // system configuration, priced BOQ, financial breakdown and savings, so the
    // project page can show the full agreed scope on demand.
    const { rows: qrows } = await query(
      `SELECT id, quote_number, status, version, capacity_kw, project_type, issue_date,
              proposal_inputs, line_items,
              subtotal, margin_amount, taxable_amount, gst_amount, total_amount,
              cost_amount, per_watt, subsidy_amount, net_cost, annual_savings, payback_years, lifetime_savings, notes
       FROM quotes WHERE project_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`, [project.id]
    );
    let quote = qrows[0] || null;
    if (quote) {
      const wp = Number(quote.capacity_kw || 0) * 1000;
      quote = { ...quote, per_watt_basic: wp > 0 ? r2(Number(quote.taxable_amount || 0) / wp) : 0 };
    }

    res.json({
      ...project,
      total_spent: totalSpent,
      total_received: totalReceived,
      budget_remaining: (project.budget || 0) - totalSpent,
      gross_margin: (project.contract_value || 0) - totalSpent,
      sites,
      payment_terms: paymentTerms,
      terms_summary: { total: termsTotal, due_released: dueReleased, released, pending_release: r2(dueReleased - released) },
      quote,
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) throw new ApiError(400, 'Project name is required');
    const { rows } = await query(
      `INSERT INTO projects
        (code, name, client_id, client_name, capacity_kw, budget, contract_value,
         location, status, start_date, end_date, notes, po_number, po_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'active'),$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [b.code, b.name, b.client_id || null, b.client_name, b.capacity_kw, b.budget || 0,
       b.contract_value || 0, b.location, b.status, b.start_date || null, b.end_date || null,
       b.notes, b.po_number || null, b.po_date || null, req.user.id]
    );
    await audit(req, { action: 'create', entity: 'projects', entityId: rows[0].id, changes: b });
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE projects SET
        code=COALESCE($1,code), name=COALESCE($2,name), client_id=COALESCE($3,client_id),
        client_name=COALESCE($4,client_name), capacity_kw=COALESCE($5,capacity_kw),
        budget=COALESCE($6,budget), contract_value=COALESCE($7,contract_value),
        location=COALESCE($8,location), status=COALESCE($9,status),
        start_date=COALESCE($10,start_date), end_date=COALESCE($11,end_date),
        notes=COALESCE($12,notes), po_number=COALESCE($14,po_number), po_date=COALESCE($15,po_date)
       WHERE id=$13 RETURNING *`,
      [b.code, b.name, b.client_id, b.client_name, b.capacity_kw, b.budget,
       b.contract_value, b.location, b.status, b.start_date, b.end_date, b.notes, req.params.id,
       b.po_number, b.po_date]
    );
    if (!rows[0]) throw new ApiError(404, 'Project not found');
    await audit(req, { action: 'update', entity: 'projects', entityId: req.params.id, changes: b });
    res.json(rows[0]);
  })
);

// Soft delete — recoverable from the System Recovery Center.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'UPDATE projects SET is_deleted=TRUE, deleted_at=now(), deleted_by=$2 WHERE id=$1 AND is_deleted=FALSE RETURNING id',
      [req.params.id, req.user.id]);
    if (!rows[0]) throw new ApiError(404, 'Project not found');
    await audit(req, { action: 'delete', entity: 'projects', entityId: req.params.id });
    res.json({ ok: true });
  })
);

// Restore a soft-deleted project.
router.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'UPDATE projects SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL WHERE id=$1 RETURNING *', [req.params.id]);
    if (!rows[0]) throw new ApiError(404, 'Project not found');
    await audit(req, { action: 'restore', entity: 'projects', entityId: req.params.id });
    res.json({ ok: true, restored: rows[0] });
  })
);

// ── Sites (nested under a project) ──────────────────────────────────────────

router.get(
  '/:id/sites',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT s.*,
        (SELECT COALESCE(SUM(amount),0) FROM v_outgoing_alloc WHERE site_id=s.id) AS site_spent
       FROM sites s WHERE s.project_id=$1 ORDER BY s.created_at`,
      [req.params.id]
    );
    res.json(rows);
  })
);

router.post(
  '/:id/sites',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) throw new ApiError(400, 'Site name is required');
    const { rows } = await query(
      `INSERT INTO sites (project_id, code, name, location, latitude, longitude, budget, status, po_number, po_date, capacity_kw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'active'),$9,$10,$11) RETURNING *`,
      [req.params.id, b.code, b.name, b.location, b.latitude || null, b.longitude || null, b.budget || 0, b.status,
       b.po_number || null, b.po_date || null, b.capacity_kw || null]
    );
    await audit(req, { action: 'create', entity: 'sites', entityId: rows[0].id, changes: b });
    res.status(201).json(rows[0]);
  })
);

// ── Project payment terms (milestone schedule) ──────────────────────────────

router.get(
  '/:id/payment-terms',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM project_payment_terms WHERE project_id=$1 ORDER BY seq, created_at', [req.params.id]);
    res.json(rows);
  })
);

router.post(
  '/:id/payment-terms',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) throw new ApiError(400, 'A milestone description is required');
    const seq = b.seq ?? (await query('SELECT COALESCE(MAX(seq),0)+1 AS n FROM project_payment_terms WHERE project_id=$1', [req.params.id])).rows[0].n;
    const { rows } = await query(
      `INSERT INTO project_payment_terms (project_id, seq, title, percent, amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, seq, b.title.trim(), b.percent ?? null, b.amount ?? null, b.notes || null]
    );
    await audit(req, { action: 'create', entity: 'project_payment_terms', entityId: rows[0].id, changes: b });
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/payment-terms/:termId',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE project_payment_terms SET
         title=COALESCE($2,title), percent=COALESCE($3,percent), amount=COALESCE($4,amount),
         is_done=COALESCE($5,is_done),
         done_at=CASE WHEN $5 IS NULL THEN done_at WHEN $5=TRUE THEN COALESCE(done_at,now()) ELSE NULL END,
         released_amount=COALESCE($6,released_amount),
         released_at=CASE WHEN $6 IS NULL THEN released_at WHEN $6>0 THEN COALESCE(released_at,now()) ELSE NULL END,
         notes=COALESCE($7,notes), seq=COALESCE($8,seq), updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.termId, b.title, b.percent, b.amount, b.is_done, b.released_amount, b.notes, b.seq]
    );
    if (!rows[0]) throw new ApiError(404, 'Payment term not found');
    await audit(req, { action: 'update', entity: 'project_payment_terms', entityId: req.params.termId, changes: b });
    res.json(rows[0]);
  })
);

router.delete(
  '/payment-terms/:termId',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM project_payment_terms WHERE id=$1', [req.params.termId]);
    await audit(req, { action: 'delete', entity: 'project_payment_terms', entityId: req.params.termId });
    res.json({ ok: true });
  })
);

export default router;
