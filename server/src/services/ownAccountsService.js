// ============================================================================
//  Own Accounts — the list of the company's OWN bank accounts (OD, current,
//  savings…). A statement line whose counterparty matches one of these is an
//  INTERNAL TRANSFER (money moving between your own accounts), not real income
//  or expense. Such lines must never create a client/vendor or post to a party
//  ledger, and must be excluded from the income/expense totals.
//
//  Detection is primarily by ACCOUNT NUMBER (reliable). A masked screenshot
//  number (e.g. "XXXX1234") still matches by trailing digits. Holder NAME is a
//  secondary hint for statements that print a name but no counter-account.
// ============================================================================

/** Reduce an account number to comparable digits only. */
export function accountDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Normalize a party/holder name for loose comparison. */
export function normalizeHolder(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|CO|COMPANY|AND|THE)\b/g, ' ')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/** Load the active own-account matchers once, for use across many lines. */
export async function loadOwnAccountMatchers(db) {
  const runner = db?.query ? db : null;
  if (!runner) return { digits: [], names: [] };
  let rows = [];
  try {
    ({ rows } = await runner.query(
      `SELECT account_number, holder_name FROM own_accounts WHERE is_active = TRUE`
    ));
  } catch { return { digits: [], names: [] }; }
  const digits = rows.map((r) => accountDigits(r.account_number)).filter((d) => d.length >= 4);
  const names = rows.map((r) => normalizeHolder(r.holder_name)).filter((n) => n.length >= 4);
  return { digits, names };
}

/**
 * Does this counterparty (account number and/or name) belong to one of our own
 * accounts? A short/masked number matches by trailing digits (min 4) so a
 * screenshot "XXXX1234" still resolves. Names must match as a whole token blob
 * to avoid false positives.
 */
export function matchesOwnAccount(matchers, { accountNumber, name } = {}) {
  if (!matchers) return false;
  const acc = accountDigits(accountNumber);
  if (acc.length >= 4) {
    for (const d of matchers.digits) {
      if (acc === d) return true;
      const short = acc.length < d.length ? acc : d;
      const long = acc.length < d.length ? d : acc;
      if (short.length >= 4 && long.endsWith(short)) return true;   // masked ↔ full
    }
  }
  const nm = normalizeHolder(name);
  if (nm.length >= 4) {
    for (const n of matchers.names) {
      if (nm === n || nm.includes(n) || n.includes(nm)) return true;
    }
  }
  return false;
}

/** Convenience: load + match in one call (for single-line paths). */
export async function isOwnAccount(db, hint) {
  const matchers = await loadOwnAccountMatchers(db);
  return matchesOwnAccount(matchers, hint);
}

// ── CRUD ────────────────────────────────────────────────────────────────────
export async function listOwnAccounts(db) {
  const { rows } = await db.query('SELECT * FROM own_accounts ORDER BY is_active DESC, created_at');
  return rows;
}

export async function createOwnAccount(db, b, userId) {
  const { rows } = await db.query(
    `INSERT INTO own_accounts (account_number, holder_name, bank_name, account_type, label, notes, created_by)
     VALUES ($1,$2,$3,COALESCE($4,'current'),$5,$6,$7) RETURNING *`,
    [String(b.account_number || '').trim(), b.holder_name || null, b.bank_name || null,
     b.account_type || null, b.label || null, b.notes || null, userId || null]
  );
  return rows[0];
}

export async function updateOwnAccount(db, id, b) {
  const { rows } = await db.query(
    `UPDATE own_accounts SET
       account_number=COALESCE($1,account_number), holder_name=COALESCE($2,holder_name),
       bank_name=COALESCE($3,bank_name), account_type=COALESCE($4,account_type),
       label=COALESCE($5,label), notes=COALESCE($6,notes), is_active=COALESCE($7,is_active),
       updated_at=now()
     WHERE id=$8 RETURNING *`,
    [b.account_number ? String(b.account_number).trim() : null, b.holder_name, b.bank_name,
     b.account_type, b.label, b.notes, b.is_active, id]
  );
  return rows[0];
}

export async function deleteOwnAccount(db, id) {
  const { rows } = await db.query('DELETE FROM own_accounts WHERE id=$1 RETURNING id', [id]);
  return rows[0];
}
