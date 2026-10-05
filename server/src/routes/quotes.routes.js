import { Router } from 'express';
import { query, withTransaction, pool } from '../config/db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { denyWriteForAdmin } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';
import { calculateQuote } from '../services/quote-calc.service.js';
import { streamQuotePdf } from '../services/quote-pdf.service.js';
import { renderProposal, renderThankYou, renderFaq, renderCover, PROPOSAL_BRAND, registerFonts } from '../services/proposal-pdf.service.js';
import { renderQuotation, renderBOQ, renderScope } from '../services/quote-docs.service.js';
import { renderQuoteDocxBuffer, docxFilename } from '../services/quote-docx.service.js';
import PDFDocument from 'pdfkit';
import * as branding from '../services/gst/brandingService.js';
import * as branchSvc from '../services/gst/branchService.js';
import { todayIST } from '../services/gst/util.js';

const router = Router();
router.use(authenticate, denyWriteForAdmin);   // admin is view-only

async function nextQuoteNumber() {
  const yr = new Date().getFullYear();
  const { rows } = await query(
    `SELECT COUNT(*)::int AS c FROM quotes WHERE quote_number LIKE $1`,
    [`QT-${yr}-%`]
  );
  return `QT-${yr}-${String(rows[0].c + 1).padStart(4, '0')}`;
}

// Live calculation preview (no persistence) — powers the builder UI.
router.post(
  '/calculate',
  asyncHandler(async (req, res) => {
    res.json(calculateQuote(req.body || {}));
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, status, trash } = req.query;
    const clauses = [];
    const p = [];
    // Trash view lists soft-deleted quotes; the normal list hides them.
    clauses.push(trash === '1' || trash === 'true' ? 'q.deleted_at IS NOT NULL' : 'q.deleted_at IS NULL');
    if (search) { p.push(`%${search}%`); clauses.push(`(q.quote_number ILIKE $${p.length} OR q.client_name ILIKE $${p.length})`); }
    if (status) { p.push(status); clauses.push(`q.status=$${p.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT q.id, q.quote_number, q.version, q.status, q.client_name, q.project_type,
              q.capacity_kw, q.total_amount, q.margin_amount, q.cost_amount, q.per_watt,
              q.issue_date, q.valid_until, q.deleted_at, c.name AS client_full_name
       FROM quotes q LEFT JOIN clients c ON c.id=q.client_id
       ${where} ORDER BY q.created_at DESC LIMIT 500`,
      p
    );
    res.json(rows);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT q.*, c.name AS client_full_name FROM quotes q
       LEFT JOIN clients c ON c.id=q.client_id WHERE q.id=$1`, [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Quote not found');
    res.json(rows[0]);
  })
);

function buildRow(b) {
  const calc = calculateQuote(b);
  return { calc };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.capacity_kw || Number(b.capacity_kw) <= 0) throw new ApiError(400, 'A valid system size (kW) is required');
    const { calc } = buildRow(b);
    const number = b.quote_number || (await nextQuoteNumber());
    const { rows } = await query(
      `INSERT INTO quotes
        (quote_number, version, status, client_id, client_name, project_id, project_name, site_name, project_type,
         capacity_kw, location, issue_date, valid_until, inputs, proposal_inputs, line_items,
         subtotal, contingency_amount, margin_amount, taxable_amount, gst_amount, total_amount,
         cost_amount, per_watt, subsidy_amount, net_cost, annual_savings, payback_years, lifetime_savings,
         notes, terms, exclusions, branch_id, created_by)
       VALUES ($1,1,COALESCE($2,'draft')::quote_status,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
       RETURNING *`,
      [number, b.status, b.client_id || null, b.client_name, b.project_id || null, b.project_name, b.site_name, calc.project_type,
       calc.capacity_kw, b.location, b.issue_date || todayIST(), b.valid_until || null,
       JSON.stringify(calc.inputs), JSON.stringify(b.proposal_inputs || {}), JSON.stringify(calc.line_items),
       calc.subtotal, calc.contingency_amount, calc.margin_amount, calc.taxable_amount, calc.gst_amount,
       calc.total_amount, calc.cost_amount, calc.per_watt, calc.subsidy_amount, calc.net_cost,
       calc.annual_savings, calc.payback_years, calc.lifetime_savings,
       b.notes, b.terms, b.exclusions, b.branch_id || null, req.user.id]
    );
    await audit(req, { action: 'create', entity: 'quotes', entityId: rows[0].id, changes: { quote_number: number } });
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const { rows: existing } = await query('SELECT * FROM quotes WHERE id=$1', [req.params.id]);
    if (!existing[0]) throw new ApiError(404, 'Quote not found');
    // Recalculate from merged inputs so totals always stay consistent.
    const merged = { ...existing[0].inputs, ...b, capacity_kw: b.capacity_kw ?? existing[0].capacity_kw, project_type: b.project_type ?? existing[0].project_type };
    const calc = calculateQuote(merged);
    const { rows } = await query(
      `UPDATE quotes SET
         status=COALESCE($1,status)::quote_status, client_id=COALESCE($2,client_id), client_name=COALESCE($3,client_name),
         project_type=$4, capacity_kw=$5, location=COALESCE($6,location), valid_until=COALESCE($7,valid_until),
         inputs=$8, line_items=$9, subtotal=$10, contingency_amount=$11, margin_amount=$12,
         taxable_amount=$13, gst_amount=$14, total_amount=$15, cost_amount=$16, per_watt=$17,
         notes=COALESCE($18,notes), terms=COALESCE($19,terms), exclusions=COALESCE($20,exclusions),
         project_name=COALESCE($21,project_name), site_name=COALESCE($22,site_name),
         subsidy_amount=$23, net_cost=$24, annual_savings=$25, payback_years=$26, lifetime_savings=$27,
         branch_id=COALESCE($28,branch_id),
         proposal_inputs=COALESCE($30::jsonb, proposal_inputs)
       WHERE id=$29 RETURNING *`,
      [b.status, b.client_id, b.client_name, calc.project_type, calc.capacity_kw, b.location, b.valid_until,
       JSON.stringify(calc.inputs), JSON.stringify(calc.line_items), calc.subtotal, calc.contingency_amount,
       calc.margin_amount, calc.taxable_amount, calc.gst_amount, calc.total_amount, calc.cost_amount,
       calc.per_watt, b.notes, b.terms, b.exclusions, b.project_name, b.site_name,
       calc.subsidy_amount, calc.net_cost, calc.annual_savings, calc.payback_years, calc.lifetime_savings,
       b.branch_id || null, req.params.id,
       b.proposal_inputs ? JSON.stringify(b.proposal_inputs) : null]
    );
    await audit(req, { action: 'update', entity: 'quotes', entityId: req.params.id, changes: b });
    res.json(rows[0]);
  })
);

// Create a new revision (version+1) of an existing quote.
router.post(
  '/:id/revise',
  asyncHandler(async (req, res) => {
    const revised = await withTransaction(async (db) => {
      const { rows: e } = await db.query('SELECT * FROM quotes WHERE id=$1', [req.params.id]);
      if (!e[0]) throw new ApiError(404, 'Quote not found');
      const src = e[0];
      await db.query(`UPDATE quotes SET status='revised' WHERE id=$1`, [src.id]);
      const { rows } = await db.query(
        `INSERT INTO quotes
          (quote_number, version, parent_id, status, client_id, client_name, project_id, project_type,
           capacity_kw, location, issue_date, valid_until, inputs, line_items,
           subtotal, contingency_amount, margin_amount, taxable_amount, gst_amount, total_amount,
           cost_amount, per_watt, notes, terms, exclusions, branch_id, created_by)
         SELECT quote_number, version+1, $1, 'draft', client_id, client_name, project_id, project_type,
           capacity_kw, location, CURRENT_DATE, valid_until, inputs, line_items,
           subtotal, contingency_amount, margin_amount, taxable_amount, gst_amount, total_amount,
           cost_amount, per_watt, notes, terms, exclusions, branch_id, $2
         FROM quotes WHERE id=$3 RETURNING *`,
        [src.parent_id || src.id, req.user.id, src.id]
      );
      return rows[0];
    });
    await audit(req, { action: 'create', entity: 'quotes', entityId: revised.id, changes: { revisedFrom: req.params.id } });
    res.status(201).json(revised);
  })
);

// Duplicate a quote into a brand-new, independent quotation (fresh number,
// version 1, draft, not linked to the source or any project) — for quickly
// making a similar quote and editing a few things. Carries everything over,
// including proposal_inputs (system config, margin distribution, terms…).
router.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const dup = await withTransaction(async (db) => {
      const { rows: e } = await db.query('SELECT id FROM quotes WHERE id=$1', [req.params.id]);
      if (!e[0]) throw new ApiError(404, 'Quote not found');
      const number = await nextQuoteNumber();
      const { rows } = await db.query(
        `INSERT INTO quotes
          (quote_number, version, parent_id, status, client_id, client_name, project_id, project_name, site_name, project_type,
           capacity_kw, location, issue_date, valid_until, inputs, proposal_inputs, line_items,
           subtotal, contingency_amount, margin_amount, taxable_amount, gst_amount, total_amount,
           cost_amount, per_watt, subsidy_amount, net_cost, annual_savings, payback_years, lifetime_savings,
           notes, terms, exclusions, branch_id, created_by)
         SELECT $1, 1, NULL, 'draft', client_id, client_name, NULL, project_name, site_name, project_type,
           capacity_kw, location, CURRENT_DATE, valid_until, inputs, proposal_inputs, line_items,
           subtotal, contingency_amount, margin_amount, taxable_amount, gst_amount, total_amount,
           cost_amount, per_watt, subsidy_amount, net_cost, annual_savings, payback_years, lifetime_savings,
           notes, terms, exclusions, branch_id, $2
         FROM quotes WHERE id=$3 RETURNING *`,
        [number, req.user.id, req.params.id]
      );
      return rows[0];
    });
    await audit(req, { action: 'create', entity: 'quotes', entityId: dup.id, changes: { duplicatedFrom: req.params.id } });
    res.status(201).json(dup);
  })
);

router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE quotes SET status='approved', approved_by=$1, approved_at=now() WHERE id=$2 RETURNING *`,
      [req.body?.approved_by || req.user.name, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Quote not found');
    await audit(req, { action: 'update', entity: 'quotes', entityId: req.params.id, changes: { approved: true } });
    res.json(rows[0]);
  })
);

// Convert an (approved) quote into a live project for execution.
router.post(
  '/:id/convert',
  asyncHandler(async (req, res) => {
    const out = await withTransaction(async (db) => {
      const { rows: q } = await db.query('SELECT * FROM quotes WHERE id=$1', [req.params.id]);
      if (!q[0]) throw new ApiError(404, 'Quote not found');
      const quote = q[0];
      if (quote.project_id) throw new ApiError(400, 'This quote is already linked to a project');
      const { rows: proj } = await db.query(
        `INSERT INTO projects (name, client_id, client_name, capacity_kw, budget, contract_value, location, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8) RETURNING *`,
        [`${quote.client_name || 'Project'} — ${quote.capacity_kw}kW ${quote.project_type}`,
         quote.client_id, quote.client_name, quote.capacity_kw,
         quote.cost_amount, quote.total_amount, quote.location, req.user.id]
      );
      await db.query(`UPDATE quotes SET status='converted', project_id=$1 WHERE id=$2`, [proj[0].id, quote.id]);
      return proj[0];
    });
    await audit(req, { action: 'create', entity: 'projects', entityId: out.id, changes: { fromQuote: req.params.id } });
    res.status(201).json({ project: out });
  })
);

// Undo an approval / conversion — sends the quote back to 'draft' so it can be
// edited again. A remark (why) is mandatory and recorded in the audit trail.
// If the quote had been converted, the auto-created project is soft-deleted
// (moved to the Recovery Center) — but only when it has no real activity yet;
// a project that already carries invoices, ledger entries or allocations is
// kept and simply unlinked, so nothing real is lost.
router.post(
  '/:id/undo',
  asyncHandler(async (req, res) => {
    const remark = String(req.body?.remark || '').trim();
    if (!remark) throw new ApiError(400, 'Please add a remark explaining why you are undoing this.');
    const out = await withTransaction(async (db) => {
      const { rows: q } = await db.query('SELECT * FROM quotes WHERE id=$1', [req.params.id]);
      if (!q[0]) throw new ApiError(404, 'Quote not found');
      const quote = q[0];
      if (!['approved', 'converted'].includes(quote.status)) {
        throw new ApiError(400, 'Only an approved or converted quote can be undone.');
      }
      let projectRemoved = null, projectKept = null;
      if (quote.project_id) {
        const { rows: dep } = await db.query(
          `SELECT
             (SELECT COUNT(*) FROM invoices WHERE project_id=$1 AND is_deleted=FALSE)
           + (SELECT COUNT(*) FROM ledger_entries WHERE project_id=$1)
           + (SELECT COUNT(*) FROM outgoing_payment_allocations WHERE project_id=$1)
           + (SELECT COUNT(*) FROM incoming_payment_allocations WHERE project_id=$1) AS n`,
          [quote.project_id]
        );
        if (Number(dep[0].n) > 0) {
          projectKept = quote.project_id;   // has activity — keep it, just unlink
        } else {
          await db.query(
            'UPDATE projects SET is_deleted=TRUE, deleted_at=now(), deleted_by=$2 WHERE id=$1 AND is_deleted=FALSE',
            [quote.project_id, req.user.id]
          );
          projectRemoved = quote.project_id;
        }
      }
      const { rows } = await db.query(
        `UPDATE quotes SET status='draft', approved_by=NULL, approved_at=NULL, project_id=NULL WHERE id=$1 RETURNING *`,
        [quote.id]
      );
      return { quote: rows[0], prevStatus: quote.status, projectRemoved, projectKept };
    });
    await audit(req, {
      action: 'update', entity: 'quotes', entityId: req.params.id,
      changes: { undo: out.prevStatus, remark, projectRemoved: out.projectRemoved, projectKept: out.projectKept },
    });
    res.json(out);
  })
);

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT q.*, c.name AS client_full_name FROM quotes q LEFT JOIN clients c ON c.id=q.client_id WHERE q.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Quote not found');
    const quote = { ...rows[0], client_name: rows[0].client_name || rows[0].client_full_name };
    let brand = {};
    try { brand = await branding.getForBranch(pool, rows[0].branch_id); } catch { /* branding optional */ }
    if (rows[0].branch_id) {
      try {
        const br = await branchSvc.get(pool, rows[0].branch_id);
        const addrParts = [br.addr1, br.addr2, br.place, br.pincode].filter(Boolean);
        if (!brand.headerAddr && addrParts.length) brand.headerAddr = addrParts.join(', ');
        if (!brand.gstin) brand.gstin = br.gstin;
        if (!brand.contactInfo && br.email) brand.contactInfo = br.email;
      } catch { /* ignore */ }
    }
    streamQuotePdf(res, quote, brand, req.query.lang);
  })
);

// -----------------------------------------------------------------------------
//  Branded document suite — Proposal (brochure), Commercial Quotation, and BOQ.
//  Any combination can be downloaded as ONE PDF via /document.pdf?parts=...
//  All render in the same Arrays Ingenieria identity.
// -----------------------------------------------------------------------------
// Scope of Work is now rendered inside the Commercial Quotation, so it is no
// longer a standalone part of the package.
const DOC_ORDER = ['proposal', 'quotation', 'boq'];
const DOC_LABEL = { proposal: 'Proposal', quotation: 'Quotation', boq: 'BOQ' };

async function loadQuoteData(id) {
  const { rows } = await query(
    `SELECT q.*, c.name AS client_full_name,
            b.gstin AS branch_gstin, b.legal_name AS branch_legal, b.trade_name AS branch_trade,
            b.name AS branch_name, b.place AS branch_place, b.state_code AS branch_state_code
     FROM quotes q
     LEFT JOIN clients c ON c.id=q.client_id
     LEFT JOIN gst_branches b ON b.id=q.branch_id
     WHERE q.id=$1`,
    [id]
  );
  if (!rows[0]) throw new ApiError(404, 'Quote not found');
  const q = rows[0];
  // GST identity comes from the selected office/branch.
  const office = {
    company_gstin: q.branch_gstin || null,
    company_name: q.branch_legal || q.branch_trade || 'Arrays Ingenieria Pvt. Ltd.',
    office_place: q.branch_place || null,
    office_name: q.branch_name || null,
  };
  // Merge rate inputs (tariff, yield, wattage…), the quote, then proposal_inputs
  // so the PDF can read the operator's own tariff/generation/brand fields.
  return { q, data: { ...(q.inputs || {}), ...q, ...(q.proposal_inputs || {}), ...office, client_name: q.client_name || q.client_full_name } };
}

function streamParts(res, q, data, parts) {
  const doc = new PDFDocument({ size: 'A4', margin: PROPOSAL_BRAND.M, bufferPages: true });
  registerFonts(doc);
  doc.page.margins.bottom = 0;
  doc.on('pageAdded', () => { doc.page.margins.bottom = 0; });
  const ref = String(q.quote_number || 'quote').replace(/[^A-Za-z0-9._-]+/g, '_');
  const name = parts.length === DOC_ORDER.length ? 'Complete-Package'
    : parts.map((p) => DOC_LABEL[p]).join('-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}_${ref}.pdf"`);
  doc.pipe(res);

  const hasProposal = parts.includes('proposal');
  const extras = parts.filter((p) => p !== 'proposal');   // listed in the Contents page

  // Every pack opens with the branded cover. When the proposal is included it
  // draws its own cover as its first page; otherwise we render a standalone one.
  let started = false;
  const nextPage = () => { if (started) doc.addPage(); started = true; };
  if (!hasProposal) { renderCover(doc, data, { shared: true }); started = true; }

  parts.forEach((p) => {
    nextPage();
    if (p === 'proposal') renderProposal(doc, data, { shared: true, parts: extras, skipThankYou: true });
    else if (p === 'quotation') renderQuotation(doc, data, { shared: true });
    else if (p === 'boq') renderBOQ(doc, data, { shared: true });
    else if (p === 'scope') renderScope(doc, data, { shared: true });
  });
  // FAQ only when the proposal is included (it's part of the brochure); the
  // Thank-You page always closes every pack.
  if (hasProposal) { doc.addPage(); renderFaq(doc, data, { shared: true }); }
  doc.addPage(); renderThankYou(doc, data, { shared: true });
  doc.end();
}

// Combined / selectable download. ?parts=proposal,quotation,boq,scope (any subset).
router.get(
  '/:id/document.pdf',
  asyncHandler(async (req, res) => {
    const { q, data } = await loadQuoteData(req.params.id);
    const requested = String(req.query.parts || 'proposal,quotation,boq')
      .toLowerCase().split(',').map((s) => s.trim());
    const parts = DOC_ORDER.filter((p) => requested.includes(p));
    if (!parts.length) throw new ApiError(400, 'No valid parts requested (proposal, quotation, boq, scope)');
    streamParts(res, q, data, parts);
  })
);

// Convenience single-document routes.
router.get('/:id/proposal.pdf', asyncHandler(async (req, res) => {
  const { q, data } = await loadQuoteData(req.params.id);
  streamParts(res, q, data, ['proposal']);
}));
router.get('/:id/quotation.pdf', asyncHandler(async (req, res) => {
  const { q, data } = await loadQuoteData(req.params.id);
  streamParts(res, q, data, ['quotation']);
}));
router.get('/:id/boq.pdf', asyncHandler(async (req, res) => {
  const { q, data } = await loadQuoteData(req.params.id);
  streamParts(res, q, data, ['boq']);
}));
router.get('/:id/scope.pdf', asyncHandler(async (req, res) => {
  const { q, data } = await loadQuoteData(req.params.id);
  streamParts(res, q, data, ['scope']);
}));

// ---------------------------------------------------------------------------
//  Word (.docx) exports — deliberately limited to the two transactional
//  documents that render cleanly and are the ones operators actually edit:
//  the Commercial Quotation and the Bill of Quantities (individually, or the
//  two together). The proposal brochure and complete package stay PDF-only.
//  Built natively as editable Word (real tables/headings/text, embedded brand
//  fonts) — not an image dump.
// ---------------------------------------------------------------------------
const DOCX_PARTS = ['quotation', 'boq'];
async function streamPartsDocx(res, q, data, parts) {
  const buf = await renderQuoteDocxBuffer(data, parts);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${docxFilename(q.quote_number, parts)}"`);
  res.send(buf);
}
router.get('/:id/document.docx', asyncHandler(async (req, res) => {
  const { q, data } = await loadQuoteData(req.params.id);
  const requested = String(req.query.parts || 'quotation,boq').toLowerCase().split(',').map((s) => s.trim());
  const parts = DOCX_PARTS.filter((p) => requested.includes(p));
  if (!parts.length) throw new ApiError(400, 'Word export is available only for the Commercial Quotation and the Bill of Quantities.');
  await streamPartsDocx(res, q, data, parts);
}));
router.get('/:id/quotation.docx', asyncHandler(async (req, res) => {
  const { q, data } = await loadQuoteData(req.params.id);
  await streamPartsDocx(res, q, data, ['quotation']);
}));
router.get('/:id/boq.docx', asyncHandler(async (req, res) => {
  const { q, data } = await loadQuoteData(req.params.id);
  await streamPartsDocx(res, q, data, ['boq']);
}));

// Soft delete — moves the quote to Trash (restorable). Pass ?purge=1 to delete
// permanently (only allowed for quotes already in the Trash).
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const purge = req.query.purge === '1' || req.query.purge === 'true';
    if (purge) {
      await query('DELETE FROM quotes WHERE id=$1 AND deleted_at IS NOT NULL', [req.params.id]);
      await audit(req, { action: 'purge', entity: 'quotes', entityId: req.params.id });
    } else {
      await query('UPDATE quotes SET deleted_at=now() WHERE id=$1', [req.params.id]);
      await audit(req, { action: 'delete', entity: 'quotes', entityId: req.params.id });
    }
    res.json({ ok: true });
  })
);

// Restore a soft-deleted quote from the Trash.
router.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'UPDATE quotes SET deleted_at=NULL WHERE id=$1 RETURNING *', [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'Quote not found');
    await audit(req, { action: 'restore', entity: 'quotes', entityId: req.params.id });
    res.json(rows[0]);
  })
);

export default router;
