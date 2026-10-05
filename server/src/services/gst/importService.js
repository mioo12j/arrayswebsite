// ============================================================================
//  #14 Data import wizard (server side).
//  The client parses CSV/JSON and previews; here we validate each row and import
//  the good ones, optionally skipping bad rows, and record an audit summary.
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';
import { isValidGstin } from './validation.js';
import { recordAudit } from './log.js';

const ENTITIES = {
  // entity -> { required:[], validate(row)->errors[], insert(db,row) }
  clients: {
    label: 'Customers',
    columns: ['name', 'gstin', 'contact_name', 'phone', 'email', 'address', 'opening_balance'],
    validate(r) {
      const e = [];
      if (!r.name || !String(r.name).trim()) e.push('name is required');
      if (r.gstin && !isValidGstin(String(r.gstin).trim().toUpperCase())) e.push('GSTIN is invalid (format/checksum)');
      if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) e.push('email looks invalid');
      return e;
    },
    async insert(db, r) {
      await db.query(
        `INSERT INTO clients (name, gstin, contact_name, phone, email, address, opening_balance)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [String(r.name).trim(), r.gstin ? String(r.gstin).trim().toUpperCase() : null, r.contact_name || null, r.phone || null, r.email || null, r.address || null, Number(r.opening_balance) || 0]
      );
    },
  },
};

export function entityMeta() {
  return Object.entries(ENTITIES).map(([key, v]) => ({ key, label: v.label, columns: v.columns }));
}

// Dry-run validation (no writes) — powers the wizard preview.
export function previewRows(entity, rows = []) {
  const def = ENTITIES[entity];
  if (!def) throw new ApiError(400, 'Unknown import entity.');
  return rows.map((r, i) => ({ row: i + 1, data: r, errors: def.validate(r) }));
}

export async function run(db, { entity, rows = [], skipInvalid = true }, userId) {
  const def = ENTITIES[entity];
  if (!def) throw new ApiError(400, 'Unknown import entity.');
  let imported = 0; let skipped = 0; const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const errs = def.validate(rows[i]);
    if (errs.length) {
      if (!skipInvalid) throw new ApiError(422, `Row ${i + 1}: ${errs.join('; ')}`);
      skipped++; errors.push({ row: i + 1, errors: errs }); continue;
    }
    try { await def.insert(db, rows[i]); imported++; }
    catch (e) { skipped++; errors.push({ row: i + 1, errors: [e.message] }); }
  }
  const { rows: rec } = await db.query(
    `INSERT INTO gst_imports (entity, total_rows, imported, skipped, errors, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'completed',$6) RETURNING id`,
    [entity, rows.length, imported, skipped, JSON.stringify(errors.slice(0, 200)), userId]
  );
  await recordAudit(db, { objectType: 'import', objectId: rec[0].id, eventType: 'imported', message: `Imported ${imported}/${rows.length} ${entity} (${skipped} skipped)`, userId });
  return { entity, total: rows.length, imported, skipped, errors };
}

export async function history(db) {
  const { rows } = await db.query(
    `SELECT i.*, u.name AS by_name FROM gst_imports i LEFT JOIN users u ON u.id=i.created_by ORDER BY created_at DESC LIMIT 50`);
  return rows;
}
