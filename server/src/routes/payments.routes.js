import { Router } from 'express';
import { query, withTransaction, pool } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { noImportForAdmin, denyWriteForAdmin } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';
import { upload } from '../middleware/upload.js';
import { saveDocument } from '../services/document.service.js';
import { parsePaymentFields, extractText } from '../services/ocr.service.js';
import { removeLedgerForSource } from '../services/ledger.service.js';
import { autoMapVendor } from '../services/vendor-match.service.js';
import { isOwnAccount } from '../services/ownAccountsService.js';
import * as paymentSvc from '../services/paymentService.js';
import * as allocSvc from '../services/allocationService.js';

const router = Router();
router.use(authenticate, denyWriteForAdmin);   // admin is view-only

// Post the payment as a debit to its payee ledger (employee if set, else vendor).
const postPaymentLedger = paymentSvc.postPaymentLedger;

// Find an existing (non-deleted) payment with the same bank reference/UTR — the
// core duplicate-screenshot / re-import guard. Blank references never match.
async function findDuplicatePayment(db, referenceId, excludeId = null) {
  const ref = String(referenceId || '').trim();
  if (!ref) return null;
  const { rows } = await db.query(
    `SELECT id, amount, payment_date, beneficiary_name FROM payments
      WHERE is_deleted=FALSE AND reference_id IS NOT NULL AND TRIM(reference_id) <> ''
        AND lower(trim(reference_id)) = lower($1) AND ($2::uuid IS NULL OR id <> $2)
      LIMIT 1`,
    [ref, excludeId]
  );
  return rows[0] || null;
}

// Payments never carry operating income; the operating kinds here are:
//   'expense' (default, hits vendor ledger) | 'internal_transfer' | 'financing'
//   'duplicate' — a repeat of another payment (e.g. the same statement debit
//   captured twice): kept and still linked to its statement line so the statement
//   stays reconciled, but counted NOWHERE (no ledger, excluded from every total).
const PAYMENT_KINDS = new Set(['expense', 'internal_transfer', 'financing', 'duplicate']);

// ── Step 1: Upload proof & auto-extract (OCR) ───────────────────────────────
// POST /api/payments/extract   (multipart: file)
// Returns parsed fields + the stored document id. The operator then reviews/
// corrects the fields and POSTs to /api/payments to save.
router.post(
  '/extract',
  noImportForAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'A payment proof file is required');
    const text = await extractText(req.file.path, req.file.mimetype);
    const fields = parsePaymentFields(text);
    const doc = await saveDocument({
      file: req.file,
      kind: 'payment_proof',
      userId: req.user.id,
    });
    // attach ocr text to the doc record
    await query('UPDATE documents SET ocr_text=$1, ocr_json=$2 WHERE id=$3', [
      text, JSON.stringify(fields), doc.id,
    ]);
    // Suggest a vendor from the Vendor Master (account or fuzzy name)
    const suggested = await autoMapVendor(pool, {
      accountNumber: fields.account_details, beneficiary: fields.beneficiary_name,
    });
    // Warn if this UTR/reference was already saved (duplicate screenshot guard).
    const duplicate = await findDuplicatePayment(pool, fields.reference_id);
    // Flag if the counterparty is one of our own accounts (internal transfer).
    const ownTransfer = await isOwnAccount(pool, {
      accountNumber: fields.account_details, name: fields.beneficiary_name,
    });
    res.json({
      document_id: doc.id, extracted: fields, suggested_vendor: suggested,
      duplicate, own_transfer: ownTransfer,
      ocr_preview: (text || '').slice(0, 600),
    });
  })
);

// ── Step 2: Save the verified payment ───────────────────────────────────────
// POST /api/payments
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};

    // Mandatory operator comment — business meaning lives here.
    if (!b.comment || !String(b.comment).trim()) {
      throw new ApiError(400, 'An additional comment is mandatory before saving a payment');
    }
    if (!b.amount || Number(b.amount) <= 0) {
      throw new ApiError(400, 'A valid amount is required');
    }
    const txnKind = PAYMENT_KINDS.has(b.txn_kind) ? b.txn_kind : 'expense';
    const isExpense = txnKind === 'expense';

    // Duplicate-screenshot / re-import guard: block on a repeated UTR unless the
    // operator explicitly overrides (override_duplicate=true).
    if (!b.override_duplicate) {
      const dup = await findDuplicatePayment(pool, b.reference_id);
      if (dup) {
        throw new ApiError(409, `This reference/UTR is already saved as a payment on ${dup.payment_date || 'an earlier date'} (${dup.beneficiary_name || 'unknown payee'}). Re-save only if it is genuinely a different transaction.`);
      }
    }

    const payment = await withTransaction(async (db) => {
      // Party mapping & ledger only apply to real operating expenses. Internal
      // transfers / financing move between your own accounts — no vendor, no
      // ledger, and they are excluded from the expense totals.
      if (isExpense) {
        if (b.payee_type === 'employee' && !b.employee_id) {
          // Paying an employee not yet in the master → create them automatically.
          const emp = await paymentSvc.findOrCreateEmployee(db, b.beneficiary_name);
          if (emp) b.employee_id = emp.id;
        } else if (!b.vendor_id && !b.employee_id) {
          // Auto-map a vendor if neither vendor nor employee was picked.
          const m = await autoMapVendor(db, {
            accountNumber: b.account_details, beneficiary: b.beneficiary_name,
          });
          if (m) b.vendor_id = m.vendor_id;
        }
      } else {
        b.vendor_id = null; b.employee_id = null;
      }
      const { rows } = await db.query(
        `INSERT INTO payments
          (reference_id, amount, payment_date, beneficiary_name, account_details,
           bank_remarks, comment, payment_mode, network_type,
           project_id, site_id, vendor_id, employee_id, category_id, material_type, tags,
           invoice_status, proof_document_id, source, txn_kind, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'neft')::payment_mode,$9,
                 $10,$11,$12,$13,$14,$15,$16,
                 COALESCE($17,'pending')::invoice_link,$18,'manual',$19,$20)
         RETURNING *`,
        [
          b.reference_id, b.amount, b.payment_date || null, b.beneficiary_name, b.account_details,
          b.bank_remarks, b.comment.trim(), b.payment_mode, b.network_type,
          b.project_id || null, b.site_id || null, b.vendor_id || null, b.employee_id || null,
          b.category_id || null, b.material_type, b.tags || [],
          b.invoice_status, b.proof_document_id || null, txnKind, req.user.id,
        ]
      );
      const created = rows[0];

      // Link the proof document to this payment
      if (created.proof_document_id) {
        await db.query(
          `UPDATE documents SET entity='payments', entity_id=$1 WHERE id=$2`,
          [created.id, created.proof_document_id]
        );
      }

      // Automation: post a debit to the payee ledger (employee takes priority,
      // else vendor) — only for real operating expenses.
      if (isExpense) await postPaymentLedger(db, created, req.user.id);
      return created;
    });

    await audit(req, { action: 'create', entity: 'payments', entityId: payment.id, changes: b });
    res.status(201).json(payment);
  })
);

// ── List with filters ───────────────────────────────────────────────────────
// GET /api/payments?search=&project_id=&vendor_id=&site_id=&invoice_status=&from=&to=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, project_id, vendor_id, site_id, category_id, invoice_status, from, to } = req.query;
    const clauses = ['p.is_deleted=FALSE'];
    const p = [];
    if (search) { p.push(`%${search}%`); clauses.push(`(p.reference_id ILIKE $${p.length} OR p.beneficiary_name ILIKE $${p.length} OR p.comment ILIKE $${p.length} OR p.bank_remarks ILIKE $${p.length} OR v.name ILIKE $${p.length})`); }
    if (project_id) { p.push(project_id); clauses.push(`p.project_id=$${p.length}`); }
    if (vendor_id) { p.push(vendor_id); clauses.push(`p.vendor_id=$${p.length}`); }
    if (site_id) { p.push(site_id); clauses.push(`p.site_id=$${p.length}`); }
    if (category_id) { p.push(category_id); clauses.push(`p.category_id=$${p.length}`); }
    if (invoice_status) { p.push(invoice_status); clauses.push(`p.invoice_status=$${p.length}`); }
    if (from) { p.push(from); clauses.push(`p.payment_date >= $${p.length}`); }
    if (to) { p.push(to); clauses.push(`p.payment_date <= $${p.length}`); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT p.*,
        v.name AS vendor_name, e.name AS employee_name, pr.name AS project_name, s.name AS site_name,
        ec.name AS category_name
       FROM payments p
       LEFT JOIN vendors v ON v.id=p.vendor_id
       LEFT JOIN employees e ON e.id=p.employee_id
       LEFT JOIN projects pr ON pr.id=p.project_id
       LEFT JOIN sites s ON s.id=p.site_id
       LEFT JOIN expense_categories ec ON ec.id=p.category_id
       ${whereSql}
       ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC
       LIMIT 500`,
      p
    );
    res.json(rows);
  })
);

// GET /api/payments/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT p.*, v.name AS vendor_name, pr.name AS project_name, s.name AS site_name,
        ec.name AS category_name,
        d.original_name AS proof_name, d.stored_name AS proof_file
       FROM payments p
       LEFT JOIN vendors v ON v.id=p.vendor_id
       LEFT JOIN projects pr ON pr.id=p.project_id
       LEFT JOIN sites s ON s.id=p.site_id
       LEFT JOIN expense_categories ec ON ec.id=p.category_id
       LEFT JOIN documents d ON d.id=p.proof_document_id
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Payment not found');
    res.json(rows[0]);
  })
);

// PATCH /api/payments/:id  (re-classify; re-posts ledger if vendor/amount change)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (b.comment !== undefined && !String(b.comment).trim()) {
      throw new ApiError(400, 'Comment cannot be empty');
    }
    const updated = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `UPDATE payments SET
          reference_id=COALESCE($1,reference_id), amount=COALESCE($2,amount),
          payment_date=COALESCE($3,payment_date), beneficiary_name=COALESCE($4,beneficiary_name),
          account_details=COALESCE($5,account_details), bank_remarks=COALESCE($6,bank_remarks),
          comment=COALESCE($7,comment), payment_mode=COALESCE($8::payment_mode,payment_mode),
          network_type=COALESCE($9,network_type), project_id=COALESCE($10,project_id),
          site_id=COALESCE($11,site_id), vendor_id=COALESCE($12,vendor_id),
          category_id=COALESCE($13,category_id), material_type=COALESCE($14,material_type),
          tags=COALESCE($15,tags), employee_id=COALESCE($17,employee_id),
          txn_kind=COALESCE($18,txn_kind)
         WHERE id=$16 RETURNING *`,
        [b.reference_id, b.amount, b.payment_date, b.beneficiary_name, b.account_details,
         b.bank_remarks, b.comment, b.payment_mode, b.network_type, b.project_id,
         b.site_id, b.vendor_id, b.category_id, b.material_type, b.tags, req.params.id, b.employee_id,
         PAYMENT_KINDS.has(b.txn_kind) ? b.txn_kind : null]
      );
      if (!rows[0]) throw new ApiError(404, 'Payment not found');
      const pay = rows[0];
      // Rebuild the payee ledger entry — only real expenses hit a party ledger.
      await removeLedgerForSource(db, 'payment', pay.id);
      if (pay.txn_kind === 'expense') await postPaymentLedger(db, pay, req.user.id);
      return pay;
    });
    await audit(req, { action: 'update', entity: 'payments', entityId: req.params.id, changes: b });
    res.json(updated);
  })
);

// POST /api/payments/:id/invoice  (attach an invoice document later)
router.post(
  '/:id/invoice',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Invoice file is required');
    const doc = await saveDocument({
      file: req.file, kind: 'invoice', entity: 'payments', entityId: req.params.id,
      userId: req.user.id, runOcr: false,
    });
    const { rows } = await query(
      `UPDATE payments SET invoice_status='attached' WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Payment not found');
    await audit(req, { action: 'upload', entity: 'payments', entityId: req.params.id, changes: { invoice: doc.original_name } });
    res.json({ payment: rows[0], document: doc });
  })
);

// DELETE /api/payments/:id  — soft delete (recoverable from the Recovery Center)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const out = await withTransaction(async (db) => paymentSvc.softDelete(db, req.params.id, req.user.id));
    if (!out) throw new ApiError(404, 'Payment not found');
    await audit(req, { action: 'delete', entity: 'payments', entityId: req.params.id });
    res.json({ ok: true });
  })
);

// POST /api/payments/:id/restore  — restore a soft-deleted payment
router.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const out = await withTransaction(async (db) => paymentSvc.restore(db, req.params.id, req.user.id));
    if (!out) throw new ApiError(404, 'Payment not found');
    await audit(req, { action: 'restore', entity: 'payments', entityId: req.params.id });
    res.json({ ok: true, restored: out });
  })
);

// ── Allocation / tagging — only the separate allocation table is changed; the
//    payment's amount/date/transaction-id/vendor stay locked. ───────────────
router.get(
  '/:id/allocations',
  asyncHandler(async (req, res) => res.json(await allocSvc.getPaymentAllocations({ query }, req.params.id)))
);
router.put(
  '/:id/allocations',
  asyncHandler(async (req, res) => {
    const pay = (await query('SELECT amount, is_deleted FROM payments WHERE id=$1', [req.params.id])).rows[0];
    if (!pay || pay.is_deleted) throw new ApiError(404, 'Payment not found');
    const out = await withTransaction((db) => allocSvc.setPaymentAllocations(db, req.params.id, req.body?.items || [], pay.amount));
    await audit(req, { action: 'allocate', entity: 'payments', entityId: req.params.id, changes: { count: (req.body?.items || []).length } });
    res.json(out);
  })
);

export default router;
