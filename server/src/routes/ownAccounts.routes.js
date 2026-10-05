import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { denyWriteForAdmin } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';
import * as own from '../services/ownAccountsService.js';
import { removeLedgerForSource } from '../services/ledger.service.js';

const router = Router();
router.use(authenticate, denyWriteForAdmin);   // admin is view-only

// POST /api/own-accounts/reclassify — one-time cleanup: re-scan EXISTING payments
// and receipts against the Own Accounts list. Anything whose counterparty is one
// of our own accounts is re-tagged as an internal transfer (excluded from
// income/expense), its party link is cleared, and any ledger entry it wrongly
// posted is reversed. Fixes historical data recorded before Own Accounts existed.
router.post('/reclassify', asyncHandler(async (req, res) => {
  const result = await withTransaction(async (db) => {
    const matchers = await own.loadOwnAccountMatchers(db);
    if (!matchers.digits.length && !matchers.names.length) {
      return { payments: 0, receipts: 0, note: 'No own accounts configured yet.' };
    }

    // Candidate payments still tagged as real expenses.
    const { rows: pays } = await db.query(
      `SELECT id, account_details, beneficiary_name FROM payments
        WHERE is_deleted=FALSE AND txn_kind='expense'`
    );
    let pCount = 0;
    for (const p of pays) {
      if (!own.matchesOwnAccount(matchers, { accountNumber: p.account_details, name: p.beneficiary_name })) continue;
      await removeLedgerForSource(db, 'payment', p.id);
      await db.query(
        `UPDATE payments SET txn_kind='internal_transfer', vendor_id=NULL, employee_id=NULL WHERE id=$1`,
        [p.id]
      );
      pCount++;
    }

    // Candidate receipts still tagged as real income (match own account number,
    // or a linked "client" whose name is actually one of our own holder names).
    const { rows: recs } = await db.query(
      `SELECT r.id, r.account_details, c.name AS client_name
         FROM receipts r LEFT JOIN clients c ON c.id=r.client_id
        WHERE r.is_deleted=FALSE AND r.txn_kind='income'`
    );
    let rCount = 0;
    for (const r of recs) {
      if (!own.matchesOwnAccount(matchers, { accountNumber: r.account_details, name: r.client_name })) continue;
      await removeLedgerForSource(db, 'receipt', r.id);
      await db.query(
        `UPDATE receipts SET txn_kind='internal_transfer', client_id=NULL WHERE id=$1`,
        [r.id]
      );
      rCount++;
    }

    return { payments: pCount, receipts: rCount };
  });

  await audit(req, { action: 'reclassify', entity: 'own_accounts', changes: result });
  res.json(result);
}));

// GET /api/own-accounts
router.get('/', asyncHandler(async (_req, res) => {
  res.json(await own.listOwnAccounts({ query }));
}));

// POST /api/own-accounts
router.post('/', asyncHandler(async (req, res) => {
  if (!req.body?.account_number || !String(req.body.account_number).trim()) {
    throw new ApiError(400, 'An account number is required');
  }
  const row = await withTransaction((db) => own.createOwnAccount(db, req.body, req.user.id));
  await audit(req, { action: 'create', entity: 'own_accounts', entityId: row.id, changes: req.body });
  res.status(201).json(row);
}));

// PATCH /api/own-accounts/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const row = await withTransaction((db) => own.updateOwnAccount(db, req.params.id, req.body || {}));
  if (!row) throw new ApiError(404, 'Own account not found');
  await audit(req, { action: 'update', entity: 'own_accounts', entityId: req.params.id, changes: req.body });
  res.json(row);
}));

// DELETE /api/own-accounts/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const row = await withTransaction((db) => own.deleteOwnAccount(db, req.params.id));
  if (!row) throw new ApiError(404, 'Own account not found');
  await audit(req, { action: 'delete', entity: 'own_accounts', entityId: req.params.id });
  res.json({ ok: true });
}));

export default router;
