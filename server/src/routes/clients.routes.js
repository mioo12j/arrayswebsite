import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { denyWriteForAdmin } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';
import { customerGst } from '../services/gst/rollupService.js';

const router = Router();
router.use(authenticate, denyWriteForAdmin);   // admin is view-only

// GET /api/clients (with receivable summary). ?candidates=1 → auto-created only.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.query.candidates === '1' ? 'WHERE c.is_candidate = TRUE' : '';
    const { rows } = await query(`
      SELECT c.*, b.total_billed, b.total_received, b.outstanding,
        (SELECT COUNT(*) FROM invoices i WHERE i.client_id=c.id AND i.status='overdue' AND i.is_deleted=FALSE) AS overdue_invoices,
        (SELECT COUNT(*) FROM receipts r WHERE r.client_id=c.id AND r.is_deleted=FALSE) AS receipt_count
      FROM clients c
      LEFT JOIN v_client_balances b ON b.client_id=c.id
      ${where}
      ORDER BY c.is_candidate DESC, c.name
    `);
    res.json(rows);
  })
);

// GET /api/clients/:id/duplicates — likely duplicate clients (fuzzy name match).
router.get(
  '/:id/duplicates',
  asyncHandler(async (req, res) => {
    const { rows: c } = await query('SELECT id, name FROM clients WHERE id=$1', [req.params.id]);
    if (!c[0]) throw new ApiError(404, 'Client not found');
    const { rows } = await query(
      `SELECT id, name, is_candidate,
              GREATEST(similarity(name,$2), word_similarity(name,$2), word_similarity($2,name)) AS score,
              (SELECT COUNT(*) FROM receipts r WHERE r.client_id=clients.id AND r.is_deleted=FALSE) AS receipt_count
         FROM clients
        WHERE id <> $1
          AND GREATEST(similarity(name,$2), word_similarity(name,$2), word_similarity($2,name)) > 0.3
        ORDER BY score DESC LIMIT 10`,
      [req.params.id, c[0].name]
    );
    res.json(rows);
  })
);

// POST /api/clients/:id/merge { into } — repoint everything onto the survivor.
router.post(
  '/:id/merge',
  asyncHandler(async (req, res) => {
    const sourceId = req.params.id;
    const targetId = req.body?.into;
    if (!targetId) throw new ApiError(400, 'A survivor client (into) is required');
    if (targetId === sourceId) throw new ApiError(400, 'Cannot merge a client into itself');
    const out = await withTransaction(async (db) => {
      const { rows: both } = await db.query('SELECT id, name, opening_balance FROM clients WHERE id IN ($1,$2)', [sourceId, targetId]);
      const source = both.find((r) => r.id === sourceId);
      const target = both.find((r) => r.id === targetId);
      if (!source || !target) throw new ApiError(404, 'Both clients must exist');
      await db.query('UPDATE receipts SET client_id=$1 WHERE client_id=$2', [targetId, sourceId]);
      await db.query('UPDATE invoices SET client_id=$1 WHERE client_id=$2', [targetId, sourceId]);
      await db.query('UPDATE projects SET client_id=$1 WHERE client_id=$2', [targetId, sourceId]);
      await db.query("UPDATE ledger_entries SET party_id=$1 WHERE party_type='client' AND party_id=$2", [targetId, sourceId]);
      try { await db.query('UPDATE quotes SET client_id=$1 WHERE client_id=$2', [targetId, sourceId]); } catch { /* optional */ }
      if (Number(source.opening_balance) !== 0) {
        await db.query('UPDATE clients SET opening_balance = COALESCE(opening_balance,0) + $1 WHERE id=$2', [source.opening_balance, targetId]);
      }
      await db.query('DELETE FROM clients WHERE id=$1', [sourceId]);
      return { merged_from: source.name, into: target.name };
    });
    await audit(req, { action: 'merge', entity: 'clients', entityId: sourceId, changes: { into: targetId, ...out } });
    res.json({ ok: true, ...out });
  })
);

// GET /api/clients/:id/ledger
router.get(
  '/:id/ledger',
  asyncHandler(async (req, res) => {
    const { rows: client } = await query('SELECT * FROM clients WHERE id=$1', [req.params.id]);
    if (!client[0]) throw new ApiError(404, 'Client not found');

    // Resolve the invoice each entry is against: invoice entries link directly;
    // receipt entries link via receipts.invoice_id. Surfaces the invoice number
    // and the date it was raised, so a payment row shows both raised + paid dates.
    const { rows: entries } = await query(
      `SELECT le.*, p.name AS project_name,
              inv.invoice_number AS linked_invoice_no,
              inv.issue_date     AS linked_invoice_date
       FROM ledger_entries le
       LEFT JOIN projects p ON p.id = le.project_id
       LEFT JOIN receipts r ON le.source_type='receipt' AND r.id = le.source_id
       LEFT JOIN invoices inv ON inv.id = COALESCE(
           CASE WHEN le.source_type='invoice' THEN le.source_id END, r.invoice_id)
       WHERE le.party_type='client' AND le.party_id=$1
       ORDER BY le.entry_date, le.created_at`,
      [req.params.id]
    );
    let bal = client[0].opening_balance || 0;
    const ledger = entries.map((e) => {
      bal += e.direction === 'debit' ? e.amount : -e.amount; // debit = billed (increases receivable)
      return { ...e, running_balance: bal };
    });

    const { rows: invoices } = await query(
      'SELECT * FROM invoices WHERE client_id=$1 AND is_deleted=FALSE ORDER BY issue_date DESC NULLS LAST, created_at DESC',
      [req.params.id]
    );
    const { rows: bView } = await query('SELECT * FROM v_client_balances WHERE client_id=$1', [req.params.id]);

    // Read-only GST compliance rollup (linked by GSTIN); never blocks the ledger.
    let gst = null;
    try { gst = await customerGst(client[0].gstin); } catch { /* GST module optional */ }

    res.json({
      client: client[0],
      summary: bView[0] || { total_billed: 0, total_received: 0, outstanding: 0 },
      entries: ledger,
      invoices,
      gst,
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name) throw new ApiError(400, 'Client name is required');
    const { rows } = await query(
      `INSERT INTO clients (name, gstin, contact_name, phone, email, address, opening_balance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.name, b.gstin, b.contact_name, b.phone, b.email, b.address, b.opening_balance || 0, b.notes]
    );
    await audit(req, { action: 'create', entity: 'clients', entityId: rows[0].id, changes: b });
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE clients SET
        name=COALESCE($1,name), gstin=COALESCE($2,gstin), contact_name=COALESCE($3,contact_name),
        phone=COALESCE($4,phone), email=COALESCE($5,email), address=COALESCE($6,address),
        opening_balance=COALESCE($7,opening_balance), notes=COALESCE($8,notes)
       WHERE id=$9 RETURNING *`,
      [b.name, b.gstin, b.contact_name, b.phone, b.email, b.address, b.opening_balance, b.notes, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Client not found');
    await audit(req, { action: 'update', entity: 'clients', entityId: req.params.id, changes: b });
    res.json(rows[0]);
  })
);

export default router;
