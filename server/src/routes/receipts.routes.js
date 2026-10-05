import { Router } from 'express';
import { query, withTransaction, pool } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { noImportForAdmin, denyWriteForAdmin } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';
import { upload } from '../middleware/upload.js';
import { saveDocument } from '../services/document.service.js';
import { parseReceiptFields, extractText } from '../services/ocr.service.js';
import { postLedgerEntry, removeLedgerForSource, refreshInvoiceStatus } from '../services/ledger.service.js';
import { isOwnAccount } from '../services/ownAccountsService.js';
import * as receiptSvc from '../services/receiptService.js';
import * as allocSvc from '../services/allocationService.js';

const router = Router();
router.use(authenticate, denyWriteForAdmin);   // admin is view-only

// Only 'income' is real operating revenue (credits a client). The rest are
// excluded from the income totals and never touch a client ledger. 'duplicate'
// keeps a repeat receipt linked to its statement line but counts it nowhere.
const RECEIPT_KINDS = new Set(['income', 'internal_transfer', 'financing', 'refund', 'duplicate']);

// Duplicate-screenshot / re-import guard for incoming credits.
async function findDuplicateReceipt(db, referenceId, excludeId = null) {
  const ref = String(referenceId || '').trim();
  if (!ref) return null;
  const { rows } = await db.query(
    `SELECT id, credited_amount, credited_date FROM receipts
      WHERE is_deleted=FALSE AND reference_id IS NOT NULL AND TRIM(reference_id) <> ''
        AND lower(trim(reference_id)) = lower($1) AND ($2::uuid IS NULL OR id <> $2)
      LIMIT 1`,
    [ref, excludeId]
  );
  return rows[0] || null;
}

// ── Upload proof & extract ──────────────────────────────────────────────────
router.post(
  '/extract',
  noImportForAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'A receipt proof file is required');
    const text = await extractText(req.file.path, req.file.mimetype);
    const fields = parseReceiptFields(text);
    const doc = await saveDocument({ file: req.file, kind: 'receipt_proof', userId: req.user.id });
    await query('UPDATE documents SET ocr_text=$1, ocr_json=$2 WHERE id=$3', [
      text, JSON.stringify(fields), doc.id,
    ]);
    const duplicate = await findDuplicateReceipt(pool, fields.reference_id);
    const ownTransfer = await isOwnAccount(pool, { accountNumber: fields.account_details });
    res.json({
      document_id: doc.id, extracted: fields, duplicate, own_transfer: ownTransfer,
      ocr_preview: (text || '').slice(0, 600),
    });
  })
);

// ── Save receipt ────────────────────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.credited_amount || Number(b.credited_amount) <= 0) {
      throw new ApiError(400, 'A valid credited amount is required');
    }
    const txnKind = RECEIPT_KINDS.has(b.txn_kind) ? b.txn_kind : 'income';
    const isIncome = txnKind === 'income';
    const isRefund = txnKind === 'refund';
    // A client is only meaningful for real income; a refund points at a vendor;
    // internal transfers / financing take neither party.
    if (isIncome && !b.client_id) throw new ApiError(400, 'A client must be selected');
    if (isRefund && !b.vendor_id) throw new ApiError(400, 'Select the vendor this refund came from');

    if (!b.override_duplicate) {
      const dup = await findDuplicateReceipt(pool, b.reference_id);
      if (dup) {
        throw new ApiError(409, `This reference/UTR is already saved as a receipt on ${dup.credited_date || 'an earlier date'}. Re-save only if it is genuinely a different transaction.`);
      }
    }

    const receipt = await withTransaction(async (db) => {
      const clientId = isIncome ? b.client_id : null;
      const vendorId = isRefund ? b.vendor_id : null;
      const { rows } = await db.query(
        `INSERT INTO receipts
          (reference_id, credited_amount, credited_date, account_details, client_id, vendor_id,
           invoice_id, project_id, site_id, deduction_amount, deduction_reason,
           tds_amount, retention_amount, comment, proof_document_id, source, txn_kind, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'manual',$16,$17)
         RETURNING *`,
        [b.reference_id, b.credited_amount, b.credited_date || null, b.account_details, clientId, vendorId,
         b.invoice_id || null, b.project_id || null, b.site_id || null,
         b.deduction_amount || 0, b.deduction_reason, b.tds_amount || 0, b.retention_amount || 0,
         b.comment, b.proof_document_id || null, txnKind, req.user.id]
      );
      const created = rows[0];

      if (created.proof_document_id) {
        await db.query(`UPDATE documents SET entity='receipts', entity_id=$1 WHERE id=$2`,
          [created.id, created.proof_document_id]);
      }

      // Automation: income → credit the client ledger by the full settled value;
      // refund → credit the vendor ledger; transfers/financing → no party ledger.
      await receiptSvc.postForKind(db, created, req.user.id);
      if (isIncome && created.invoice_id) await refreshInvoiceStatus(db, created.invoice_id);

      return created;
    });

    await audit(req, { action: 'create', entity: 'receipts', entityId: receipt.id, changes: b });
    res.status(201).json(receipt);
  })
);

// ── List ────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, client_id, project_id, from, to } = req.query;
    const clauses = ['r.is_deleted=FALSE'];
    const p = [];
    if (search) { p.push(`%${search}%`); clauses.push(`(r.reference_id ILIKE $${p.length} OR r.comment ILIKE $${p.length})`); }
    if (client_id) { p.push(client_id); clauses.push(`r.client_id=$${p.length}`); }
    if (project_id) { p.push(project_id); clauses.push(`r.project_id=$${p.length}`); }
    if (from) { p.push(from); clauses.push(`r.credited_date >= $${p.length}`); }
    if (to) { p.push(to); clauses.push(`r.credited_date <= $${p.length}`); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT r.*, c.name AS client_name, v.name AS vendor_name, pr.name AS project_name, i.invoice_number
       FROM receipts r
       LEFT JOIN clients c ON c.id=r.client_id
       LEFT JOIN vendors v ON v.id=r.vendor_id
       LEFT JOIN projects pr ON pr.id=r.project_id
       LEFT JOIN invoices i ON i.id=r.invoice_id
       ${whereSql}
       ORDER BY r.credited_date DESC NULLS LAST, r.created_at DESC
       LIMIT 500`,
      p
    );
    res.json(rows);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const updated = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `UPDATE receipts SET
          reference_id=COALESCE($1,reference_id), credited_amount=COALESCE($2,credited_amount),
          credited_date=COALESCE($3,credited_date), account_details=COALESCE($4,account_details),
          client_id=COALESCE($5,client_id), invoice_id=COALESCE($6,invoice_id),
          project_id=COALESCE($7,project_id), site_id=COALESCE($8,site_id),
          deduction_amount=COALESCE($9,deduction_amount), deduction_reason=COALESCE($10,deduction_reason),
          tds_amount=COALESCE($11,tds_amount), retention_amount=COALESCE($12,retention_amount),
          comment=COALESCE($13,comment), txn_kind=COALESCE($15,txn_kind), vendor_id=COALESCE($16,vendor_id)
         WHERE id=$14 RETURNING *`,
        [b.reference_id, b.credited_amount, b.credited_date, b.account_details, b.client_id,
         b.invoice_id, b.project_id, b.site_id, b.deduction_amount, b.deduction_reason,
         b.tds_amount, b.retention_amount, b.comment, req.params.id,
         RECEIPT_KINDS.has(b.txn_kind) ? b.txn_kind : null, b.vendor_id ?? null]
      );
      if (!rows[0]) throw new ApiError(404, 'Receipt not found');
      const r = rows[0];
      await removeLedgerForSource(db, 'receipt', r.id);
      // income → client ledger, refund → vendor ledger, others → none.
      await receiptSvc.postForKind(db, r, req.user.id);
      if (r.txn_kind === 'income' && r.invoice_id) await refreshInvoiceStatus(db, r.invoice_id);
      return r;
    });
    await audit(req, { action: 'update', entity: 'receipts', entityId: req.params.id, changes: b });
    res.json(updated);
  })
);

// Soft delete — recoverable from the System Recovery Center.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const out = await withTransaction(async (db) => receiptSvc.softDelete(db, req.params.id, req.user.id));
    if (!out) throw new ApiError(404, 'Receipt not found');
    await audit(req, { action: 'delete', entity: 'receipts', entityId: req.params.id });
    res.json({ ok: true });
  })
);

// Restore a soft-deleted receipt.
router.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const out = await withTransaction(async (db) => receiptSvc.restore(db, req.params.id, req.user.id));
    if (!out) throw new ApiError(404, 'Receipt not found');
    await audit(req, { action: 'restore', entity: 'receipts', entityId: req.params.id });
    res.json({ ok: true, restored: out });
  })
);

// ── Allocation / tagging — only touches the separate allocation table, never
//    the receipt's amount/date/reference/party. ─────────────────────────────
router.get(
  '/:id/allocations',
  asyncHandler(async (req, res) => res.json(await allocSvc.getReceiptAllocations({ query }, req.params.id)))
);
router.put(
  '/:id/allocations',
  asyncHandler(async (req, res) => {
    const rc = (await query('SELECT credited_amount, is_deleted FROM receipts WHERE id=$1', [req.params.id])).rows[0];
    if (!rc || rc.is_deleted) throw new ApiError(404, 'Receipt not found');
    const out = await withTransaction((db) => allocSvc.setReceiptAllocations(db, req.params.id, req.body?.items || [], rc.credited_amount));
    await audit(req, { action: 'allocate', entity: 'receipts', entityId: req.params.id, changes: { count: (req.body?.items || []).length } });
    res.json(out);
  })
);

export default router;
