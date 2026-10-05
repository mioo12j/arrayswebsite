import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { denyWriteForAdmin } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate, denyWriteForAdmin);   // admin is view-only

// List with balances (salary / advance payouts)
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      SELECT e.*, b.balance, b.total_paid
      FROM employees e
      LEFT JOIN v_employee_balances b ON b.employee_id = e.id
      ORDER BY e.name
    `);
    res.json(rows);
  })
);

// Employee ledger (running balance)
router.get(
  '/:id/ledger',
  asyncHandler(async (req, res) => {
    const { rows: emp } = await query('SELECT * FROM employees WHERE id=$1', [req.params.id]);
    if (!emp[0]) throw new ApiError(404, 'Employee not found');

    const { rows: entries } = await query(
      `SELECT le.*, p.name AS project_name
       FROM ledger_entries le
       LEFT JOIN projects p ON p.id = le.project_id
       WHERE le.party_type='employee' AND le.party_id=$1
       ORDER BY le.entry_date, le.created_at`,
      [req.params.id]
    );
    let bal = emp[0].opening_balance || 0;
    const ledger = entries.map((e) => {
      bal += e.direction === 'credit' ? e.amount : -e.amount;
      return { ...e, running_balance: bal };
    });
    const { rows: bView } = await query('SELECT * FROM v_employee_balances WHERE employee_id=$1', [req.params.id]);
    res.json({
      employee: emp[0],
      summary: bView[0] || { balance: emp[0].opening_balance || 0, total_paid: 0 },
      entries: ledger,
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) throw new ApiError(400, 'Employee name is required');
    const { rows } = await query(
      `INSERT INTO employees (name, employee_code, designation, department, phone, email, bank_account, ifsc, opening_balance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.name, b.employee_code, b.designation, b.department, b.phone, b.email, b.bank_account, b.ifsc, b.opening_balance || 0, b.notes]
    );
    await audit(req, { action: 'create', entity: 'employees', entityId: rows[0].id, changes: b });
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE employees SET
        name=COALESCE($1,name), employee_code=COALESCE($2,employee_code), designation=COALESCE($3,designation),
        department=COALESCE($4,department), phone=COALESCE($5,phone), email=COALESCE($6,email),
        bank_account=COALESCE($7,bank_account), ifsc=COALESCE($8,ifsc),
        opening_balance=COALESCE($9,opening_balance), is_active=COALESCE($10,is_active), notes=COALESCE($11,notes)
       WHERE id=$12 RETURNING *`,
      [b.name, b.employee_code, b.designation, b.department, b.phone, b.email, b.bank_account, b.ifsc, b.opening_balance, b.is_active, b.notes, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Employee not found');
    await audit(req, { action: 'update', entity: 'employees', entityId: req.params.id, changes: b });
    res.json(rows[0]);
  })
);

export default router;
