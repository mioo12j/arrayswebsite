// ============================================================================
//  Business Activity Feed — a human-readable, management-friendly stream of
//  notable business events, derived from the (detailed/technical) audit log.
// ============================================================================

const CATEGORY = {
  created: ['Document', '📄'], edited: ['Document', '✏️'], printed: ['Document', '🖨️'],
  attachment_added: ['Document', '📎'], version_restored: ['Document', '↩️'],
  validated: ['Compliance', '✔️'], irn_generated: ['Compliance', '🧾'], generated: ['Compliance', '🚚'],
  part_b_updated: ['Compliance', '🚚'], extended: ['Compliance', '⏱️'], cancelled: ['Compliance', '⛔'],
  rejected: ['Compliance', '⛔'], closed: ['Compliance', '✅'], reconciliation: ['Compliance', '🔁'],
  comment_added: ['Collaboration', '💬'], discussion_resolved: ['Collaboration', '✅'],
  security_verified: ['Security', '🔐'], security_locked: ['Security', '🚫'], otp_requested: ['Security', '🔐'],
  backup_created: ['System', '💾'], backup_restored: ['System', '♻️'], backup_verified: ['System', '🛡️'],
  dr_test: ['System', '🧪'], maintenance_mode_changed: ['System', '🛠️'], imported: ['System', '📥'],
  report_generated: ['Reporting', '📊'], gstin_validated: ['Compliance', '🔎'],
};

const NOTABLE = Object.keys(CATEGORY);

export async function feed(db, { limit = 200, category } = {}) {
  const p = [NOTABLE, Math.min(Number(limit) || 200, 1000)];
  const { rows } = await db.query(
    `SELECT a.created_at, a.object_type, a.object_id, a.event_type, a.message, u.name AS user_name
     FROM gst_audit_events a LEFT JOIN users u ON u.id=a.user_id
     WHERE a.event_type = ANY($1) ORDER BY a.created_at DESC LIMIT $2`, p);
  return rows
    .map((r) => {
      const [cat, icon] = CATEGORY[r.event_type] || ['Activity', '•'];
      return { when: r.created_at, category: cat, icon, event: r.event_type, title: r.message, who: r.user_name, objectType: r.object_type, objectId: r.object_id };
    })
    .filter((r) => !category || r.category === category);
}

export async function feedRows(db, opts) {
  const f = await feed(db, { ...opts, limit: 2000 });
  return f.map((r) => ({ When: r.when, Category: r.category, Activity: r.title, By: r.who || '—' }));
}
