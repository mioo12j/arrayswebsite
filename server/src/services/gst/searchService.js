// ============================================================================
//  #4 Global Universal Search — one query across every major business object.
//  Returns a unified, ranked result list for a Google-like experience.
// ============================================================================

export async function search(db, q, { limit = 30, branchId } = {}) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const out = [];
  const run = async (sql, params, map) => { try { (await db.query(sql, params)).rows.forEach((r) => out.push(map(r))); } catch { /* ignore */ } };
  const bf = branchId ? 'AND (branch_id=$2 OR branch_id IS NULL)' : '';
  const bp = branchId ? [like, branchId] : [like];

  await run(
    `SELECT id, doc_no, irn, ack_no, buyer_name, buyer_gstin, status FROM gst_einvoices
     WHERE is_deleted=FALSE AND (doc_no ILIKE $1 OR irn ILIKE $1 OR ack_no ILIKE $1 OR buyer_name ILIKE $1 OR buyer_gstin ILIKE $1) ${bf} LIMIT 6`,
    bp, (r) => ({ type: 'e-Invoice', id: r.id, label: r.doc_no || r.irn?.slice(0, 12), sublabel: `${r.buyer_name || ''} ${r.buyer_gstin || ''}`.trim(), status: r.status, link: '/gst/compliance' }));

  await run(
    `SELECT id, ewb_no, doc_no, vehicle_no, transporter_name, to_gstin, status FROM gst_eway_bills
     WHERE is_deleted=FALSE AND (ewb_no ILIKE $1 OR doc_no ILIKE $1 OR vehicle_no ILIKE $1 OR transporter_name ILIKE $1 OR to_gstin ILIKE $1) ${bf} LIMIT 6`,
    bp, (r) => ({ type: 'e-Way Bill', id: r.id, label: r.ewb_no || r.doc_no, sublabel: `${r.vehicle_no || ''} ${r.transporter_name || ''}`.trim(), status: r.status, link: '/gst/compliance' }));

  await run(`SELECT id, name, gstin FROM clients WHERE name ILIKE $1 OR gstin ILIKE $1 LIMIT 5`, [like],
    (r) => ({ type: 'Customer', id: r.id, label: r.name, sublabel: r.gstin || '', link: `/clients/${r.id}` }));
  await run(`SELECT id, name, gstin FROM vendors WHERE name ILIKE $1 OR gstin ILIKE $1 LIMIT 5`, [like],
    (r) => ({ type: 'Vendor', id: r.id, label: r.name, sublabel: r.gstin || '', link: `/vendors/${r.id}` }));
  await run(`SELECT id, invoice_number, status FROM invoices WHERE invoice_number ILIKE $1 AND is_deleted=FALSE LIMIT 5`, [like],
    (r) => ({ type: 'Invoice', id: r.id, label: r.invoice_number, status: r.status, link: '/invoices' }));
  await run(`SELECT id, code, name, gstin FROM gst_branches WHERE code ILIKE $1 OR name ILIKE $1 OR gstin ILIKE $1 LIMIT 5`, [like],
    (r) => ({ type: 'Branch', id: r.id, label: `${r.code} — ${r.name}`, sublabel: r.gstin || '', link: '/gst/branches' }));
  await run(`SELECT id, name, email, role FROM users WHERE NOT coalesce(is_protected,false) AND (name ILIKE $1 OR email ILIKE $1) LIMIT 5`, [like],
    (r) => ({ type: 'User', id: r.id, label: r.name, sublabel: `${r.email} · ${r.role}`, link: '/users' }));
  await run(`SELECT id, original_name, object_type FROM gst_attachments WHERE original_name ILIKE $1 LIMIT 5`, [like],
    (r) => ({ type: 'Attachment', id: r.id, label: r.original_name, sublabel: `on ${r.object_type}`, link: '/gst/compliance' }));
  await run(`SELECT id, content, object_type FROM gst_comments WHERE content ILIKE $1 LIMIT 5`, [like],
    (r) => ({ type: 'Comment', id: r.id, label: r.content.slice(0, 60), sublabel: `on ${r.object_type}`, link: '/gst/compliance' }));
  await run(`SELECT id, message, object_type, created_at FROM gst_audit_events WHERE message ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [like],
    (r) => ({ type: 'Audit', id: r.id, label: r.message?.slice(0, 60), sublabel: new Date(r.created_at).toLocaleDateString('en-GB'), link: '/gst/activity' }));

  // crude ranking: exact-ish label matches first
  const t = term.toLowerCase();
  out.sort((a, b) => (String(b.label || '').toLowerCase().includes(t) ? 1 : 0) - (String(a.label || '').toLowerCase().includes(t) ? 1 : 0));
  return out.slice(0, limit);
}
